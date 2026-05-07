import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  // Use the caller's JWT — the RPC checks is_super_admin() RLS-style.
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.rpc('site_settings_publish')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }

  // Bust the CDN for the homepage and any page that reads settings.
  revalidatePath('/', 'layout')

  return NextResponse.json({ ok: true, published: data })
}
