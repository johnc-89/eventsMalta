-- ============================================================================
-- 0001_crm.sql — Super-admin CRM (leads + history + audit triggers)
-- Apply once: copy the whole file into Supabase Dashboard → SQL Editor → Run.
-- Idempotent (uses IF NOT EXISTS / CREATE OR REPLACE) so re-running is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. leads table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id                   BIGSERIAL PRIMARY KEY,
  name                 TEXT NOT NULL UNIQUE,
  category             TEXT,
  subtype              TEXT,
  quality              TEXT CHECK (quality IN ('High','Medium','Low')),
  status               TEXT NOT NULL DEFAULT 'Not Contacted'
                          CHECK (status IN ('Not Contacted','Contacted','Responded','Converted','Rejected')),
  contact_channel      TEXT,
  website_url          TEXT,
  instagram_url        TEXT,
  facebook_url         TEXT,
  email                TEXT,
  phone                TEXT,
  pitch                TEXT,
  notes                TEXT,
  google_search_url    TEXT,
  ig_search_url        TEXT,
  best_contact_url     TEXT,
  last_interaction_at  DATE,
  follow_up_at         DATE,
  converted_user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_status_idx     ON public.leads (status);
CREATE INDEX IF NOT EXISTS leads_quality_idx    ON public.leads (quality);
CREATE INDEX IF NOT EXISTS leads_category_idx   ON public.leads (category);
CREATE INDEX IF NOT EXISTS leads_name_lower_idx ON public.leads (LOWER(name));

-- ---------------------------------------------------------------------------
-- 2. lead_history table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_history (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     BIGINT REFERENCES public.leads(id) ON DELETE CASCADE,
  lead_name   TEXT NOT NULL,
  changed_by  TEXT NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_history_lead_id_idx     ON public.lead_history (lead_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS lead_history_changed_at_idx  ON public.lead_history (changed_at DESC);

-- ---------------------------------------------------------------------------
-- 3. updated_at touch trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_touch_updated_at ON public.leads;
CREATE TRIGGER leads_touch_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Auto-stamp last_interaction_at when status changes off 'Not Contacted'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_stamp_last_interaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'Not Contacted'
     AND NEW.last_interaction_at IS NULL THEN
    NEW.last_interaction_at := CURRENT_DATE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_stamp_last_interaction ON public.leads;
CREATE TRIGGER leads_stamp_last_interaction
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_stamp_last_interaction();

-- ---------------------------------------------------------------------------
-- 5. Audit trigger — one history row per changed field
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  actor_email TEXT;
  fields TEXT[] := ARRAY[
    'name','category','subtype','quality','status','contact_channel',
    'website_url','instagram_url','facebook_url','email','phone',
    'pitch','notes','google_search_url','ig_search_url','best_contact_url',
    'last_interaction_at','follow_up_at','converted_user_id'
  ];
  f TEXT;
  old_v TEXT;
  new_v TEXT;
BEGIN
  SELECT email INTO actor_email FROM auth.users WHERE id = auth.uid();
  IF actor_email IS NULL THEN actor_email := 'system'; END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_history (lead_id, lead_name, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.name, actor_email, '__created__', NULL, NEW.name);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOREACH f IN ARRAY fields LOOP
      EXECUTE format('SELECT ($1).%I::TEXT, ($2).%I::TEXT', f, f)
        INTO old_v, new_v
        USING OLD, NEW;
      IF old_v IS DISTINCT FROM new_v THEN
        INSERT INTO public.lead_history (lead_id, lead_name, changed_by, field_name, old_value, new_value)
        VALUES (NEW.id, NEW.name, actor_email, f, old_v, new_v);
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.lead_history (lead_id, lead_name, changed_by, field_name, old_value, new_value)
    VALUES (OLD.id, OLD.name, actor_email, '__deleted__', OLD.name, NULL);
    RETURN OLD;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS leads_audit_iud ON public.leads;
CREATE TRIGGER leads_audit_iud
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_audit();

-- ---------------------------------------------------------------------------
-- 6. Convert linking — match leads.name ↔ profiles.display_name
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_link_converted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE matched UUID;
BEGIN
  IF NEW.status = 'Converted' AND NEW.converted_user_id IS NULL THEN
    SELECT id INTO matched FROM public.profiles
      WHERE LOWER(display_name) = LOWER(NEW.name)
      LIMIT 1;
    IF matched IS NOT NULL THEN
      NEW.converted_user_id := matched;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_link_converted ON public.leads;
CREATE TRIGGER leads_link_converted
  BEFORE INSERT OR UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_link_converted();

-- Backfill on profile insert: link any lead with matching display_name
CREATE OR REPLACE FUNCTION public.profiles_backfill_lead_link()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.display_name IS NOT NULL THEN
    UPDATE public.leads
       SET converted_user_id = NEW.id
     WHERE LOWER(name) = LOWER(NEW.display_name)
       AND converted_user_id IS NULL
       AND status = 'Converted';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_backfill_lead_link ON public.profiles;
CREATE TRIGGER profiles_backfill_lead_link
  AFTER INSERT OR UPDATE OF display_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_backfill_lead_link();

-- ---------------------------------------------------------------------------
-- 7. RLS — super_admin only (today). Helper makes adding lead_viewer trivial.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

ALTER TABLE public.leads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_super_admin_all ON public.leads;
CREATE POLICY leads_super_admin_all ON public.leads
  FOR ALL TO authenticated
  USING      (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lead_history_super_admin_read ON public.lead_history;
CREATE POLICY lead_history_super_admin_read ON public.lead_history
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- History rows are written by the trigger (SECURITY DEFINER), no INSERT policy needed.

-- ---------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_history;

-- ---------------------------------------------------------------------------
-- 9. Bulk-upsert RPC (used by Import/Export & Seed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_bulk_upsert(payload JSONB)
RETURNS TABLE (inserted INT, updated INT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  ins INT := 0;
  upd INT := 0;
  rec JSONB;
  existing_id BIGINT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(payload) LOOP
    SELECT id INTO existing_id FROM public.leads
      WHERE LOWER(name) = LOWER(rec->>'name') LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO public.leads (
        name, category, subtype, quality, status, contact_channel,
        website_url, instagram_url, facebook_url, email, phone,
        pitch, notes, google_search_url, ig_search_url, best_contact_url,
        last_interaction_at, follow_up_at
      ) VALUES (
        rec->>'name', rec->>'category', rec->>'subtype',
        NULLIF(rec->>'quality',''),
        COALESCE(NULLIF(rec->>'status',''), 'Not Contacted'),
        rec->>'contact_channel',
        rec->>'website_url', rec->>'instagram_url', rec->>'facebook_url',
        rec->>'email', rec->>'phone',
        rec->>'pitch', rec->>'notes',
        rec->>'google_search_url', rec->>'ig_search_url', rec->>'best_contact_url',
        NULLIF(rec->>'last_interaction_at','')::DATE,
        NULLIF(rec->>'follow_up_at','')::DATE
      );
      ins := ins + 1;
    ELSE
      UPDATE public.leads SET
        category          = COALESCE(NULLIF(rec->>'category',''),          category),
        subtype           = COALESCE(NULLIF(rec->>'subtype',''),           subtype),
        quality           = COALESCE(NULLIF(rec->>'quality',''),           quality),
        status            = COALESCE(NULLIF(rec->>'status',''),            status),
        contact_channel   = COALESCE(NULLIF(rec->>'contact_channel',''),   contact_channel),
        website_url       = COALESCE(NULLIF(rec->>'website_url',''),       website_url),
        instagram_url     = COALESCE(NULLIF(rec->>'instagram_url',''),     instagram_url),
        facebook_url      = COALESCE(NULLIF(rec->>'facebook_url',''),      facebook_url),
        email             = COALESCE(NULLIF(rec->>'email',''),             email),
        phone             = COALESCE(NULLIF(rec->>'phone',''),             phone),
        pitch             = COALESCE(NULLIF(rec->>'pitch',''),             pitch),
        notes             = COALESCE(NULLIF(rec->>'notes',''),             notes),
        google_search_url = COALESCE(NULLIF(rec->>'google_search_url',''), google_search_url),
        ig_search_url     = COALESCE(NULLIF(rec->>'ig_search_url',''),     ig_search_url),
        best_contact_url  = COALESCE(NULLIF(rec->>'best_contact_url',''),  best_contact_url),
        last_interaction_at = COALESCE(NULLIF(rec->>'last_interaction_at','')::DATE, last_interaction_at),
        follow_up_at        = COALESCE(NULLIF(rec->>'follow_up_at','')::DATE,        follow_up_at)
      WHERE id = existing_id;
      upd := upd + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT ins, upd;
END $$;

GRANT EXECUTE ON FUNCTION public.leads_bulk_upsert(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
