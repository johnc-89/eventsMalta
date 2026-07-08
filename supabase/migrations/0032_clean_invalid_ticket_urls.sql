-- Clean up malformed events.ticket_url values that Google Search Console flagged
-- as "Invalid URL in field 'url' (in 'offers')".
--
-- Before this session, ticket_url was stored raw from user submissions and
-- importers with no absolute-URL validation, so values like bare domains
-- ("www.tickets.mt"), relative paths, mailto:/tel:, or whitespace-wrapped
-- strings reached the Event JSON-LD `offers.url`. The render path now falls back
-- to the canonical event URL via sanitizeHttpUrl() (lib/url.ts), and both write
-- paths (EventForm, importer pipeline) validate on input. This scrubs the
-- existing rows so the stored value — used by the outbound "Buy tickets"
-- redirect (/api/referral/track) — is also a valid absolute http(s) URL or null.
--
-- Anything not beginning with http:// or https:// (after trimming leading
-- whitespace) is set to NULL. The app's sanitizer handles the rarer
-- scheme-present-but-still-malformed cases at render time.

UPDATE events
SET ticket_url = NULL
WHERE ticket_url IS NOT NULL
  AND ltrim(ticket_url) !~* '^https?://';
