-- Full-text search across uploaded documents. Live check of this firm's
-- documents (via REST) before writing this: 78 PDFs, 49 DOCX, no image
-- files — so extraction targets those two real formats, not a generic
-- "any file type" pipeline.
--
-- Extraction itself happens OUTSIDE Postgres (a PDF/DOCX needs a real
-- parser, and scanned PDFs need real OCR — see the extract-document-text
-- edge function) and is written back into extracted_text after upload,
-- asynchronously — this migration only adds the columns/index/search
-- function that extraction and search need.
alter table documents add column if not exists extracted_text text;

-- Lets the UI show "Indexing…" instead of silently having nothing to
-- search yet, and lets a future retry job find rows that never finished
-- (e.g. the edge function call never fired, or errored). 'skipped' is
-- distinct from 'failed': a file type this pipeline doesn't attempt
-- extraction for at all (anything that isn't .pdf/.docx) is skipped by
-- design, not a failure to surface as broken.
alter table documents add column if not exists extraction_status text not null default 'pending'
  check (extraction_status in ('pending', 'done', 'skipped', 'failed'));

-- Generated + STORED, not maintained by hand: search_vector always
-- reflects the current file_name + extracted_text with zero extra write
-- path to keep in sync. to_tsvector('english', <expr>) with a literal
-- config name is the documented immutable form Postgres allows in a
-- generated column (the two-arg-with-a-column-as-config variant is the
-- one that isn't allowed here — not relevant, we don't do that).
alter table documents add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(file_name, '') || ' ' || coalesce(extracted_text, ''))) stored;

create index if not exists idx_documents_search_vector on documents using gin(search_vector);

-- One query, not "filename ILIKE + separately query extracted_text" —
-- search_vector already combines both, so a single websearch_to_tsquery
-- match covers "found by filename" and "found by content" the same way.
-- Deliberately a plain (non-SECURITY DEFINER) function: it runs as the
-- calling user, so the existing `documents select` RLS policy still
-- applies underneath the explicit firm_id filter below — belt and
-- suspenders, same as everywhere else in this app, not a bypass.
create or replace function search_documents(p_query text)
returns table (
  id uuid,
  file_name text,
  matter_id uuid,
  storage_path text,
  extraction_status text,
  snippet text,
  rank real
)
language sql stable as $$
  select
    d.id,
    d.file_name,
    d.matter_id,
    d.storage_path,
    d.extraction_status,
    -- StartSel/StopSel are plain markers, NOT HTML tags — extracted_text
    -- comes from arbitrary uploaded file content, which the frontend
    -- must never render as raw HTML (ts_headline does not escape the
    -- surrounding text, only wraps matches, so a document containing
    -- literal "<script>"-like text would otherwise be a stored-XSS
    -- vector the moment a search snippet renders it). The frontend
    -- splits on these markers and renders each piece as plain text.
    ts_headline(
      'english',
      coalesce(d.extracted_text, ''),
      websearch_to_tsquery('english', p_query),
      'MaxWords=30, MinWords=15, ShortWord=3, HighlightAll=false, MaxFragments=1, StartSel=§§B§§, StopSel=§§E§§'
    ) as snippet,
    ts_rank(d.search_vector, websearch_to_tsquery('english', p_query)) as rank
  from documents d
  where d.firm_id = current_firm_id()
    and d.deleted_at is null
    and d.search_vector @@ websearch_to_tsquery('english', p_query)
  order by rank desc
  limit 50;
$$;
