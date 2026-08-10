-- The genuinely new part of Law OS, versus Realty OS: a configurable
-- pipeline (so practice-area differences are data, not hardcoded
-- branches) and a REAL, database-enforced conflict-check gate — not just
-- a UI reminder. A matter cannot progress past intake without a cleared
-- or explicitly waived conflict check. This is the one mechanism in this
-- whole vertical that has zero real estate equivalent and needed actual
-- new architecture, not a relabel.

-- Roster of attorneys/staff who matters get assigned to — same shape and
-- purpose as Realty OS's `agents` table (assignment target, deal-count
-- style stats), renamed to fit the domain.
create table if not exists attorneys (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null,
  bar_number text,
  specialization text,
  matters_active integer not null default 0,
  matters_closed_ytd integer not null default 0
);

alter table profiles add constraint profiles_attorney_id_fkey
  foreign key (attorney_id) references attorneys(id) on delete set null;

-- Configurable per-firm practice areas — a firm picks which ones they
-- handle; this drives which default stage list a new matter gets.
create table if not exists practice_areas (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  key text not null,
  label text not null,
  is_active boolean not null default true,
  unique(firm_id, key)
);

-- THE configurable pipeline. practice_area_id = null means "applies to
-- every matter at this firm regardless of practice area" (the common
-- case for a small/general firm); a non-null value scopes a stage list
-- to one specific practice area, for firms that genuinely need different
-- pipelines per niche (e.g. personal injury vs. corporate at the same
-- firm). is_initial marks the pre-conflict-check intake stage(s); the
-- gate below enforces that a matter can't leave an is_initial stage
-- without a cleared/waived conflict check.
create table if not exists matter_stages (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  practice_area_id uuid references practice_areas(id) on delete cascade,
  stage_key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_initial boolean not null default false,
  is_terminal boolean not null default false
);

create index if not exists idx_matter_stages_firm on matter_stages(firm_id);

-- The conflict-check index: every party (client, opposing party,
-- witness, related entity) ever entered into the system at this firm,
-- searchable across every matter — this is what a conflict check
-- actually searches against. No real estate equivalent.
create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null,
  party_type text not null default 'individual' check (party_type in ('individual', 'organization')),
  aliases text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_parties_firm on parties(firm_id);
create index if not exists idx_parties_name on parties using gin (to_tsvector('english', name));

create table if not exists conflict_checks (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  matter_id uuid, -- nullable: a check can run during intake, before a matter formally exists
  searched_name text not null,
  matched_party_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'cleared', 'flagged', 'waived')),
  cleared_by uuid references profiles(id) on delete set null,
  cleared_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_conflict_checks_firm on conflict_checks(firm_id);

create table if not exists matters (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  title text not null,
  practice_area_id uuid references practice_areas(id),
  stage_id uuid not null references matter_stages(id),
  client_party_id uuid references parties(id),
  assigned_attorney_id uuid references attorneys(id),
  status text not null default 'active' check (status in ('active', 'on_hold', 'closed')),
  billing_type text not null default 'hourly' check (billing_type in ('hourly', 'contingency', 'flat_fee', 'retainer')),
  conflict_check_id uuid references conflict_checks(id),
  opened_date date not null default current_date,
  closed_date date,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_matters_firm on matters(firm_id);
create index if not exists idx_matters_stage on matters(stage_id);

-- Additional parties on a matter beyond the primary client — opposing
-- parties, witnesses, co-counsel. This is also part of what a conflict
-- check searches (an opposing party in one matter could be a
-- prospective client in another — the classic conflict scenario).
create table if not exists matter_parties (
  matter_id uuid not null references matters(id) on delete cascade,
  party_id uuid not null references parties(id) on delete cascade,
  role_in_matter text not null check (role_in_matter in ('client', 'opposing', 'witness', 'co_counsel', 'other')),
  primary key (matter_id, party_id, role_in_matter)
);

-- THE ENFORCED GATE: a matter cannot move out of an is_initial stage
-- without a cleared or explicitly waived conflict check. This is a real
-- database constraint, not just a UI suggestion — the frontend can't
-- accidentally (or a bug can't silently) skip it.
create or replace function enforce_conflict_check_gate() returns trigger as $$
declare
  old_stage matter_stages%rowtype;
  new_stage matter_stages%rowtype;
  check_status text;
begin
  select * into old_stage from matter_stages where id = old.stage_id;
  select * into new_stage from matter_stages where id = new.stage_id;

  if old_stage.is_initial and not new_stage.is_initial then
    if new.conflict_check_id is null then
      raise exception 'Cannot move matter out of intake without a conflict check on file';
    end if;
    select status into check_status from conflict_checks where id = new.conflict_check_id;
    if check_status not in ('cleared', 'waived') then
      raise exception 'Conflict check must be cleared or explicitly waived before this matter can proceed (current status: %)', check_status;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_conflict_check_gate on matters;
create trigger trg_conflict_check_gate
  before update of stage_id on matters
  for each row execute function enforce_conflict_check_gate();

-- RLS: same shape as Realty OS — broad-visibility roles see everything
-- at the firm, Associates (agent role) see only their own assigned
-- matters, matching current_attorney_id().
alter table attorneys enable row level security;
alter table practice_areas enable row level security;
alter table matter_stages enable row level security;
alter table parties enable row level security;
alter table conflict_checks enable row level security;
alter table matters enable row level security;
alter table matter_parties enable row level security;

create policy "attorneys firm select" on attorneys for select using (firm_id = current_firm_id());
create policy "attorneys principal manage insert" on attorneys for insert with check (firm_id = current_firm_id() and current_app_role() in ('principal','manager'));
create policy "attorneys principal manage update" on attorneys for update using (firm_id = current_firm_id() and current_app_role() in ('principal','manager'));

create policy "practice_areas select" on practice_areas for select using (firm_id = current_firm_id());
create policy "practice_areas manage" on practice_areas for insert with check (firm_id = current_firm_id() and current_app_role() in ('principal','manager'));
create policy "practice_areas manage update" on practice_areas for update using (firm_id = current_firm_id() and current_app_role() in ('principal','manager'));

create policy "matter_stages select" on matter_stages for select using (firm_id = current_firm_id());
create policy "matter_stages manage" on matter_stages for insert with check (firm_id = current_firm_id() and current_app_role() in ('principal','manager'));
create policy "matter_stages manage update" on matter_stages for update using (firm_id = current_firm_id() and current_app_role() in ('principal','manager'));
create policy "matter_stages manage delete" on matter_stages for delete using (firm_id = current_firm_id() and current_app_role() in ('principal','manager'));

-- Conflict checking is firm-wide visibility for everyone regardless of
-- role — the entire point is that ANY attorney at the firm can be
-- checked against ANY party, so this can't be scoped down to "your own"
-- the way matters are.
create policy "parties firm select" on parties for select using (firm_id = current_firm_id());
create policy "parties firm insert" on parties for insert with check (firm_id = current_firm_id());
create policy "conflict_checks firm select" on conflict_checks for select using (firm_id = current_firm_id());
create policy "conflict_checks firm insert" on conflict_checks for insert with check (firm_id = current_firm_id());
create policy "conflict_checks firm update" on conflict_checks for update using (firm_id = current_firm_id());

create policy "matters select" on matters for select using (
  firm_id = current_firm_id() and (is_broad_visibility_role() or assigned_attorney_id = current_attorney_id())
);
create policy "matters insert" on matters for insert with check (firm_id = current_firm_id());
create policy "matters update" on matters for update using (
  firm_id = current_firm_id() and (is_broad_visibility_role() or assigned_attorney_id = current_attorney_id())
);

create policy "matter_parties select" on matter_parties for select using (
  matter_id in (select id from matters)
);
create policy "matter_parties insert" on matter_parties for insert with check (
  matter_id in (select id from matters)
);
