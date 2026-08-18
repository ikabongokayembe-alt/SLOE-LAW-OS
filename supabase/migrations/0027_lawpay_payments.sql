-- LawPay (AffiniPay/8am) payment collection on generated invoices
-- (product-audit Gap 2). Payment collection was deliberately scoped as
-- integrate-not-build: legal trust accounting (IOLTA) is a real ethics
-- compliance area, not a feature to reinvent. This app NEVER handles raw
-- card data -- a client pays on LawPay's own hosted payment page
-- (https://developers.8am.com/merchant/hosted-payment-pages.html,
-- confirmed real documentation), which is the entire reason that page
-- exists: PCI/trust-account compliance stays on LawPay's side, never
-- touches this database or this app's servers.
--
-- Real prerequisite, not a code blocker: this needs an actual LawPay
-- merchant account and API credentials to go live (same as
-- Composio/Resend). Everything here is built and correct against
-- LawPay's real, confirmed public documentation
-- (developers.8am.com / developers.affinipay.com, the current LawPay/
-- AffiniPay developer portal, rebranded "8am") -- but one real gap in
-- what's PUBLICLY documented is flagged honestly below rather than
-- papered over with an invented contract.

-- The firm's real hosted-payment-page base URL (e.g.
-- https://secure.lawpay.com/pay/yourfirm) -- merchant-specific, entered
-- once a real LawPay account exists (Firm Settings). Not a secret: it's
-- the literal public link a client is meant to click, same as the
-- existing intake_token link being freely shareable (migration 0026).
-- The LawPay SECRET key used for authenticated API calls is NOT stored
-- here or anywhere client-readable -- it's an edge function secret
-- (LAWPAY_SECRET_KEY), same pattern as GEMINI_API_KEY/COMPOSIO_API_KEY/
-- DROPBOX_SIGN_API_KEY already use.
alter table firms add column if not exists lawpay_payment_page_url text;

-- Payment status on a generated invoice (see migration 0025). 'unpaid'
-- covers both "not yet paid" and "in progress" -- this integration
-- reports confirmed completion only, never a provisional/pending state,
-- since LawPay's own Charge object status values (AUTHORIZED, COMPLETED,
-- VOIDED -- confirmed from developers.8am.com/reference/api.html) are
-- the closest thing to a source of truth this app has visibility into.
alter table invoices add column if not exists status text not null default 'unpaid' check (status in ('unpaid', 'paid'));
alter table invoices add column if not exists paid_at timestamptz;
-- LawPay's charge id, if/when a webhook or manual reconciliation ever
-- supplies one. Nullable: a manually-recorded payment (see
-- marked_paid_by below) never has one, and that is a legitimate, honest
-- state, not a gap to hide.
alter table invoices add column if not exists lawpay_charge_id text;
-- Set ONLY by the manual "Mark as paid" staff action, never by the
-- webhook path (which has no human actor) -- this is what distinguishes
-- "LawPay confirmed this" from "a person at the firm asserted this" when
-- looking at an invoice later.
alter table invoices add column if not exists marked_paid_by uuid references profiles(id) on delete set null;

-- invoices never had an UPDATE policy at all (migration 0025 only added
-- select/insert/delete) -- needed now for the manual mark-paid action
-- to work. Principal/manager-gated: marking a real invoice paid is a
-- money-handling action, appropriately more restricted than most writes
-- in this schema (matches practice_areas/matter_stages management).
create policy "invoices update" on invoices for update using (
  firm_id = current_firm_id() and current_app_role() in ('principal', 'manager')
);

-- ── Honesty gap, stated plainly ─────────────────────────────────────
-- LawPay's publicly accessible developer docs document webhook
-- DELIVERY mechanics for merchant-onboarding events (Event URL config,
-- HTTP POST, must return 200, retried every 10 min up to 25 attempts --
-- developers.8am.com/reference/api.html) but the specific event
-- name/payload shape for a COMPLETED PAYMENT is not in what's publicly
-- reachable without a real, logged-in merchant account (the developer
-- portal itself says full detail is "available only to users with the
-- Administrator or Developer role and to the merchant owner" --
-- developers.8am.com/connect/connect-merchant.html). No HMAC/signature
-- verification scheme is documented publicly either.
--
-- Rather than invent a plausible-looking event shape, the lawpay-webhook
-- edge function (see supabase/functions/lawpay-webhook) persists the
-- RAW payload of every call it receives here, unconditionally, whether
-- or not it can confidently match it to an invoice. Once Isaac has a
-- real account and a real webhook fires, this table shows the actual
-- shape LawPay sends, so the function's defensive parsing can be
-- corrected against ground truth instead of a guess.
create table if not exists lawpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  raw_payload jsonb not null,
  matched_invoice_id uuid references invoices(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

alter table lawpay_webhook_events enable row level security;
-- Written only by the lawpay-webhook edge function via the service-role
-- key (bypasses RLS entirely, same as every other edge-function write in
-- this app -- see dropbox-sign/index.ts's own comment on this). No
-- insert/update/delete policy for anyone else. Read access is
-- deliberately NOT scoped to current_firm_id(): this is operational
-- integration-health data, same category as an audit/debug log, not
-- firm business data -- and a raw payload that failed to match any
-- invoice has no firm to scope it to in the first place.
create policy "lawpay_webhook_events select" on lawpay_webhook_events for select using (
  current_app_role() in ('principal', 'manager')
);
