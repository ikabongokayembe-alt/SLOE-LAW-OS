-- Client Portal MVP: read-only client access to their own matter(s) and
-- explicitly-shared documents. Deliberately narrow, per the task's own
-- scope boundary — no payments (waits on Billing Phase 2's compliance
-- review; nothing here touches money), no e-signature, no client-to-firm
-- messaging, no client uploads.
--
-- A client is NOT a firm member — never gets a `profiles` row (which
-- carries a staff role like principal/paralegal). Client identity is
-- scoped to a `parties` record instead: `client_users.party_id` is the
-- ONLY thing that determines what a client can see, and a client sees
-- every matter where matters.client_party_id matches THAT party — not
-- one specific matter — since the same client is often the party on
-- more than one matter at a firm (see the task's own "matter(s)").
create table if not exists client_users (
  id uuid primary key references auth.users(id) on delete cascade,
  party_id uuid not null references parties(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
-- One portal login per party for this MVP — the simplest correct model.
-- A party needing a second login (e.g. two spouses on a joint matter,
-- each wanting their own account) is a real future need, not this pass.
create unique index if not exists idx_client_users_party on client_users(party_id);

drop trigger if exists client_users_lowercase_email on client_users;
create trigger client_users_lowercase_email before insert or update on client_users
  for each row execute function lowercase_email();

alter table client_users enable row level security;
-- A client can read their own row (the app needs it after login to
-- resolve party_id/email) — nothing else.
create policy "client_users select self" on client_users for select using (id = auth.uid());
-- Firm staff can see which parties at their OWN firm already have portal
-- access, so the invite UI can show "already invited" instead of
-- silently hitting the unique(party_id) constraint.
create policy "client_users select staff" on client_users for select using (
  party_id in (select id from parties where firm_id = current_firm_id())
);
-- No insert/update/delete policy for anyone, staff included — the only
-- writer is accept_client_invite() below, SECURITY DEFINER. A client
-- account isn't something even a principal edits directly.

-- Portal invites — same token+signup shape as the existing staff
-- `invites` table (migration 0001/0003's create_firm/accept_invite
-- pattern), kept as a SEPARATE table rather than reused: a client invite
-- has no `role` (clients don't have staff roles) and is tied to a party,
-- not an email+role pair.
create table if not exists client_invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  party_id uuid not null references parties(id) on delete cascade,
  email text not null,
  invited_by uuid references profiles(id) on delete set null,
  token uuid not null default gen_random_uuid(),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);
create index if not exists idx_client_invites_firm on client_invites(firm_id);
create index if not exists idx_client_invites_token on client_invites(token);

drop trigger if exists client_invites_lowercase_email on client_invites;
create trigger client_invites_lowercase_email before insert or update on client_invites
  for each row execute function lowercase_email();

alter table client_invites enable row level security;
create policy "client_invites select" on client_invites for select using (firm_id = current_firm_id());
create policy "client_invites insert" on client_invites for insert with check (
  firm_id = current_firm_id() and party_id in (select id from parties where firm_id = current_firm_id())
);
create policy "client_invites delete" on client_invites for delete using (firm_id = current_firm_id());
-- No update policy: accept_client_invite() (SECURITY DEFINER, below)
-- is the only thing that ever sets accepted_at.

-- Sharing flag — nothing is client-visible by default. A firm has to
-- actively choose to share each document; a document uploaded today
-- with no thought given to client-sharing stays invisible to any client
-- until someone explicitly flips this.
alter table documents add column if not exists client_visible boolean not null default false;

-- ── RPCs — mirror get_invite_email/accept_invite's exact shape ────────
create or replace function get_client_invite_email(p_token uuid) returns text as $$
  select email from client_invites where token = p_token and accepted_at is null and expires_at > now();
$$ language sql stable security definer;

create or replace function accept_client_invite(p_token uuid) returns uuid as $$
declare
  inv client_invites%rowtype;
begin
  select * into inv from client_invites where token = p_token and accepted_at is null;
  if not found then
    raise exception 'Invite not found or already used';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite has expired — ask the firm to send a new one';
  end if;
  if exists (select 1 from client_users where id = auth.uid()) then
    raise exception 'This account is already linked to a portal client';
  end if;
  if exists (select 1 from client_users where party_id = inv.party_id) then
    raise exception 'This client already has a portal account';
  end if;

  insert into client_users (id, party_id, email) values (auth.uid(), inv.party_id, inv.email);
  update client_invites set accepted_at = now() where id = inv.id;

  return inv.party_id;
end;
$$ language plpgsql security definer;

-- ── Helper: the calling client's own party_id — null for anyone who
-- isn't a signed-in client (staff, anon, or a signed-in client mid-
-- signup before their row exists). Same security-definer pattern as
-- current_firm_id() etc. (migration 0001) — avoids recursive RLS.
create or replace function current_client_party_id() returns uuid as $$
  select party_id from client_users where id = auth.uid();
$$ language sql stable security definer;

-- ── Client read access — ADDITIONAL permissive policies layered on top
-- of the existing staff ones. Postgres RLS policies are OR'd together,
-- so these can only ADD visibility for a client session, never take
-- anything away from staff. A client session never resolves
-- current_firm_id() (no profiles row exists for them), so these two
-- policies are the ONLY way a client sees anything at all — and both
-- are gated strictly through matters.client_party_id = this one
-- client's own party_id. A party belongs to exactly one firm, so this
-- is airtight against cross-firm leakage without needing a separate
-- firm_id check: no matter in a different firm could ever reference
-- this client's party_id, because staff at that other firm never had
-- read access to this party to reference it in the first place.
create policy "matters select client" on matters for select using (
  client_party_id = current_client_party_id()
);
create policy "documents select client" on documents for select using (
  client_visible = true and matter_id in (
    select id from matters where client_party_id = current_client_party_id()
  )
);
-- The portal shows a matter's STAGE (Intake/Engaged/Active/...), not
-- just its coarser status — "plain, non-legal-jargon language, not the
-- internal stage keys" per the task means mapping stage_key client-side
-- (see PortalDashboard.tsx's STAGE_LABELS), which first requires reading
-- the stage row at all. Scoped to only the stage(s) their own matter(s)
-- actually use, not the firm's whole pipeline.
create policy "matter_stages select client" on matter_stages for select using (
  id in (select stage_id from matters where client_party_id = current_client_party_id())
);
-- Firm name (for "Welcome to X's client portal") and the client's own
-- party row (their own display name) — both otherwise firm-staff-only
-- (see "firms self" in migration 0001, "parties firm select" in 0002).
-- Scoped to exactly one row each: their own firm, their own party.
create policy "firms select client" on firms for select using (
  id in (select firm_id from parties where id = current_client_party_id())
);
create policy "parties select client self" on parties for select using (
  id = current_client_party_id()
);
-- Deliberately NOT extending client read to deadlines/time_entries/
-- parties/conflict_checks/matter_communications/audit_log — out of
-- scope for this MVP (matter status + explicitly-shared documents only,
-- per the task). No client policy on any of those tables at all.
