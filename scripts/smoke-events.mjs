#!/usr/bin/env node
/**
 * Events smoke test — runs before every push (.githooks/pre-push) and in CI
 * (.github/workflows/ci.yml). It pings the live Supabase project two ways:
 *
 *   1. as a normal visitor (anon key)   — must be able to read approved events,
 *      and must NOT be able to read unapproved ones.
 *   2. as an admin (service-role key)   — must be able to read the events table.
 *
 * This guards the regression where an RLS / column-grant change made
 * `SELECT … FROM events` fail for anonymous visitors with
 * `42501 permission denied for table profiles` (see migration 0024): every
 * logged-out visitor saw zero events. The anon check below reproduces that
 * exact read path, so it fails loudly if it ever breaks again.
 *
 * Note: the service-role key bypasses RLS, so the admin check only proves the
 * events table is reachable and populated — not that admin RLS policies work.
 *
 * Run:  npm run smoke
 * Env (process.env, falling back to .env.local for local runs):
 *   NEXT_PUBLIC_SUPABASE_URL        (required)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY   (required — visitor check)
 *   SUPABASE_SERVICE_ROLE_KEY       (required — admin check)
 *
 * Exit 0 = all checks passed; exit 1 = something is broken (blocks push / CI).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Load .env.local for local runs without clobbering real env (CI sets process.env).
function loadEnvLocal() {
  const p = join(root, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] != null) continue
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const failures = []
const fail = (m) => { failures.push(m); console.error(`  ✗ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

if (!URL || !ANON) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.')
  process.exit(1)
}

async function checkVisitor() {
  console.log('\n[normal visitor — anon key]')
  const sb = createClient(URL, ANON, { auth: { persistSession: false } })

  // The exact read 0021 broke: an anonymous SELECT on events must succeed.
  const approved = await sb.from('events')
    .select('id,title,date_start')
    .eq('status', 'approved').is('deleted_at', null).limit(5)
  if (approved.error) fail(`visitor cannot read approved events: ${approved.error.code} ${approved.error.message}`)
  else if (!approved.data?.length) fail('visitor read of approved events returned 0 rows (expected ≥1)')
  else ok(`visitor sees ${approved.data.length} approved event(s) (e.g. "${approved.data[0].title}")`)

  // RLS must still hide unapproved events from anon (catch an over-correction).
  const hidden = await sb.from('events')
    .select('id').in('status', ['draft', 'pending_review', 'rejected']).limit(1)
  if (hidden.error) fail(`visitor unapproved-events probe errored: ${hidden.error.code} ${hidden.error.message}`)
  else if (hidden.data?.length) fail(`visitor can see ${hidden.data.length} unapproved event(s) — RLS leak!`)
  else ok('visitor cannot see draft/pending/rejected events (RLS intact)')
}

async function checkAdmin() {
  console.log('\n[admin — service-role key]')
  if (!SERVICE) { fail('SUPABASE_SERVICE_ROLE_KEY not set — admin check could not run'); return }
  const sb = createClient(URL, SERVICE, { auth: { persistSession: false } })

  const all = await sb.from('events').select('id,status').limit(5)
  if (all.error) fail(`admin cannot read events: ${all.error.code} ${all.error.message}`)
  else if (!all.data?.length) fail('admin read of events returned 0 rows (expected ≥1)')
  else ok(`admin can read the events table (${all.data.length} row(s) sampled)`)
}

console.log(`Events smoke test → ${URL}`)
await checkVisitor()
await checkAdmin()

if (failures.length) {
  console.error(`\n❌ smoke test FAILED (${failures.length} issue${failures.length > 1 ? 's' : ''}). Events may be broken — do not deploy.`)
  console.error('   Emergency bypass for push only: git push --no-verify')
  process.exit(1)
}
console.log('\n✅ smoke test passed — events readable by visitor and admin.')
