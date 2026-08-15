-- Agent Library — instant self-provisioning. Replaces the review-queue
-- model from the previous build: requesting a specialist now activates
-- it immediately (no 'pending' waiting state), and a firm needs to be
-- able to remove one, not just add one.
--
-- ─────────────────────────────────────────────────────────────────────
-- 1. RLS. `agent_requests` predates migration tracking in this repo (see
-- 0009's comment) — its current live RLS state was never verified here.
-- Given this project has already turned up one table with a missing
-- UPDATE policy (`firms`) and another that needed its policies checked
-- explicitly before trusting them (`practice_areas`), this does not
-- assume agent_requests is already correctly configured. It (re)defines
-- SELECT/INSERT/DELETE explicitly — enabling RLS is idempotent if
-- already on; drop-if-exists + create makes the policies idempotent too,
-- same pattern 0006 used to fix ambiguous RLS state elsewhere. No role
-- restriction on any of the three: this table has never been principal/
-- manager-gated (the /agents route itself has none), and remove should
-- have the same reach as add for the same reason. No UPDATE policy is
-- added — the only writer of notified_at is agent-request-notify's
-- service-role client, which bypasses RLS entirely, and the frontend no
-- longer needs to transition a row's status after insert.
-- ─────────────────────────────────────────────────────────────────────
alter table agent_requests enable row level security;

drop policy if exists "agent_requests select" on agent_requests;
create policy "agent_requests select" on agent_requests for select using (
  tenant_id = current_firm_id()
);

drop policy if exists "agent_requests insert" on agent_requests;
create policy "agent_requests insert" on agent_requests for insert with check (
  tenant_id = current_firm_id()
);

drop policy if exists "agent_requests delete" on agent_requests;
create policy "agent_requests delete" on agent_requests for delete using (
  tenant_id = current_firm_id()
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. status — kept as a column (not dropped) rather than removed as a
-- concept: existence-of-row is now the real activation signal and
-- nothing branches on this value anymore, but keeping it costs nothing
-- and leaves room for a genuinely different future state (e.g. a
-- soft-disable short of full removal) without another migration. What
-- changes: the default and all rows move to 'active', since 'pending'
-- no longer describes anything real in this product — a firm that
-- requested a specialist during the brief review-queue window should
-- not still show as waiting now that the model is instant activation.
-- ─────────────────────────────────────────────────────────────────────
alter table agent_requests alter column status set default 'active';
update agent_requests set status = 'active' where status = 'pending';
