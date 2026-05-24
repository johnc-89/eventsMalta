// Track referral click and redirect to external URL
// Usage: /api/referral/track?event_id=123&link_type=ticket_url
//
// This endpoint:
// 1. Logs the click to the referrals table (with IP, user-agent, etc.)
// 2. Redirects to the external URL

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

  // 1. Fetch the event and get the target URL + source info
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, title, ticket_url, source_url, source_id, status')
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

  // 2. Extract client info
  const ipAddress = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').split(',')[0]?.trim()
  const userAgent = request.headers.get('user-agent') || ''
  const referrer = request.headers.get('referer') || ''

  // 3. Get user ID if authenticated (from session cookie or header)
  let userId: string | null = null
  // Note: In a real scenario, you'd parse the auth token here.
  // For now, we'll just log unauthenticated clicks.

  // 4. Log to referrals table (fire-and-forget, don't block redirect)
  // Async fire-and-forget logging
  Promise.resolve().then(() =>
    supabase.from('referrals').insert({
      event_id: Number(eventId),
      source_id: event.source_id,
      link_type: linkType,
      user_id: userId,
      ip_address: ipAddress || null,
      user_agent: userAgent,
      referrer,
    })
  ).catch(() => {}) // silently ignore errors

  // 5. Redirect to the external URL
  return NextResponse.redirect(targetUrl, { status: 307 })
}
