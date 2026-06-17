import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listAdapterNames } from '@/lib/importers/registry'

// Returns the adapter ids that are actually wired up in the importer registry,
// so the admin UI can enable "Run now" based on server truth rather than a
// hand-maintained list that has to be kept in sync (and was easy to forget).
// Adding an adapter now only needs its registry entry. Super-admin only.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
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

  return NextResponse.json({ adapters: listAdapterNames() })
}
