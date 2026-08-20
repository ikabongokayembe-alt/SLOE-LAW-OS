-- ============================================================================
-- MIGRATION: 0031_firm_billing.sql — customer subscription billing tracking
-- Date: 2026-08-20
-- Ported from Sloe Laboratory (os_billing model), adapted for Law OS
--
-- Tracks firm subscription tier (trial/starter/pro/business) and Stripe state.
-- Rows are created/updated exclusively by service-role edge functions and webhooks.
-- Firm principals & practice managers can read their own firm's billing record.
-- ============================================================================

CREATE TABLE IF NOT EXISTS firm_billing (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                 uuid NOT NULL UNIQUE REFERENCES firms(id) ON DELETE CASCADE,
  plan                    text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro', 'business')),
  billing_status          text NOT NULL DEFAULT 'trialing' CHECK (billing_status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  created_at              timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at              timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_firm_billing_firm_id ON firm_billing(firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_billing_customer ON firm_billing(stripe_customer_id);

-- Enable RLS
ALTER TABLE firm_billing ENABLE ROW LEVEL SECURITY;

-- Read policy: Firm principals and practice managers can view their firm's billing status
DROP POLICY IF EXISTS firm_billing_select ON firm_billing;
CREATE POLICY firm_billing_select ON firm_billing
  FOR SELECT
  USING (
    firm_id = current_firm_id()
    AND is_broad_visibility_role()
  );

-- No INSERT / UPDATE / DELETE policies — writes are strictly service-role only.
