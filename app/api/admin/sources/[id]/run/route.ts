import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runImport } from '@/lib/importers/pipeline'

// Manually run an import for one source. Super-admin only.
// Synchronous: caller waits for completion (~5-30 seconds depending on
// site speed and number of new events). The per-run cap inside the pipeline
// (20 events) keeps us inside Vercel's function timeout.

export const runtime = 'nodejs'
// Allow up to 60s (hobby plan limit). Bump to 300 if you're on Pro.
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sourceId = Number(params.id)
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 })
  }

  // -------- Auth: super_admin only --------
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser(token)
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // -------- Run the import --------
  try {
    const result = await runImport({
      sourceId,
      triggeredBy: `manual:${user.email ?? user.id}`,
    })
    return NextResponse.json({
      ok: true,
      run_id: result.runId,
      summary: {
        status: result.summary.status,
        fetched: result.summary.fetched,
        inserted: result.summary.inserted,
        updated: result.summary.updated,
        skipped: result.summary.skipped,
        excluded: result.summary.excluded,
        errored: result.summary.errored,
      },
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}
