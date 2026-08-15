-- Document version history.
--
-- Migration 0005 shipped v1 "latest-version-only" on purpose, disclosed
-- honestly in the UI rather than hidden: re-uploading a file created a
-- wholly separate document row, with no link back to the original. This
-- closes that gap.
--
-- `parent_document_id` always points at the ROOT document of a version
-- chain (the first upload), not at the immediately-preceding version.
-- Every version of the same file shares the same parent, so grouping is
-- a single flat lookup (group key = parent_document_id ?? id) instead of
-- walking a linked list — and deleting a middle version can never orphan
-- the rest of the chain, because there is no chain, just a star.
--
-- Nullable + `on delete set null`: purely additive. Every existing
-- document keeps parent_document_id = null (meaning "I'm not a version
-- of anything, I'm my own root") and nothing about existing behavior
-- changes. If a root document is later deleted, its versions are not
-- cascade-deleted with it — they just stop being grouped under it and
-- stand alone. Linking a new upload as a version is an explicit choice
-- offered at upload time (see the frontend) — it is never inferred or
-- forced silently.
alter table documents add column if not exists parent_document_id uuid references documents(id) on delete set null;

create index if not exists idx_documents_parent on documents(parent_document_id);
