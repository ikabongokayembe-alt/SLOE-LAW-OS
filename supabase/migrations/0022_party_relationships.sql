-- Relationship graph between parties, for conflict checking beyond
-- exact-name matching.
--
-- NOT YET APPLIED ANYWHERE. Handed over as SQL. Nothing in the frontend
-- reads it yet, so applying this alone is inert: it adds structure and
-- changes no existing behaviour.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY A TABLE AND NOT COLUMNS ON parties
--
-- The obvious version is `alter table parties add column employer_name
-- text`. It looks cheaper and is worse in the way that matters here:
-- a free-text employer never joins. "Acme Corp", "Acme Corp.", "ACME
-- Corporation" and "Acme" would be four different employers, so the one
-- question conflict checking actually asks — does this name connect to
-- anyone already in our data — cannot be answered by an equality test.
-- A relationship has to point at a ROW to be traversable.
--
-- parties already models organisations (party_type = 'organization'),
-- so an employer, parent company or affiliated entity is just another
-- party row. This table connects them. That also means an entity gains
-- history the moment it is referenced: the second matter involving the
-- same employer finds the existing row rather than creating a twin.
--
-- ─────────────────────────────────────────────────────────────────────
-- DIRECTION
--
-- Edges are DIRECTED and read in one fixed direction:
--
--     <party_id> is the <relationship> of <related_party_id>
--
-- so ('Jane Doe', 'employee_of', 'Acme Corp') reads "Jane Doe is the
-- employee_of Acme Corp". Inverses are NOT stored as second rows —
-- storing both directions means two rows to keep in sync and a silent
-- contradiction the first time only one is updated. Traversal queries
-- union both columns instead, which is a query concern, not a storage
-- one. `relationship_inverse()` below names the mirror label for display
-- so the UI never has to hardcode that mapping.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT CLAIM
--
-- A row here is a RELATIONSHIP, never a conflict. Whether a relationship
-- creates a disqualifying conflict is a professional judgement that
-- depends on jurisdiction, the nature of the representation, consent and
-- screening — none of which this schema knows. The detector built on top
-- must surface the PATH ("this party's employer already appears as the
-- opposing party on Lopez — Divorce") and let the attorney judge it, in
-- the same way the SOL engine cites only what it can verify. Any UI that
-- renders one of these rows as "conflict found" would be the same
-- fabrication problem this layer has avoided throughout.
--
-- Cold start: this is empty until someone records relationships, so the
-- detector will correctly find nothing at first. That is the same
-- honest gap as the stage-norm baseline, and the answer is the same —
-- capture it at intake, do not invent a substitute signal.
-- ─────────────────────────────────────────────────────────────────────

-- Text + check rather than a new enum type, matching
-- documents.extraction_status (0017) and signature_requests.status
-- (0020). Adding a relationship kind then needs a migration either way;
-- this avoids a type to maintain alongside it.
--
-- The list is deliberately about ECONOMIC AND CONTROL relationships,
-- which is what conflict screening turns on, plus the family tie that
-- matters constantly in this product's primary practice area. It is not
-- a general-purpose social graph.
create table if not exists party_relationships (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  party_id uuid not null references parties(id) on delete cascade,
  related_party_id uuid not null references parties(id) on delete cascade,
  relationship text not null check (relationship in (
    'employee_of',        -- individual works for organisation
    'officer_of',         -- director/officer — control, not just employment
    'owner_of',           -- equity holder
    'subsidiary_of',      -- organisation controlled by organisation
    'affiliate_of',       -- related entity, no control asserted
    'family_of',          -- spouse, parent, child, sibling
    'business_partner_of',
    'counsel_for',        -- prior or current representation by other counsel
    'other'
  )),
  -- Free text for the nuance the enum deliberately doesn't carry
  -- ("former employer, left 2024"). Read by humans, never parsed.
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  -- A party cannot be related to itself: it is always meaningless and
  -- would make traversal loop.
  constraint party_relationships_no_self check (party_id <> related_party_id),
  -- One edge per (pair, kind). Someone can be both 'employee_of' and
  -- 'officer_of' the same company — those are genuinely different facts —
  -- but recording 'employee_of' twice is duplication, and the conflict
  -- UI would then show the same path twice.
  constraint party_relationships_unique unique (party_id, related_party_id, relationship)
);

-- Traversal runs from BOTH ends: "who is connected to this party" must
-- find edges where the party sits on either side. Two indexes rather
-- than one, since neither column is a prefix of a useful composite here.
create index if not exists idx_party_relationships_party on party_relationships(party_id);
create index if not exists idx_party_relationships_related on party_relationships(related_party_id);
create index if not exists idx_party_relationships_firm on party_relationships(firm_id);

-- Reject edges whose two ends belong to different firms. RLS already
-- prevents a caller from SEEING another firm's parties, but the service
-- role bypasses RLS entirely, so without this a server-side insert could
-- silently create a cross-tenant edge — and a conflict check that
-- traverses it would leak the existence of another firm's party. Enforced
-- in the database rather than in application code, because that is the
-- only place it holds for every writer.
create or replace function party_relationship_same_firm() returns trigger as $$
declare
  a_firm uuid;
  b_firm uuid;
begin
  select firm_id into a_firm from parties where id = new.party_id;
  select firm_id into b_firm from parties where id = new.related_party_id;
  if a_firm is null or b_firm is null then
    raise exception 'both parties must exist';
  end if;
  if a_firm <> b_firm then
    raise exception 'cannot relate parties from different firms';
  end if;
  -- Stamped from the parties themselves rather than trusted from the
  -- client, same approach as operator_messages.firm_id in 0021.
  new.firm_id := a_firm;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_party_relationship_same_firm on party_relationships;
create trigger trg_party_relationship_same_firm
  before insert or update on party_relationships
  for each row execute function party_relationship_same_firm();

-- Display helper: the mirror label for an edge read from the other end,
-- so the UI shows "Acme Corp — employer of Jane Doe" without hardcoding
-- the mapping in two places. Immutable and side-effect free.
create or replace function relationship_inverse(rel text) returns text as $$
  select case rel
    when 'employee_of'         then 'employer of'
    when 'officer_of'          then 'has officer'
    when 'owner_of'            then 'is owned by'
    when 'subsidiary_of'       then 'parent of'
    when 'affiliate_of'        then 'affiliate of'
    when 'family_of'           then 'family of'
    when 'business_partner_of' then 'business partner of'
    when 'counsel_for'         then 'represented by'
    else 'related to'
  end;
$$ language sql immutable;

alter table party_relationships enable row level security;

-- Firm-scoped, the tenancy-not-role principle from the 0006 fix that
-- time_entries (0013) and signature_requests (0020) both follow: anyone
-- at the firm can see and record how the firm's own parties connect.
-- Conflict screening is firm-wide work by nature — a relationship only
-- one person can see defeats the purpose of checking.
drop policy if exists "party_relationships select" on party_relationships;
create policy "party_relationships select" on party_relationships for select using (
  firm_id = current_firm_id()
);

drop policy if exists "party_relationships insert" on party_relationships;
create policy "party_relationships insert" on party_relationships for insert with check (
  firm_id = current_firm_id()
);

-- Update/delete: the recorder, or principal/manager — the same predicate
-- documents uses for delete and time_entries reuses. Unlike 0021's
-- conversations, this is firm record-keeping rather than private working
-- notes, so the principal/manager path belongs here.
drop policy if exists "party_relationships update" on party_relationships;
create policy "party_relationships update" on party_relationships for update using (
  firm_id = current_firm_id() and (created_by = auth.uid() or current_app_role() in ('principal', 'manager'))
);

drop policy if exists "party_relationships delete" on party_relationships;
create policy "party_relationships delete" on party_relationships for delete using (
  firm_id = current_firm_id() and (created_by = auth.uid() or current_app_role() in ('principal', 'manager'))
);

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION TO RUN AFTER APPLYING (none of this has been executed):
--
--   1. Insert an edge between two parties at the same firm. Confirm
--      firm_id is stamped from the parties, not from whatever was sent.
--   2. Insert with party_id = related_party_id. Expect the self-check to
--      reject it.
--   3. Insert the same (party, related, relationship) twice. Expect the
--      unique constraint to reject the second.
--   4. Attempt an edge between parties at DIFFERENT firms, using the
--      service role so RLS is bypassed. Expect the trigger to raise
--      'cannot relate parties from different firms'. This is the one
--      that matters most — it is the cross-tenant leak path.
--   5. As a user at another firm, select from the table. Expect zero
--      rows, not an error.
--   6. As a non-principal who did not create a row, attempt update and
--      delete. Expect zero rows affected.
--   7. select relationship_inverse('employee_of') -> 'employer of'.
--
-- No extension is required by this migration.
--
-- NOTE ON WHAT IS ALREADY POSSIBLE WITHOUT THIS TABLE: parties.aliases
-- exists and is unused by the current exact-match conflict search, and
-- a party appearing on more than one matter in opposing roles is
-- derivable today. Those are a real class of non-obvious conflict that
-- needs no new data — worth building alongside the relationship walk so
-- the feature is useful before anyone has recorded a single edge.
-- ─────────────────────────────────────────────────────────────────────
