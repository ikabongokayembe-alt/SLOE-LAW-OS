-- Operator/Analyst conversation threads.
--
-- NOT YET APPLIED ANYWHERE. Handed over as SQL to be applied and verified
-- the same way the rest of the schema is. Nothing in the frontend reads
-- these tables yet, so applying this migration on its own is inert — it
-- adds structure and changes no existing behaviour.
--
-- ─────────────────────────────────────────────────────────────────────
-- Scoping: PRIVATE TO THE CREATOR, confirmed by Isaac.
--
-- firm_id scopes tenancy; created_by scopes visibility. A colleague at
-- the same firm cannot read, search, or even count another person's
-- threads. The reasoning: an Operator thread is a working surface, not a
-- filed document — it holds half-formed strategy, questions someone
-- doesn't want to ask aloud yet, and draft language they haven't stood
-- behind. Firm-wide-by-default would quietly change what people are
-- willing to type into it, which is the fastest way to make the feature
-- useless. Firm-visible sharing can be added later as an explicit act
-- (a shared_with column, or a share table); it cannot be taken away
-- later, because by then people will already have typed things in.
--
-- Because visibility is creator-only, read/unread needs no separate
-- per-user table: exactly one person can ever see a thread, so unread
-- state is a column on the thread itself. If scoping is ever widened to
-- firm-visible, this becomes wrong and needs a per-user read-state
-- table — noted here so that change is made deliberately, not by
-- adding a column and hoping.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists operator_conversations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  -- 'operator' | 'analyst'. Text + check rather than a new enum type,
  -- matching documents.extraction_status (0017) rather than user_role.
  -- The two agents share this table because they are the same shape;
  -- the column keeps their inboxes separate in the UI.
  agent text not null check (agent in ('operator', 'analyst')),
  -- Generated from the first user message client-side, then editable.
  -- Not null so a thread is never nameless in a list; the frontend
  -- supplies a trimmed fallback rather than leaving it blank.
  title text not null,
  -- Denormalised so the conversation list sorts and renders without
  -- joining messages. Maintained by the trigger below rather than by
  -- application code, so it cannot drift if a message is inserted from
  -- anywhere else (an edge function, a backfill, psql).
  last_message_at timestamptz not null default now(),
  -- Unread means "the assistant replied and the creator has not looked
  -- since". Only ever set true by an assistant insert (see trigger) and
  -- cleared by the creator opening the thread — never set by a user
  -- message, or every thread would be unread the moment you typed in it.
  unread boolean not null default false,
  created_at timestamptz not null default now(),
  -- created_by cascades: if a profile is deleted, their private threads
  -- have no remaining audience and no owner who could grant access.
  deleted_at timestamptz
);

create table if not exists operator_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references operator_conversations(id) on delete cascade,
  -- Denormalised firm_id so the RLS policy below is a plain column
  -- comparison rather than a subquery against the parent on every row
  -- read. Kept honest by the trigger, not by trusting the client.
  firm_id uuid not null references firms(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_operator_conversations_firm on operator_conversations(firm_id);
create index if not exists idx_operator_conversations_creator on operator_conversations(created_by, agent, last_message_at desc);
create index if not exists idx_operator_messages_conversation on operator_messages(conversation_id, created_at);

-- Search across past conversations. Covers the thread title AND its
-- message bodies, because "search my conversations" means the content,
-- not just what the thread happens to be named. Same generated-tsvector
-- approach as the document full-text search in 0017 rather than a new
-- pattern. English-only for now, consistent with 0017 — a firm working
-- in Arabic gets no stemming here, same caveat as document search.
alter table operator_messages
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;
create index if not exists idx_operator_messages_tsv on operator_messages using gin(content_tsv);
create index if not exists idx_operator_conversations_title_trgm on operator_conversations using gin(title gin_trgm_ops);

-- ── Maintain last_message_at / unread in the database ────────────────
-- In a trigger rather than in the store, so the invariant holds no
-- matter who inserts. A message inserted by an edge function (which is
-- how the assistant reply will arrive, since the AI call happens
-- server-side) would otherwise leave the list sorted wrong and the
-- badge stale.
create or replace function operator_touch_conversation() returns trigger as $$
begin
  update operator_conversations
     set last_message_at = new.created_at,
         -- Only an assistant reply marks a thread unread. A user's own
         -- message must never do so, or writing in a thread would mark
         -- it unread to the only person who can see it.
         unread = case when new.role = 'assistant' then true else unread end
   where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_operator_touch_conversation on operator_messages;
create trigger trg_operator_touch_conversation
  after insert on operator_messages
  for each row execute function operator_touch_conversation();

-- Stamp firm_id on messages from the parent conversation instead of
-- trusting whatever the client sent. Without this, a caller could insert
-- a message carrying another firm's firm_id; the insert policy below
-- checks the parent, but this removes the possibility entirely.
create or replace function operator_message_set_firm() returns trigger as $$
begin
  select c.firm_id into new.firm_id
    from operator_conversations c
   where c.id = new.conversation_id;
  if new.firm_id is null then
    raise exception 'conversation % not found', new.conversation_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_operator_message_set_firm on operator_messages;
create trigger trg_operator_message_set_firm
  before insert on operator_messages
  for each row execute function operator_message_set_firm();

-- ── RLS ──────────────────────────────────────────────────────────────
alter table operator_conversations enable row level security;
alter table operator_messages enable row level security;

-- Every policy carries BOTH predicates: firm_id = current_firm_id() AND
-- created_by = auth.uid(). created_by alone would be sufficient for
-- visibility, but the firm_id check means a profile that somehow moved
-- firms cannot drag its old threads along, and it keeps these policies
-- readable next to every other table's, which are all firm-scoped.
drop policy if exists "operator_conversations select" on operator_conversations;
create policy "operator_conversations select" on operator_conversations for select using (
  firm_id = current_firm_id() and created_by = auth.uid() and deleted_at is null
);

-- with check pins created_by to the caller, so a thread cannot be
-- created already attributed to someone else.
drop policy if exists "operator_conversations insert" on operator_conversations;
create policy "operator_conversations insert" on operator_conversations for insert with check (
  firm_id = current_firm_id() and created_by = auth.uid()
);

-- Deliberately NO principal/manager escape hatch, unlike time_entries and
-- documents. Those are firm records; this is one person's working notes.
-- A principal who could read every associate's AI threads is a different
-- product with different disclosure implications.
drop policy if exists "operator_conversations update" on operator_conversations;
create policy "operator_conversations update" on operator_conversations for update using (
  firm_id = current_firm_id() and created_by = auth.uid()
) with check (
  firm_id = current_firm_id() and created_by = auth.uid()
);

drop policy if exists "operator_conversations delete" on operator_conversations;
create policy "operator_conversations delete" on operator_conversations for delete using (
  firm_id = current_firm_id() and created_by = auth.uid()
);

-- Messages inherit the parent's visibility via an EXISTS against the
-- conversation, which is itself RLS-protected. The firm_id column is
-- checked too so a message can never be read through a conversation the
-- caller cannot see.
drop policy if exists "operator_messages select" on operator_messages;
create policy "operator_messages select" on operator_messages for select using (
  firm_id = current_firm_id()
  and exists (
    select 1 from operator_conversations c
     where c.id = operator_messages.conversation_id
       and c.created_by = auth.uid()
       and c.firm_id = current_firm_id()
  )
);

drop policy if exists "operator_messages insert" on operator_messages;
create policy "operator_messages insert" on operator_messages for insert with check (
  exists (
    select 1 from operator_conversations c
     where c.id = operator_messages.conversation_id
       and c.created_by = auth.uid()
       and c.firm_id = current_firm_id()
  )
);

-- No update policy: a sent message is immutable. No delete policy on
-- messages either — deleting the conversation cascades, which is the
-- only deletion that makes sense here.

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION TO RUN AFTER APPLYING (none of this has been executed):
--
--   1. As user A, create a thread; insert a 'user' message, then an
--      'assistant' message. Confirm last_message_at advanced and unread
--      flipped to true only on the assistant insert.
--   2. As user A, clear unread; confirm it stays false after re-reading.
--   3. As user B AT THE SAME FIRM, select from both tables. Expect ZERO
--      rows — not an error, zero rows. This is the scoping decision and
--      the one that matters most.
--   4. As user B, attempt to insert a message into A's conversation_id.
--      Expect the insert policy to reject it.
--   5. As user B, attempt to update A's conversation to set unread.
--      Expect zero rows affected.
--   6. Confirm operator_messages.firm_id is stamped from the parent even
--      when the client sends a different value.
--   7. Search: to_tsvector match on message content, and a trigram match
--      on title, both scoped to the caller only.
--
-- pg_trgm is required for the title index. If it is not already enabled
-- on the target project, run: create extension if not exists pg_trgm;
-- ─────────────────────────────────────────────────────────────────────
