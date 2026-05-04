import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type NotifyPayload =
  | { type: 'event_submitted'; eventId: number }
  | { type: 'event_approved'; eventId: number }
  | { type: 'event_rejected'; eventId: number; reason: string }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const payload: NotifyPayload = await req.json()

  // Look up event server-side — never trust client-supplied email/title
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, organizer_id')
    .eq('id', payload.eventId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const isAdmin = profile?.role === 'admin'
  const isOwner = event.organizer_id === user.id

  // Get organizer email via SECURITY DEFINER function (admin-gated server-side)
  // For event_submitted, the user IS the organizer, so use their session email
  let organizerEmail: string | undefined
  if (payload.type === 'event_submitted') {
    organizerEmail = user.email
  } else if (isAdmin) {
    const { data: emailResult } = await supabase.rpc('admin_get_user_email', {
      target_id: event.organizer_id,
    })
    organizerEmail = emailResult ?? undefined
  }

  // Authorization rules
  if (payload.type === 'event_submitted' && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if ((payload.type === 'event_approved' || payload.type === 'event_rejected') && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'
  const fromAddress = process.env.RESEND_FROM || 'Events Malta <noreply@eventsmalta.org>'
  const adminEmail = process.env.ADMIN_EMAIL

  const safeTitle = escapeHtml(event.title)
  const emails: { to: string; subject: string; html: string }[] = []

  if (payload.type === 'event_submitted' && adminEmail) {
    emails.push({
      to: adminEmail,
      subject: `New event pending review: ${event.title}`,
      html: `
        <p>A new event has been submitted and is waiting for your approval.</p>
        <p><strong>Event:</strong> ${safeTitle}</p>
        <p><strong>Submitted by:</strong> ${escapeHtml(user.email || '')}</p>
        <p><a href="${siteUrl}/admin">Review in admin dashboard →</a></p>
      `,
    })
  } else if (payload.type === 'event_approved' && organizerEmail) {
    emails.push({
      to: organizerEmail,
      subject: `Your event is live: ${event.title}`,
      html: `
        <p>Great news! Your event has been approved and is now live on Events Malta.</p>
        <p><strong>${safeTitle}</strong></p>
        <p><a href="${siteUrl}/events/${escapeHtml(event.slug)}">View your event →</a></p>
      `,
    })
  } else if (payload.type === 'event_rejected' && organizerEmail) {
    const safeReason = escapeHtml(payload.reason || '').slice(0, 1000)
    emails.push({
      to: organizerEmail,
      subject: `Update on your event: ${event.title}`,
      html: `
        <p>Your event was not approved at this time.</p>
        <p><strong>Event:</strong> ${safeTitle}</p>
        <p><strong>Reason:</strong> ${safeReason}</p>
        <p>You can edit and resubmit your event from your <a href="${siteUrl}/profile">profile page</a>.</p>
      `,
    })
  }

  for (const email of emails) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: email.to,
        subject: email.subject,
        html: email.html,
      }),
    })
  }

  return NextResponse.json({ ok: true })
}
