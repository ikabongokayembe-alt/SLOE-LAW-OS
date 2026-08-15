-- Real bug fix, confirmed live: setDocumentClientVisible (Client Portal
-- MVP, migration 0018) writes client_visible via a plain
-- `documents.update(...)`, but `documents` has never had an UPDATE RLS
-- policy at all (see migration 0005 — only select/insert/delete exist).
-- RLS enabled + no matching policy for an operation means every update
-- silently matches ZERO rows: no error, no exception thrown, just
-- nothing written. The frontend's optimistic UI update made the "Share
-- with client" toggle LOOK like it worked while the database never
-- changed — confirmed directly against the live table: client_visible
-- stayed false after toggling it in the live UI.
--
-- Same firm-wide, not role-restricted shape as "documents select"/
-- "documents insert" (migration 0005) — editing a document's own
-- metadata (client_visible today, whatever else needs it later) isn't a
-- more privileged action than uploading or reading one already is.
create policy "documents update" on documents for update using (
  firm_id = current_firm_id()
) with check (
  firm_id = current_firm_id()
);
