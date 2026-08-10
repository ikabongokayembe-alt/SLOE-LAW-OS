-- Law OS core: firms (tenant) + profiles + roles.
-- Directly adapted from Realty OS's proven brokerage/profile/RLS pattern —
-- the multi-tenant auth shape is genuinely vertical-agnostic. Only the
-- role list changed to match how a law firm is actually staffed.

create extension if not exists "pgcrypto";

create type user_role as enum (
  'principal',   -- Partner: owns client relationships, final authority
  'agent',       -- Associate: does the case work, most frequent user
  'manager',     -- Practice Manager: operational oversight
  'paralegal',   -- Drafting/filing/research support
  'billing',     -- Trust accounting & invoicing — NEW, no real estate equivalent
  'reception'    -- Intake & scheduling
);

create table if not exists firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  attorney_id uuid, -- set when role = 'agent' or 'principal' (links to the attorneys roster below); FK added after attorneys table exists
  role user_role not null,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  email text not null,
  role user_role not null,
  invited_by uuid references profiles(id) on delete set null,
  token uuid not null default gen_random_uuid(),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique(firm_id, email)
);

create index if not exists idx_profiles_firm on profiles(firm_id);
create index if not exists idx_invites_firm on invites(firm_id);
create index if not exists idx_invites_token on invites(token);

create or replace function lowercase_email() returns trigger as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_invites_lowercase_email on invites;
create trigger trg_invites_lowercase_email before insert or update on invites
  for each row execute function lowercase_email();

drop trigger if exists trg_profiles_lowercase_email on profiles;
create trigger trg_profiles_lowercase_email before insert or update on profiles
  for each row execute function lowercase_email();

-- Helper functions (security definer, avoids recursive RLS) — same pattern
-- as Realty OS, current_role renamed current_app_role to avoid the
-- reserved-keyword collision caught the first time this pattern was built.
create or replace function current_firm_id() returns uuid as $$
  select firm_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_app_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_attorney_id() returns uuid as $$
  select attorney_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function is_broad_visibility_role() returns boolean as $$
  select current_app_role() in ('principal', 'manager', 'billing', 'reception');
$$ language sql stable security definer;

alter table firms enable row level security;
alter table profiles enable row level security;
alter table invites enable row level security;

create policy "firms self" on firms for select using (id = current_firm_id());
create policy "authenticated can create firm" on firms for insert with check (auth.uid() is not null);

create policy "profiles self or team-visible" on profiles for select using (
  id = auth.uid() or (current_app_role() in ('principal','manager') and firm_id = current_firm_id())
);
create policy "profiles self update" on profiles for update using (
  id = auth.uid()
  or (current_app_role() in ('principal','manager') and firm_id = current_firm_id() and role != 'principal')
);
create policy "profiles insert self" on profiles for insert with check (id = auth.uid());
create policy "profiles principal manager delete" on profiles for delete using (
  current_app_role() in ('principal','manager') and firm_id = current_firm_id() and role != 'principal' and id != auth.uid()
);

create policy "invites team-visible" on invites for select using (
  firm_id = current_firm_id() and current_app_role() in ('principal','manager')
);
create policy "invites team-create" on invites for insert with check (
  firm_id = current_firm_id() and current_app_role() in ('principal','manager')
);
create policy "invites team-delete" on invites for delete using (
  firm_id = current_firm_id() and current_app_role() in ('principal','manager')
);
