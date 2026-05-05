import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface InviteResult {
  email: string
  status: 'invited' | 'already_exists' | 'error'
  error?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
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

  // Verify caller is admin (using their JWT against the public schema)
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse emails
  const body = await req.json().catch(() => ({}))
  const raw: string = (body.emails ?? '').toString()
  const emails = Array.from(
    new Set(
      raw
        .split(/[,\n;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  )

  if (emails.length === 0) {
    return NextResponse.json({ error: 'No emails provided' }, { status: 400 })
  }
  if (emails.length > 100) {
    return NextResponse.json({ error: 'Max 100 invites per request' }, { status: 400 })
  }

  // Service role client (bypasses RLS, has admin-API access)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'
  const results: InviteResult[] = []

  for (const email of emails) {
    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: 'error', error: 'Invalid email format' })
      continue
    }
    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${siteUrl}/login` },
    )
    if (inviteErr) {
      const msg = inviteErr.message.toLowerCase()
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        results.push({ email, status: 'already_exists' })
      } else {
        results.push({ email, status: 'error', error: inviteErr.message })
      }
    } else {
      results.push({ email, status: 'invited' })
    }
  }

  return NextResponse.json({ results })
}
