// Track referral click via Google Analytics 4 and redirect to external URL
// Usage: /api/referral/track?event_id=123&link_type=ticket_url
//
// This endpoint:
// 1. Sends a referral_click event to GA4 via Measurement Protocol
// 2. Redirects to the external URL

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientIp as getClientIp } from '@/lib/rate-limit'

const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID || 'G-JQPY4CK6D4'
const GA4_API_SECRET = process.env.GA4_API_SECRET || ''
const GA4_SESSION_COOKIE = `_ga_${GA4_MEASUREMENT_ID.replace(/^G-/, '')}`

// gtag only writes _ga after the visitor accepts analytics consent, so the
// cookie's presence doubles as the consent check and as a bot filter —
// crawlers and link-preview fetchers never run the tag, so they never get one.
// Reusing the real ids is also what keeps the hit inside the visitor's session
// instead of landing under "Unassigned" as its own one-off user.
function readGaIds(request: NextRequest): { clientId: string; sessionId: string | null } | null {
  const ga = request.cookies.get('_ga')?.value
  if (!ga) return null

  const parts = ga.split('.')
  if (parts.length < 4) return null

  return {
    clientId: parts.slice(-2).join('.'),
    sessionId: parseSessionId(request.cookies.get(GA4_SESSION_COOKIE)?.value),
  }
}

// Two formats in the wild: GS1 puts the session id in its own dot-segment,
// GS2 packs it into a $-delimited field list as "s<id>". Anything else returns
// null so we send no session_id rather than a malformed one.
function parseSessionId(cookie: string | undefined): string | null {
  const segment = cookie?.split('.')[2]
  if (!segment) return null
  if (/^\d+$/.test(segment)) return segment
  return segment.match(/^s(\d+)/)?.[1] ?? null
}

export async function GET(request: NextRequest) {
  // Unauthenticated + does a service-role DB read per hit — throttle before
  // any work so it can't be used to hammer the database.
  const rl = rateLimit('referral', getClientIp(request), 10, 10_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get('event_id')
  const linkType = searchParams.get('link_type') || 'source_url'

  if (!eventId || !Number.isInteger(Number(eventId))) {
    return NextResponse.json({ error: 'Invalid event_id' }, { status: 400 })
  }

  if (!['ticket_url', 'source_url'].includes(linkType)) {
    return NextResponse.json({ error: 'Invalid link_type' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Fetch the event and get the target URL. This uses the service-role
  //    key (bypasses RLS), so scope to publicly-visible events only —
  //    otherwise enumerating ids would leak draft/pending/rejected URLs.
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, title, ticket_url, source_url')
    .eq('id', eventId)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .single()

  if (eventErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const targetUrl = linkType === 'ticket_url' ? event.ticket_url : event.source_url
  if (!targetUrl) {
    return NextResponse.json(
      { error: `No ${linkType} available for this event` },
      { status: 404 }
    )
  }

  // Only redirect to http(s) — the URL is event-submitter-controlled, so
  // never honour javascript:/data: or other schemes through our domain.
  let parsedTarget: URL
  try {
    parsedTarget = new URL(targetUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid target URL' }, { status: 400 })
  }
  if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid target URL' }, { status: 400 })
  }

  // 2. Send event to GA4 (fire-and-forget, don't block redirect). Skipped if
  //    the API secret isn't configured, or if there are no GA cookies to
  //    attribute the hit to — the redirect still works either way.
  const gaIds = readGaIds(request)
  if (GA4_API_SECRET && gaIds) {
    console.log(`[GA4] Initiating referral_click: event_id=${eventId}, title=${event.title}, type=${linkType}`)
    Promise.resolve().then(() => {
      console.log(`[GA4] Sending to Measurement Protocol: ${GA4_MEASUREMENT_ID}`)
      return sendGA4Event({
        client_id: gaIds.clientId,
        session_id: gaIds.sessionId,
        event_id: Number(eventId),
        event_title: event.title,
        link_type: linkType,
      })
    }).then(() => {
      console.log(`[GA4] ✅ Event sent successfully`)
    }).catch((err) => {
      console.error('[GA4] ❌ Failed:', err instanceof Error ? err.message : String(err))
    })
  }

  // 3. Redirect to the external URL
  return NextResponse.redirect(parsedTarget.toString(), { status: 307 })
}

// Send event to Google Analytics 4 via Measurement Protocol
async function sendGA4Event(data: {
  client_id: string
  session_id: string | null
  event_id: number
  event_title: string
  link_type: string
}): Promise<void> {
  console.log(`[GA4] Client ID: ${data.client_id}, session: ${data.session_id ?? '(none)'}`)

  const payload = {
    client_id: data.client_id,
    events: [
      {
        name: 'referral_click',
        params: {
          event_id: String(data.event_id),
          event_title: data.event_title,
          link_type: data.link_type,
          // GA4 drops a Measurement Protocol hit out of session-scoped reports
          // without these two, which is what filed every referral_click under
          // the "Unassigned" channel.
          ...(data.session_id ? { session_id: data.session_id } : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  }

  const url = new URL('https://www.google-analytics.com/mp/collect')
  url.searchParams.set('measurement_id', GA4_MEASUREMENT_ID)
  url.searchParams.set('api_secret', GA4_API_SECRET)

  console.log(`[GA4] Payload: ${JSON.stringify(payload)}`)
  console.log(`[GA4] URL: ${url.toString().replace(GA4_API_SECRET, '***')}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    console.log(`[GA4] Response status: ${response.status}, body: ${text || '(empty)'}`)

    if (!response.ok) {
      throw new Error(`GA4 HTTP ${response.status}: ${text}`)
    }
  } catch (err) {
    console.error(`[GA4] Send failed:`, err instanceof Error ? err.message : err)
    throw err
  }
}
