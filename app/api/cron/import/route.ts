import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runImport } from '@/lib/importers/pipeline'
import { getPublishedSiteSettings } from '@/lib/site-settings'

// Vercel Cron endpoint — fires every hour; only does real work at the
// configured Malta-time hour (site_settings.importers.cron_hour).
// Secured by CRON_SECRET (Vercel injects Authorization: Bearer <secret>).

export const runtime = 'nodejs'
export const maxDuration = 300 // Pro plan allows 5 min; Hobby cap is 60s

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await getPublishedSiteSettings()
  if (!settings.importers.cron_enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'cron disabled' })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: sources, error } = await admin
    .from('event_sources')
    .select('id, name')
    .eq('enabled', true)
    .order('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sources || sources.length === 0) {
    return NextResponse.json({ ok: true, message: 'No enabled sources', results: [] })
  }

  const results: Array<{
    sourceId: number
    name: string
    ok: boolean
    summary?: Record<string, unknown>
    error?: string
  }> = []

  for (const source of sources) {
    try {
      const result = await runImport({
        sourceId: source.id,
        triggeredBy: 'cron:auto',
      })
      results.push({
        sourceId: source.id,
        name: source.name,
        ok: true,
        summary: {
          status: result.summary.status,
          fetched: result.summary.fetched,
          inserted: result.summary.inserted,
          updated: result.summary.updated,
          skipped: result.summary.skipped,
          excluded: result.summary.excluded,
          errored: result.summary.errored,
          rewrite_errors: result.summary.rewrite_errors,
        },
      })
    } catch (err) {
      results.push({
        sourceId: source.id,
        name: source.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Slide every event's cached date_start to its soonest-future occurrence.
  // Without this, an event's "next date" can lag by up to 24h between cron
  // runs (only re-imported events get touched by the importer itself).
  let slideUpdated: number | null = null
  let slideError: string | null = null
  try {
    const { data, error: slideErr } = await admin.rpc('slide_event_date_starts')
    if (slideErr) slideError = slideErr.message
    else if (typeof data === 'number') slideUpdated = data
  } catch (err) {
    slideError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({
    ok: true,
    results,
    slide: slideError ? { error: slideError } : { updated: slideUpdated },
  })
}
