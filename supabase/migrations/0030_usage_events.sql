-- ============================================================================
-- MIGRATION: 0030_usage_events.sql — usage event collection & cost analytics
-- Date: 2026-08-20
-- Ported from Sloe Laboratory (apps/tenant/migrations/20260529_c1_usage_events.sql)
--
-- Standalone usage-event log (LLM calls, tool calls, OCR extractions, etc.)
-- for capacity planning, debugging, and per-provider cost summary.
-- Data collection only — gating enforcement is handled separately.
-- Rows are written exclusively by service-role edge functions (which bypass RLS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid REFERENCES firms(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type    text NOT NULL,
  event_data    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Indexing pattern: per-firm, per-user, per-event-type (recent-first)
CREATE INDEX IF NOT EXISTS usage_events_firm_created_idx ON usage_events (firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_type_created_idx ON usage_events (event_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — Principals and Practice Managers can read usage events for their firm.
-- Users can read events created by themselves.
-- Writes are service-role-only (bypassing RLS). No INSERT/UPDATE/DELETE policy.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_read ON usage_events;
CREATE POLICY usage_events_read ON usage_events
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      firm_id IS NOT NULL
      AND firm_id = current_firm_id()
      AND is_broad_visibility_role()
    )
  );
