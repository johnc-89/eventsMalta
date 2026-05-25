// Track referral click via Google Analytics 4 and redirect to external URL
// Usage: /api/referral/track?event_id=123&link_type=ticket_url
//
// This endpoint:
// 1. Sends a referral_click event to GA4 via Measurement Protocol
// 2. Redirects to the external URL

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const GA4_MEASUREMENT_ID = 'G-JQPY4CK6D4'
const GA4_API_SECRET = '8_Cxub-rT_COwY6B0c2rvA'

export async function GET(request: NextRequest) {
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

  // 1. Fetch the event and get the target URL
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, title, ticket_url, source_url')
    .eq('id', eventId)
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

  // 2. Extract client IP for GA4 (used for geolocation)
  const clientIp = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').split(',')[0]?.trim()

  // 3. Send event to GA4 (fire-and-forget, don't block redirect)
  console.log(`[GA4] Initiating referral_click: event_id=${eventId}, title=${event.title}, type=${linkType}`)
  Promise.resolve().then(() => {
    console.log(`[GA4] Sending to Measurement Protocol: ${GA4_MEASUREMENT_ID}`)
    return sendGA4Event({
      event_name: 'referral_click',
      event_id: Number(eventId),
      event_title: event.title,
      link_type: linkType,
      client_ip: clientIp || null,
    })
  }).then(() => {
    console.log(`[GA4] ✅ Event sent successfully`)
  }).catch((err) => {
    console.error('[GA4] ❌ Failed:', err instanceof Error ? err.message : String(err))
  })

  // 4. Redirect to the external URL
  return NextResponse.redirect(targetUrl, { status: 307 })
}

// Send event to Google Analytics 4 via Measurement Protocol
async function sendGA4Event(data: {
  event_name: string
  event_id: number
  event_title: string
  link_type: string
  client_ip: string | null
}): Promise<void> {
  const clientId = crypto.randomUUID()
  console.log(`[GA4] Client ID: ${clientId}`)

  const payload = {
    client_id: clientId,
    events: [
      {
        name: data.event_name,
        params: {
          event_id: String(data.event_id),
          event_title: data.event_title,
          link_type: data.link_type,
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
