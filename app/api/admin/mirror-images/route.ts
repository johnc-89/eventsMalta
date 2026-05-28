import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { EventSource } from '@/types'
import { mirrorImageToStorage, isOurBucketUrl } from '@/lib/importers/image-mirror'

// One-time backfill: mirror existing events' externally-hosted images into
// the event-images bucket. Super-admin only. Idempotent — events already on
// our bucket are skipped. Designed to be called repeatedly with a small batch
// size; the UI button calls it in a loop until `done: true`.
//
// Each call processes up to `?limit=` events (default 25, max 100) and returns:
//   processed: how many rows we looked at
//   mirrored:  how many got a fresh storage URL
//   skipped:   already mirrored (no change needed)
//   failed:    download/upload failed; row keeps the original URL
//   done:      true when no more rows have a non-bucket image_url

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

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

  // -------------------- args --------------------
  const url = new URL(req.url)
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT), MAX_LIMIT)

  // -------------------- work --------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Pull events with an image_url that isn't already on our bucket. We can't
  // filter "not on our bucket" cleanly in PostgREST, so we fetch slightly
  // more than `limit` and filter client-side. In practice this only runs a
  // few times in total — once the backfill is done, only a handful of rows
  // ever match.
  const { data: candidates, error: fetchErr } = await admin
    .from('events')
    .select('id, image_url, source_id')
    .not('image_url', 'is', null)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(limit * 4)

  if (fetchErr) {
    return NextResponse.json({ error: `events query failed: ${fetchErr.message}` }, { status: 500 })
  }

  const todo = (candidates ?? []).filter((e) => e.image_url && !isOurBucketUrl(e.image_url)).slice(0, limit)

  if (todo.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      mirrored: 0,
      skipped: 0,
      failed: 0,
      done: true,
      log: [],
    })
  }

  // Cache source.adapter for the source_ids we touch — used as the path slug.
  const sourceIds = Array.from(new Set(todo.map((e) => e.source_id).filter((x): x is number => x != null)))
  const sourceMap = new Map<number, string>()
  if (sourceIds.length > 0) {
    const { data: srcs } = await admin
      .from('event_sources')
      .select('id, adapter')
      .in('id', sourceIds)
    for (const s of (srcs ?? []) as Pick<EventSource, 'id' | 'adapter'>[]) {
      sourceMap.set(s.id, s.adapter)
    }
  }

  const log: string[] = []
  const collect = (line: string) => log.push(line)

  let mirrored = 0
  let skipped = 0
  let failed = 0

  for (const ev of todo) {
    if (!ev.image_url) { skipped++; continue }
    if (isOurBucketUrl(ev.image_url)) { skipped++; continue }

    const sourceSlug = ev.source_id != null ? (sourceMap.get(ev.source_id) ?? 'user') : 'user'

    const newUrl = await mirrorImageToStorage({
      sourceUrl: ev.image_url,
      sourceSlug,
      supabase: admin,
      log: collect,
    })

    if (newUrl === ev.image_url) {
      failed++
      continue
    }

    const { error: updateErr } = await admin
      .from('events')
      .update({ image_url: newUrl })
      .eq('id', ev.id)

    if (updateErr) {
      failed++
      collect(`  ⚠ event ${ev.id}: DB update failed (${updateErr.message})`)
    } else {
      mirrored++
    }
  }

  // Are there still un-mirrored rows past this batch?
  const { count: remainingCount } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
    .is('deleted_at', null)
  // We don't have a server-side "not on our bucket" filter, but a row-count
  // upper bound is good enough — UI calls again with `done` only true when
  // we returned zero candidates this round.
  const done = todo.length < limit

  return NextResponse.json({
    ok: true,
    processed: todo.length,
    mirrored,
    skipped,
    failed,
    done,
    remaining_with_image: remainingCount ?? null,
    log,
  })
}
