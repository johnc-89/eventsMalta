import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  // Verify caller is super_admin
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser(token)
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await userClient
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { targetId } = await req.json().catch(() => ({}))
  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'Missing targetId' }, { status: 400 })
  }
  if (targetId === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  // Service-role client (bypasses RLS, has admin auth API)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Block deleting another super_admin
  const { data: targetProfile } = await adminClient
    .from('profiles').select('role').eq('id', targetId).single()
  if (targetProfile?.role === 'super_admin') {
    return NextResponse.json({ error: 'Cannot delete another super admin' }, { status: 403 })
  }

  // Soft-delete their events first (so any ON DELETE CASCADE doesn't lose history)
  await adminClient.from('events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organizer_id', targetId)
    .is('deleted_at', null)

  // Hard delete from auth.users (cascades to profiles via the FK)
  const { error: delErr } = await adminClient.auth.admin.deleteUser(targetId)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
