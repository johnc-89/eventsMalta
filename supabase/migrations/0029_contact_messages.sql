-- ============================================================================
-- 0029_contact_messages.sql — /contact page submissions
-- System of record for the contact form. Rows are inserted server-side via
-- the service role (POST /api/contact) — the email to the site inbox is only
-- a notification. Admins read + triage in /admin/messages.
-- Organiser-interest submissions also create a CRM lead (done in the API
-- route, not here) and link back via lead_id.
-- Idempotent. Apply once via Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  topic       TEXT NOT NULL DEFAULT 'general'
                CHECK (topic IN ('general', 'organiser', 'listing_issue', 'press')),
  message     TEXT NOT NULL,
  -- Optional link to the listing the message is about (topic = listing_issue).
  event_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'read', 'archived')),
  -- Set when an organiser-interest submission created/matched a CRM lead.
  lead_id     BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_status_idx
  ON public.contact_messages (status, created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Inserts happen only via the service role (bypasses RLS) — deliberately no
-- INSERT policy, so the anon key can never write rows directly.
DROP POLICY IF EXISTS contact_messages_admin_select ON public.contact_messages;
CREATE POLICY contact_messages_admin_select ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.is_admin_or_super_admin());

DROP POLICY IF EXISTS contact_messages_admin_update ON public.contact_messages;
CREATE POLICY contact_messages_admin_update ON public.contact_messages
  FOR UPDATE TO authenticated
  USING      (public.is_admin_or_super_admin())
  WITH CHECK (public.is_admin_or_super_admin());

-- Done.
