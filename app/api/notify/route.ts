import { NextRequest, NextResponse } from 'next/server'

type NotifyPayload =
  | { type: 'event_submitted'; eventTitle: string; organizerEmail: string; adminEmail: string }
  | { type: 'event_approved'; eventTitle: string; eventSlug: string; organizerEmail: string }
  | { type: 'event_rejected'; eventTitle: string; reason: string; organizerEmail: string }

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Silently skip if not configured — email is non-critical
    return NextResponse.json({ ok: true, skipped: true })
  }

  const payload: NotifyPayload = await req.json()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.com'
  const fromAddress = process.env.RESEND_FROM || 'Events Malta <noreply@eventsmalta.org>'

  const emails: { to: string; subject: string; html: string }[] = []

  if (payload.type === 'event_submitted') {
    // Notify admin
    emails.push({
      to: payload.adminEmail,
      subject: `New event pending review: ${payload.eventTitle}`,
      html: `
        <p>A new event has been submitted and is waiting for your approval.</p>
        <p><strong>Event:</strong> ${payload.eventTitle}</p>
        <p><strong>Submitted by:</strong> ${payload.organizerEmail}</p>
        <p><a href="${siteUrl}/admin">Review in admin dashboard →</a></p>
      `,
    })
  } else if (payload.type === 'event_approved') {
    emails.push({
      to: payload.organizerEmail,
      subject: `Your event is live: ${payload.eventTitle}`,
      html: `
        <p>Great news! Your event has been approved and is now live on Events Malta.</p>
        <p><strong>${payload.eventTitle}</strong></p>
        <p><a href="${siteUrl}/events/${payload.eventSlug}">View your event →</a></p>
      `,
    })
  } else if (payload.type === 'event_rejected') {
    emails.push({
      to: payload.organizerEmail,
      subject: `Update on your event: ${payload.eventTitle}`,
      html: `
        <p>Your event was not approved at this time.</p>
        <p><strong>Event:</strong> ${payload.eventTitle}</p>
        <p><strong>Reason:</strong> ${payload.reason}</p>
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
