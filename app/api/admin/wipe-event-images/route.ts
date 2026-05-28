import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Super-admin only. Lists every object in the `event-images` bucket and
// deletes them via the Storage API (raw SQL DELETE FROM storage.objects is
// blocked by Supabase's protect_delete() trigger).
//
// Pagination: Storage.list() returns max 1000 per page. We iterate.

export const runtime = 'nodejs'
export const maxDuration = 300

const BUCKET = 'event-images'
const PAGE_SIZE = 1000

export async function POST(req: NextRequest) {
  // -------------------- auth --------------------
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // -------------------- work --------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Recursively collect every path under the bucket. Storage.list() needs
  // a directory; passing '' lists the root. We walk subfolders depth-first.
  const allPaths: string[] = []
  const errors: string[] = []

  async function collect(prefix: string): Promise<void> {
    let offset = 0
    while (true) {
      const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) {
        errors.push(`list "${prefix}" failed: ${error.message}`)
        return
      }
      if (!data || data.length === 0) return

      for (const entry of data) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name
        // Files have an id; folders (prefixes) don't.
        if (entry.id) {
          allPaths.push(fullPath)
        } else {
          await collect(fullPath)
        }
      }
      if (data.length < PAGE_SIZE) return
      offset += data.length
    }
  }

  await collect('')

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  if (allPaths.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, message: 'Bucket already empty.' })
  }

  // The remove API accepts an array of paths but caps at ~1000 per call.
  let deleted = 0
  for (let i = 0; i < allPaths.length; i += PAGE_SIZE) {
    const chunk = allPaths.slice(i, i + PAGE_SIZE)
    const { error: removeErr, data: removed } = await admin.storage.from(BUCKET).remove(chunk)
    if (removeErr) {
      errors.push(`remove chunk ${i}-${i + chunk.length} failed: ${removeErr.message}`)
      continue
    }
    deleted += removed?.length ?? chunk.length
  }

  if (errors.length > 0) {
    return NextResponse.json({
      ok: false,
      deleted,
      remaining: allPaths.length - deleted,
      errors,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted })
}
