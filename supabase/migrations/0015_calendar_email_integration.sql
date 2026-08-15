-- Calendar + Gmail integration, pass 1. Builds on the Composio
-- connect/disconnect flow that already exists on /integrations — this is
-- about USING an already-connected Gmail/Calendar, not building the
-- connection UI. Two pieces:
--
--  1. Deadline -> Calendar push. One-directional (Law OS -> Calendar
--     only, no pulling changes back), and explicit — a real "Add to
--     Calendar" click per deadline, not a silent background sync. A
--     critical deadline that silently fails to reach someone's actual
--     calendar is worse than requiring one click, so this is opt-in per
--     deadline rather than automatic on every create/edit.
--     calendar_event_id records whether/that a given deadline has
--     already been pushed, so the UI can show "Added" vs "Add to
--     Calendar" from local state instead of re-querying Google on every
--     render.
--
--  2. Send + log email against a matter, through the firm's connected
--     Gmail. matter_communications is the log — a retrievable record of
--     what was sent, to whom, and when, not just a toast that says
--     "sent". The composio edge function writes the send and the log
--     row in the same request (see action 'send_matter_email'), so
--     there's no window where an email actually went out through Gmail
--     but the record of it doesn't exist because a later step failed.
--     Sending and logging only in this pass — no inbox reading, no
--     thread matching; that's flagged as separate, larger-scope work.
alter table deadlines add column if not exists calendar_event_id text;

create table if not exists matter_communications (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  matter_id uuid not null references matters(id) on delete cascade,
  sent_to text not null,
  subject text not null,
  body text not null,
  sent_by uuid references profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_matter_communications_firm on matter_communications(firm_id);
create index if not exists idx_matter_communications_matter on matter_communications(matter_id);

alter table matter_communications enable row level security;

-- Read: firm-wide — same tenancy-not-ownership shape as time_entries
-- (migration 0013) and documents. A sent-email log is a firm record, not
-- a private one; anyone at the firm working a matter should be able to
-- see what's already gone out on it.
drop policy if exists "matter_communications select" on matter_communications;
create policy "matter_communications select" on matter_communications for select using (
  firm_id = current_firm_id()
);

-- Insert: any firm member, no role gate — matches documents/deadlines/
-- time_entries insert policies (sending an email you're allowed to send
-- isn't a privileged action). In practice this is written by the
-- composio edge function with the service-role key (bypassing RLS), but
-- the policy stays consistent with the rest of the schema rather than
-- locking inserts to service-role only, in case a future path writes
-- rows directly from an authenticated client.
drop policy if exists "matter_communications insert" on matter_communications;
create policy "matter_communications insert" on matter_communications for insert with check (
  firm_id = current_firm_id()
);

-- No update/delete policy at all, on purpose: a sent-communication log is
-- an audit trail, not an editable record — once an email actually went
-- out through Gmail, the log of it shouldn't be alterable from the app.
