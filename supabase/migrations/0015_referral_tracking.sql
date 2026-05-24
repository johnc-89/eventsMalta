-- Referral tracking for external event links (revenue/analytics)
-- Logs each click-through to external event sources (tickets, event page)

CREATE TABLE referrals (
  id              BIGSERIAL PRIMARY KEY,
  event_id        BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_id       BIGINT REFERENCES event_sources(id) ON DELETE SET NULL,  -- which importer (if any)
  link_type       TEXT NOT NULL,  -- 'ticket_url' | 'source_url'
  clicked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,      -- logged-in user (optional)
  ip_address      INET,                                                     -- client IP for analytics
  user_agent      TEXT,                                                     -- browser/device info
  referrer        TEXT,                                                     -- HTTP referrer
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referrals_event_id ON referrals(event_id);
CREATE INDEX idx_referrals_source_id ON referrals(source_id);
CREATE INDEX idx_referrals_clicked_at ON referrals(clicked_at DESC);
CREATE INDEX idx_referrals_user_id ON referrals(user_id);

-- RLS: public can insert (on redirect), admins can read
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_referrals"
  ON referrals FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "admin_read_referrals"
  ON referrals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
    )
  );

CREATE POLICY "super_admin_delete_referrals"
  ON referrals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );
