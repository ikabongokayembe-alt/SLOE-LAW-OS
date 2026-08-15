-- Billing Phase 1: time capture and export only. No payment processing,
-- no invoicing that collects money, no trust/IOLTA accounting — that's a
-- deliberately deferred Phase 2, pending real compliance review and a
-- proper trust-compliant processor. This is just: log time against a
-- matter, view/edit/delete it, export a CSV a firm can hand to whatever
-- they currently use for invoicing.
--
-- ─────────────────────────────────────────────────────────────────────
-- Column choices, matched to existing convention rather than invented:
--   * attorney_id references attorneys(id) — same as matters.
--     assigned_attorney_id / deadlines.assigned_to: WHOSE time this is,
--     for billing/attribution purposes. Nullable — not every firm member
--     who logs time necessarily has an attorneys row (paralegals never
--     get one created on invite-accept per migration 0006), and the
--     person logging an entry isn't always the person it's billed under
--     (an assistant logging on an attorney's behalf).
--   * created_by references profiles(id) — same convention as
--     documents.uploaded_by / conflict_checks.cleared_by: WHO actually
--     created this row, reliably identifies any authenticated user
--     regardless of role. This is the field the write RLS policy below
--     is scoped to, not attorney_id.
--   * duration stored in minutes (integer), not hours/float, to avoid
--     float-rounding drift on repeated edits — converted to hours only
--     at display/export time.
--   * currency is copied from firms.currency AT INSERT TIME by the
--     frontend (never asked per-entry) — this is a deliberate historical
--     snapshot, not a live join: if a firm's currency setting ever
--     changes later, past entries should keep showing what was actually
--     true when the work was billed, not silently get relabeled.
--   * No `amount` column — duration_minutes * rate is fully derivable at
--     read time (see src/lib/timeEntries.ts). Storing a computed value
--     here would drift the moment either input is edited without also
--     recomputing it, which is exactly the kind of billing-record bug
--     this phase needs to not have.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  matter_id uuid not null references matters(id) on delete cascade,
  attorney_id uuid references attorneys(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  date date not null,
  duration_minutes integer not null check (duration_minutes > 0),
  rate numeric,
  currency text,
  description text,
  billable boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_time_entries_firm on time_entries(firm_id);
create index if not exists idx_time_entries_matter on time_entries(matter_id);
create index if not exists idx_time_entries_date on time_entries(date);

alter table time_entries enable row level security;

-- Read: firm-wide, matching the team-visibility fix's principle (0006) —
-- row visibility is a tenancy question here, not a role or ownership
-- question. Anyone in the firm can see time logged by anyone else at the
-- firm, same as matters/deadlines now.
drop policy if exists "time_entries select" on time_entries;
create policy "time_entries select" on time_entries for select using (
  firm_id = current_firm_id()
);

-- Insert: open to any firm member, no role gate — matches
-- documents/deadlines/matters insert policies (logging your own time
-- isn't a privileged action).
drop policy if exists "time_entries insert" on time_entries;
create policy "time_entries insert" on time_entries for insert with check (
  firm_id = current_firm_id()
);

-- Update/delete: the entry's own creator, OR principal/manager — this is
-- the EXACT predicate documents already uses for delete
-- (`uploaded_by = auth.uid() or current_app_role() in ('principal','manager')`),
-- reused here rather than invented. Firm-wide-open write would let
-- anyone alter anyone else's billing record with no trail; creator-only
-- would mean a principal/manager couldn't fix a paralegal's mis-logged
-- entry without going through them — this precedent already resolves
-- that tradeoff correctly elsewhere in this schema.
drop policy if exists "time_entries update" on time_entries;
create policy "time_entries update" on time_entries for update using (
  firm_id = current_firm_id() and (created_by = auth.uid() or current_app_role() in ('principal', 'manager'))
);
drop policy if exists "time_entries delete" on time_entries;
create policy "time_entries delete" on time_entries for delete using (
  firm_id = current_firm_id() and (created_by = auth.uid() or current_app_role() in ('principal', 'manager'))
);
