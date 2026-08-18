-- Real invoice generation from unbilled time (product-audit Gap 2 —
-- Time already tracked and flagged unbilled hours, see
-- riskSignals.ts's findUnbilledMatters, but there was no path from
-- "flagged" to an actual invoice). Explicitly the Phase 2 this firm's own
-- migration 0013 comment deferred: "invoicing that collects money" is
-- still out of scope (that's the separate LawPay task) — this is
-- generation and record-keeping only, no payment status.
--
-- One row per generated invoice. The PDF itself lives in the existing
-- matter-documents storage bucket (reusing that infrastructure, not the
-- `documents` TABLE — an invoice's structured fields, below, don't fit
-- that table's generic file-metadata shape cleanly). storage_path follows
-- the same {firm_id}/{matter_id}/... prefix convention migration 0005's
-- storage RLS already enforces, so no new bucket or storage policy is
-- needed — just a new path segment (.../invoices/<file>).
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  matter_id uuid not null references matters(id) on delete cascade,
  invoice_number text not null,
  issued_date date not null default current_date,
  -- Denormalized from the covered time_entries at generation time,
  -- deliberately: an invoice is a snapshot of what was billed, not a live
  -- view. If a covered entry were edited afterward, this total must NOT
  -- silently drift — same principle as time_entries.currency being copied
  -- at insert time rather than live-joined (see migration 0013).
  total_minutes integer not null,
  -- Null only if none of the covered entries had a rate set (nothing to
  -- sum) — never a fabricated number standing in for "unknown".
  total_amount numeric,
  currency text,
  storage_path text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoices_firm on invoices(firm_id);
create index if not exists idx_invoices_matter on invoices(matter_id);

-- Which time entries this invoice actually covers — the mechanism that
-- lets a covered entry drop out of findUnbilledMatters (see
-- lib/riskSignals.ts) immediately once invoiced. `on delete set null`,
-- not cascade: deleting an invoice record should return its entries to
-- the unbilled pool, never silently delete real logged time.
alter table time_entries add column if not exists invoice_id uuid references invoices(id) on delete set null;
create index if not exists idx_time_entries_invoice on time_entries(invoice_id);

alter table invoices enable row level security;

-- Same firm-wide-visibility, creator-or-principal/manager-write shape as
-- time_entries itself (migration 0013) — an invoice is a billing record
-- about time entries, not a more privileged object than the entries it
-- covers.
create policy "invoices select" on invoices for select using (
  firm_id = current_firm_id()
);
create policy "invoices insert" on invoices for insert with check (
  firm_id = current_firm_id()
);
create policy "invoices delete" on invoices for delete using (
  firm_id = current_firm_id() and (created_by = auth.uid() or current_app_role() in ('principal', 'manager'))
);
