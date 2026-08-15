-- CSV import tooling: bulk-create parties/matters/deadlines from a
-- spreadsheet export (Clio, MyCase, etc.) without hand-entering every
-- record — the biggest switching-cost wall for a firm leaving another
-- product. Purely additive.
--
-- ─────────────────────────────────────────────────────────────────────
-- 1. import_batches — one row per completed import run, so a bad import
-- can be identified and undone as a unit (tag-and-rollback, not a
-- record-by-record hunt). Firm-scoped, principal/manager-gated on
-- insert/select/delete — import is a firm-level action reachable from
-- Settings, same gate as Settings itself and as practice_areas/
-- attorneys management.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  entity_type text not null check (entity_type in ('parties', 'matters', 'deadlines')),
  row_count integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_batches_firm on import_batches(firm_id);

alter table import_batches enable row level security;

drop policy if exists "import_batches select" on import_batches;
create policy "import_batches select" on import_batches for select using (
  firm_id = current_firm_id() and current_app_role() in ('principal', 'manager')
);
drop policy if exists "import_batches insert" on import_batches;
create policy "import_batches insert" on import_batches for insert with check (
  firm_id = current_firm_id() and current_app_role() in ('principal', 'manager')
);
drop policy if exists "import_batches delete" on import_batches;
create policy "import_batches delete" on import_batches for delete using (
  firm_id = current_firm_id() and current_app_role() in ('principal', 'manager')
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. import_batch_id on the three importable entities. Nullable —
-- everything created outside of an import (the overwhelming majority of
-- existing data) stays null, meaning "not from an import," not "from an
-- unknown import." ON DELETE SET NULL (not CASCADE): deleting the
-- import_batches tracking row must never silently delete real firm data
-- as a side effect — rollback (removing the actual imported rows) is a
-- separate, explicit, intentional action in the frontend, not implied by
-- removing the batch record.
-- ─────────────────────────────────────────────────────────────────────
alter table parties add column if not exists import_batch_id uuid references import_batches(id) on delete set null;
alter table matters add column if not exists import_batch_id uuid references import_batches(id) on delete set null;
alter table deadlines add column if not exists import_batch_id uuid references import_batches(id) on delete set null;

create index if not exists idx_parties_import_batch on parties(import_batch_id);
create index if not exists idx_matters_import_batch on matters(import_batch_id);
create index if not exists idx_deadlines_import_batch on deadlines(import_batch_id);
