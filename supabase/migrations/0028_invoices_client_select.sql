-- Client portal read access on generated invoices (product audit fix).
--
-- Migration 0025 ("invoices select") established staff-only SELECT
-- scoped via `firm_id = current_firm_id()`. Because client portal users
-- (migration 0018) exist in `client_users` and do NOT have a row in
-- `profiles`, `current_firm_id()` resolves to NULL for client sessions,
-- causing client queries to `invoices` to return 0 rows even when real
-- invoices exist for their matter.
--
-- This policy follows the exact same pattern established in migration 0018
-- for `matters select client` and `documents select client` using
-- `current_client_party_id()`.
--
-- Note on visibility design: Invoices are financial billing statements
-- issued for a matter, so they are visible-by-default to that matter's
-- authenticated client (unlike raw documents which require an explicit
-- `client_visible = true` flag).

create policy "invoices select client" on invoices for select using (
  matter_id in (
    select id from matters where client_party_id = current_client_party_id()
  )
);
