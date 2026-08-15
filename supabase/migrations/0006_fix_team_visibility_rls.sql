-- Fix team visibility: SELECT RLS on matters/deadlines/profiles was
-- scoped to `assigned_attorney_id`/`assigned_to` for every role except
-- the broad-visibility set (principal, manager, billing, reception).
-- New matters/deadlines are created with no assignee, so an Associate
-- (agent) saw them only after manual assignment, and a Paralegal never
-- gets an `attorneys` row created on invite-accept at all (accept_invite
-- only creates one for 'agent'/'principal'), so they could NEVER see any
-- matter or deadline in their own firm — confirmed live against
-- production on 2026-08-13.
--
-- Same asymmetry existed on `profiles`: only principal/manager could read
-- the rest of the firm roster; every other role could see only their own
-- row.
--
-- Fix: row visibility is a tenancy question, not a role question.
-- `assigned_attorney_id` / `assigned_to` remain as ownership/attribution
-- metadata (used elsewhere for "my matters" style UI, stats, etc.) but
-- are no longer an access-control gate. Every SELECT policy below is
-- simplified to the same `firm_id = current_firm_id()` shape already
-- used by parties, conflict_checks, documents, insights, attorneys,
-- practice_areas and matter_stages — reusing the existing helper, not
-- inventing a new one.
--
-- `matter_parties` needs no change: its SELECT policy
-- (`matter_id in (select id from matters)`) inherits firm-wide
-- visibility automatically once `matters select` is fixed here.
--
-- Deliberately NOT touched (flagged for awareness, not fixed here):
--   * `matters update` / `deadlines update` carry the identical
--     is_broad_visibility_role()/assigned_* gate as the SELECT policies
--     fixed below. That's a write-permission question (can an Associate
--     edit a matter that isn't "theirs" yet?) — separate and more
--     sensitive than read visibility, left alone per scope.
--   * `invites team-visible` (principal/manager-only SELECT) is a
--     different pattern — it's not gated by assigned_attorney_id, and
--     invite rows carry unused signup tokens, so keeping it
--     admin-only looks intentional rather than the same bug. Left as-is.
--   * accept_invite() / attorneys-row creation on invite-accept is
--     untouched: visibility no longer depends on having an attorneys
--     row at all, and current_attorney_id()/is_broad_visibility_role()
--     are not referenced anywhere else in the schema or the frontend
--     (grepped supabase/ and src/) other than the two UPDATE policies
--     noted above, so nothing else relies on this.

drop policy if exists "matters select" on matters;
create policy "matters select" on matters for select using (
  firm_id = current_firm_id()
);

drop policy if exists "deadlines select" on deadlines;
create policy "deadlines select" on deadlines for select using (
  firm_id = current_firm_id()
);

drop policy if exists "profiles self or team-visible" on profiles;
create policy "profiles firm select" on profiles for select using (
  firm_id = current_firm_id()
);
