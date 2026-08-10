-- Deadlines: the single highest-stakes screen in this whole product.
-- A missed statute-of-limitations deadline is malpractice, not just an
-- inconvenience — this is a much more serious version of Realty OS's
-- Viewings/Urgent Actions pattern, not a relabel of it.

create table if not exists deadlines (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  matter_id uuid references matters(id) on delete cascade,
  title text not null,
  deadline_type text not null default 'other' check (deadline_type in ('statute_of_limitations', 'filing', 'court_date', 'other')),
  due_date date not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'completed', 'missed')),
  assigned_to uuid references attorneys(id),
  is_critical boolean not null default false,
  reminder_days_before integer not null default 7,
  created_at timestamptz not null default now()
);

create index if not exists idx_deadlines_firm on deadlines(firm_id);
create index if not exists idx_deadlines_due_date on deadlines(due_date);

alter table deadlines enable row level security;
create policy "deadlines select" on deadlines for select using (
  firm_id = current_firm_id() and (is_broad_visibility_role() or assigned_to = current_attorney_id())
);
create policy "deadlines insert" on deadlines for insert with check (firm_id = current_firm_id());
create policy "deadlines update" on deadlines for update using (
  firm_id = current_firm_id() and (is_broad_visibility_role() or assigned_to = current_attorney_id())
);

-- Signup: creates the firm + Principal profile, and seeds a sensible
-- universal default pipeline immediately (practice_area_id = null,
-- meaning it applies firm-wide) so a new firm has a working matter
-- pipeline on day one without needing to configure anything — the same
-- "works immediately, customizable later" principle Realty OS used for
-- signup. Also seeds a starter practice-area list (General active by
-- default, others available but inactive until the firm turns them on).
create policy "authenticated can insert practice_areas via signup" on practice_areas for insert with check (auth.uid() is not null);
create policy "authenticated can insert matter_stages via signup" on matter_stages for insert with check (auth.uid() is not null);

create or replace function create_firm(p_firm_name text, p_principal_name text) returns uuid as $$
declare
  new_firm_id uuid;
  general_practice_area_id uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Profile already exists for this user';
  end if;

  insert into firms (name) values (p_firm_name) returning id into new_firm_id;

  insert into profiles (id, firm_id, role, name, email)
  values (auth.uid(), new_firm_id, 'principal', p_principal_name, auth.email());

  -- Starter practice areas: General on by default, common niches
  -- available but off until the firm actually turns them on.
  insert into practice_areas (firm_id, key, label, is_active) values
    (new_firm_id, 'general', 'General Practice', true),
    (new_firm_id, 'personal_injury', 'Personal Injury', false),
    (new_firm_id, 'corporate', 'Corporate / Transactional', false),
    (new_firm_id, 'family', 'Family Law', false),
    (new_firm_id, 'immigration', 'Immigration', false);
  select id into general_practice_area_id from practice_areas where firm_id = new_firm_id and key = 'general';

  -- Universal default pipeline (practice_area_id = null = applies to
  -- every matter at this firm regardless of practice area). A firm can
  -- add practice-area-specific stage lists later via the Matters config
  -- screen — this is just what makes intake work immediately.
  insert into matter_stages (firm_id, practice_area_id, stage_key, label, sort_order, is_initial, is_terminal) values
    (new_firm_id, null, 'intake', 'Intake', 0, true, false),
    (new_firm_id, null, 'conflict_check', 'Conflict Check', 1, true, false),
    (new_firm_id, null, 'engaged', 'Engaged', 2, false, false),
    (new_firm_id, null, 'active', 'Active', 3, false, false),
    (new_firm_id, null, 'resolution', 'Resolution', 4, false, false),
    (new_firm_id, null, 'closed', 'Closed', 5, false, true);

  return new_firm_id;
end;
$$ language plpgsql security definer;

create or replace function get_invite_email(p_token uuid) returns text as $$
  select email from invites where token = p_token and accepted_at is null and expires_at > now();
$$ language sql stable security definer;

create or replace function accept_invite(p_token uuid, p_name text) returns uuid as $$
declare
  inv invites%rowtype;
  new_attorney_id uuid;
begin
  select * into inv from invites where token = p_token and accepted_at is null;
  if not found then
    raise exception 'Invite not found or already used';
  end if;

  if inv.expires_at < now() then
    raise exception 'This invite has expired — ask a Partner or Manager to send a new one';
  end if;

  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Profile already exists for this user';
  end if;

  if inv.role in ('agent', 'principal') then
    insert into attorneys (firm_id, name)
    values (inv.firm_id, p_name)
    returning id into new_attorney_id;
  end if;

  insert into profiles (id, firm_id, attorney_id, role, name, email)
  values (auth.uid(), inv.firm_id, new_attorney_id, inv.role, p_name, auth.email());

  update invites set accepted_at = now() where id = inv.id;

  return inv.firm_id;
end;
$$ language plpgsql security definer;
