import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ContactTopic } from '@/types'

// Public endpoint for the /contact form. Spam defence is layered:
// honeypot field + minimum fill time + per-IP rate limit. Rows are the
// system of record (contact_messages via service role); the Resend email
// to the site inbox is only a notification. Organiser-interest topics
// also create a CRM lead so outreach starts from /admin/crm.

const TOPICS: ContactTopic[] = ['general', 'organiser', 'listing_issue', 'press']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_FILL_MS = 3000
const RATE_LIMIT = 5              // submissions per IP per window
const RATE_WINDOW_MS = 60 * 60 * 1000

// Per-instance memory — resets on cold start, which is fine as a first line
// of defence on a low-volume form.
const submissionLog = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (submissionLog.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_LIMIT) return true
  recent.push(now)
  submissionLog.set(ip, recent)
  if (submissionLog.size > 5000) submissionLog.clear()
  return false
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function clean(value: unknown, maxLen: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : ''
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many messages — please try again later.' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))

  // Honeypot: a visually hidden "website" field real users never fill.
  // Answer 200 so bots don't learn they were caught.
  if (clean(body.website, 200)) {
    return NextResponse.json({ ok: true })
  }
  const elapsed = Number(body.elapsed_ms)
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return NextResponse.json({ ok: true })
  }

  const name = clean(body.name, 120)
  const email = clean(body.email, 200).toLowerCase()
  const topic: ContactTopic = TOPICS.includes(body.topic) ? body.topic : 'general'
  const message = clean(body.message, 5000)
  const eventUrl = clean(body.event_url, 500)

  if (!name || !message) {
    return NextResponse.json({ error: 'Please fill in your name and message.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Contact form is not configured.' }, { status: 500 })
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Organiser interest → CRM lead (skip silently if one already exists;
  // leads.name is unique and outreach history shouldn't be overwritten).
  let leadId: number | null = null
  if (topic === 'organiser') {
    const { data: existing } = await admin
      .from('leads')
      .select('id')
      .ilike('name', name.replace(/[\\%_]/g, '\\$&'))
      .limit(1)
      .maybeSingle()
    if (existing) {
      leadId = existing.id
    } else {
      const { data: created } = await admin
        .from('leads')
        .insert({
          name,
          category: 'Inbound',
          subtype: 'Contact form',
          status: 'Responded',
          contact_channel: 'Contact form',
          email,
          notes: message.slice(0, 2000),
          last_interaction_at: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single()
      leadId = created?.id ?? null
    }
  }

  const { error: insertError } = await admin.from('contact_messages').insert({
    name,
    email,
    topic,
    message,
    event_url: eventUrl || null,
    lead_id: leadId,
  })
  if (insertError) {
    console.error('contact_messages insert failed:', insertError.message)
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }

  // Notification email — best effort; the row above is the record.
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    let toAddress = process.env.ADMIN_EMAIL
    try {
      const { data: settingsRow } = await admin
        .from('site_settings_public')
        .select('published')
        .single()
      const configured = (settingsRow?.published as any)?.footer?.contact_email
      if (typeof configured === 'string' && EMAIL_RE.test(configured)) toAddress = configured
    } catch { /* fall back to ADMIN_EMAIL */ }

    if (toAddress) {
      const fromAddress = process.env.RESEND_FROM || 'Events Malta <noreply@eventsmalta.org>'
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'
      const topicLabel = topic.replace(/_/g, ' ')
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: toAddress,
          reply_to: email,
          subject: `Contact form (${topicLabel}): ${name}`,
          html: `
            <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
            <p><strong>Topic:</strong> ${escapeHtml(topicLabel)}</p>
            ${eventUrl ? `<p><strong>Listing:</strong> ${escapeHtml(eventUrl)}</p>` : ''}
            <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
            ${leadId ? `<p><a href="${siteUrl}/admin/crm">View lead in CRM →</a></p>` : ''}
            <p><a href="${siteUrl}/admin/messages">Open messages inbox →</a></p>
          `,
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
