-- Audit log: who changed what, when, across the six tables where that
-- history actually matters for malpractice defense / bar inquiries —
-- matters, deadlines, parties, conflict_checks, documents, time_entries.
-- `created_at` exists on every table already, but nothing today can
-- answer "who changed this deadline's date, from what, to what" — this
-- migration is purely additive to fix that.
--
-- Triggers, not application-level logging. A client-side "also write an
-- audit row" call can be forgotten, throw, or just not run because a
-- write happened through some other path (direct SQL, a future admin
-- tool, a bug). A trigger fires on the actual write to the actual table,
-- so there's no path that bypasses it.
--
-- ─────────────────────────────────────────────────────────────────────
-- audit_log itself
-- ─────────────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- Who was authenticated when this happened. Nullable on purpose: a
  -- service-role write (an edge function, a future migration backfill)
  -- has no auth.uid() to attribute to, and a nulled changed_by is a more
  -- honest record of that than silently mis-attributing it to whoever
  -- happens to be reading the log later.
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);

create index if not exists idx_audit_log_firm on audit_log(firm_id);
create index if not exists idx_audit_log_record on audit_log(table_name, record_id);
create index if not exists idx_audit_log_changed_at on audit_log(changed_at desc);

alter table audit_log enable row level security;

-- Read: firm-wide, same tenancy-not-role principle as every other table
-- in this app (documents, time_entries, matter_communications, ...).
create policy "audit_log select" on audit_log for select using (
  firm_id = current_firm_id()
);

-- No insert/update/delete policy AT ALL for normal roles. The only path
-- that ever writes a row here is the trigger function below, which runs
-- SECURITY DEFINER as the table owner and so bypasses RLS entirely — an
-- authenticated user (any role, including principal) has no policy that
-- permits them to insert, update, or delete a row directly. An audit log
-- a firm member can edit isn't an audit log.

-- ─────────────────────────────────────────────────────────────────────
-- Generic trigger function — one function, six triggers. Uses
-- TG_TABLE_NAME/TG_OP/OLD/NEW rather than one bespoke function per
-- table, so adding a 7th audited table later is one more `create
-- trigger` line, not a copy-pasted function.
--
-- SECURITY DEFINER + owned by the migration role (table owner, which on
-- Supabase bypasses RLS) is what makes the "no insert policy" above
-- still work: the trigger's insert into audit_log runs with the
-- definer's privileges, not the calling user's, so it succeeds
-- regardless of the calling user's role or the missing insert policy.
-- ─────────────────────────────────────────────────────────────────────
create or replace function audit_trigger_fn() returns trigger as $$
declare
  v_firm_id uuid;
begin
  v_firm_id := (case when TG_OP = 'DELETE' then (to_jsonb(OLD) ->> 'firm_id') else (to_jsonb(NEW) ->> 'firm_id') end)::uuid;

  insert into audit_log (firm_id, table_name, record_id, action, changed_by, old_values, new_values)
  values (
    v_firm_id,
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then OLD.id else NEW.id end,
    lower(TG_OP),
    auth.uid(),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$ language plpgsql security definer;

drop trigger if exists audit_matters on matters;
create trigger audit_matters after insert or update or delete on matters
  for each row execute function audit_trigger_fn();

drop trigger if exists audit_deadlines on deadlines;
create trigger audit_deadlines after insert or update or delete on deadlines
  for each row execute function audit_trigger_fn();

drop trigger if exists audit_parties on parties;
create trigger audit_parties after insert or update or delete on parties
  for each row execute function audit_trigger_fn();

drop trigger if exists audit_conflict_checks on conflict_checks;
create trigger audit_conflict_checks after insert or update or delete on conflict_checks
  for each row execute function audit_trigger_fn();

drop trigger if exists audit_documents on documents;
create trigger audit_documents after insert or update or delete on documents
  for each row execute function audit_trigger_fn();

drop trigger if exists audit_time_entries on time_entries;
create trigger audit_time_entries after insert or update or delete on time_entries
  for each row execute function audit_trigger_fn();
