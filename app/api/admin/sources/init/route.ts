import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// One-time setup: creates the dedicated "aggregator" profile that will own
// every event imported from external sources. Super-admin only. Idempotent:
// safe to call multiple times — if the user already exists we just return its
// id without creating duplicates.
//
// The user is created with email_confirm=true (no verification needed) and a
// long random password it can never use to log in. It exists purely as a
// foreign-key target for `events.organizer_id` on imported rows.
//
// The resulting UUID is written into BOTH `site_settings.draft.importers
// .aggregator_user_id` and `site_settings.published.importers.aggregator_user_id`
// so the importer pipeline can read it from the public view without waiting
// for a manual publish step.

export const runtime = 'nodejs'

const AGGREGATOR_EMAIL_DOMAIN = 'noreply.eventsmalta.org'
const AGGREGATOR_EMAIL = `aggregator@${AGGREGATOR_EMAIL_DOMAIN}`
const AGGREGATOR_DISPLAY_NAME = 'Events Malta'

function randomPassword(): string {
  // 64 hex chars of entropy — nobody will ever enter this.
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  // ------------------------------------------------------------------------
  // 1. Verify caller is super_admin
  // ------------------------------------------------------------------------
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    )
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: callerProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (callerProfile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ------------------------------------------------------------------------
  // 2. Idempotency: did a previous run already store the aggregator id?
  // ------------------------------------------------------------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: settingsRow } = await admin
    .from('site_settings')
    .select('draft, published')
    .eq('id', 1)
    .single()

  const existingId =
    (settingsRow?.published as any)?.importers?.aggregator_user_id ||
    (settingsRow?.draft as any)?.importers?.aggregator_user_id ||
    null

  if (existingId) {
    // Confirm the profile still exists; if not, fall through to recreate.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', existingId)
      .maybeSingle()
    if (existingProfile) {
      return NextResponse.json({
        ok: true,
        created: false,
        aggregator_user_id: existingId,
        display_name: existingProfile.display_name,
      })
    }
    // Otherwise: stored id is stale, continue to (re)create below.
  }

  // ------------------------------------------------------------------------
  // 3. Find or create the auth user
  // ------------------------------------------------------------------------
  let aggregatorId: string | null = null

  // Look up by email first — handles the case where a previous attempt
  // created the auth user but failed to persist the id in settings.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listErr) {
    return NextResponse.json({ error: `auth.listUsers failed: ${listErr.message}` }, { status: 500 })
  }
  const found = list?.users.find((u) => u.email?.toLowerCase() === AGGREGATOR_EMAIL.toLowerCase())
  if (found) {
    aggregatorId = found.id
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: AGGREGATOR_EMAIL,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { display_name: AGGREGATOR_DISPLAY_NAME, is_bot: true },
    })
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: `Could not create aggregator user: ${createErr?.message ?? 'unknown'}` },
        { status: 500 },
      )
    }
    aggregatorId = created.user.id
  }

  // ------------------------------------------------------------------------
  // 4. Upsert the profile row (the project's signup trigger creates a default
  //    profile; we overwrite display_name + role to mark it as the aggregator).
  // ------------------------------------------------------------------------
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(
      {
        id: aggregatorId,
        email: AGGREGATOR_EMAIL,
        display_name: AGGREGATOR_DISPLAY_NAME,
        role: 'trusted_uploader',
      },
      { onConflict: 'id' },
    )
  if (profileErr) {
    return NextResponse.json(
      { error: `Could not upsert aggregator profile: ${profileErr.message}` },
      { status: 500 },
    )
  }

  // ------------------------------------------------------------------------
  // 5. Persist the id into site_settings (draft AND published).
  // ------------------------------------------------------------------------
  const draftWith = setAggregatorId((settingsRow?.draft as any) ?? {}, aggregatorId)
  const publishedWith = setAggregatorId((settingsRow?.published as any) ?? {}, aggregatorId)

  const { error: settingsErr } = await admin
    .from('site_settings')
    .update({ draft: draftWith, published: publishedWith })
    .eq('id', 1)
  if (settingsErr) {
    return NextResponse.json(
      { error: `Could not persist aggregator id in site_settings: ${settingsErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    created: true,
    aggregator_user_id: aggregatorId,
    display_name: AGGREGATOR_DISPLAY_NAME,
  })
}

function setAggregatorId(settings: Record<string, any>, id: string): Record<string, any> {
  const importers = { ...(settings.importers ?? {}) }
  importers.aggregator_user_id = id
  return { ...settings, importers }
}
