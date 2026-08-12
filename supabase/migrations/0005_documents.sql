-- Document management for Law OS. Real file storage via Supabase
-- Storage (matter-documents bucket, created separately — see deployment
-- notes), with this table tracking metadata. v1 scope deliberately:
-- latest-version-only, no version history yet — a real limitation,
-- not hidden.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  matter_id uuid references matters(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_firm on documents(firm_id);
create index if not exists idx_documents_matter on documents(matter_id);

alter table documents enable row level security;
create policy "documents select" on documents for select using (firm_id = current_firm_id());
create policy "documents insert" on documents for insert with check (firm_id = current_firm_id());
create policy "documents delete" on documents for delete using (
  firm_id = current_firm_id() and (uploaded_by = auth.uid() or current_app_role() in ('principal','manager'))
);

-- Storage bucket + RLS must be created separately (not plain SQL DDL —
-- see the deployment notes in the handoff doc). Documented here for
-- completeness:
--   Bucket name: matter-documents (private, not public)
--   Storage RLS: scope every operation to the firm's own path prefix,
--   e.g. objects stored under {firm_id}/{matter_id}/{filename}, with a
--   policy checking that the leading path segment matches
--   current_firm_id()::text.
