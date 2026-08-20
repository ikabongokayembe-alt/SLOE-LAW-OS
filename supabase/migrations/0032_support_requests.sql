-- ============================================================================
-- MIGRATION: 0032_support_requests.sql — customer support request tracking
-- Date: 2026-08-20
--
-- Tracks customer support requests submitted from within the app workspace.
-- RLS allows users to insert and read support requests for their own firm.
-- Status updates (open/resolved) are restricted to service-role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid REFERENCES firms(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject     text NOT NULL,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'in_progress')),
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_support_requests_firm ON support_requests(firm_id);
CREATE INDEX IF NOT EXISTS idx_support_requests_user ON support_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status);

-- Enable RLS
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

-- Read policy: users can read support requests for their firm or created by themselves
DROP POLICY IF EXISTS support_requests_select ON support_requests;
CREATE POLICY support_requests_select ON support_requests
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      firm_id IS NOT NULL
      AND firm_id = current_firm_id()
    )
  );

-- Insert policy: authenticated users can insert support requests for their firm
DROP POLICY IF EXISTS support_requests_insert ON support_requests;
CREATE POLICY support_requests_insert ON support_requests
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (
      firm_id IS NOT NULL
      AND firm_id = current_firm_id()
    )
  );

-- No UPDATE or DELETE policy — status updates are service-role only.
