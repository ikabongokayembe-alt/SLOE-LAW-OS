-- Backfills composio_auth_configs, which supabase/functions/composio/
-- index.ts has depended on since the Integrations screen shipped (the
-- Composio connect/disconnect flow, reused from the Realty OS pattern)
-- but which never got a migration checked into this repo — it appears to
-- have been created out-of-band, directly against the live project.
-- Confirmed missing before writing this migration: a direct REST probe
-- against the live project (jrmouvvweiwmbvflwdtt) returned PGRST205
-- "Could not find the table 'public.composio_auth_configs' in the schema
-- cache" — meaning the existing 'connect' flow could not actually work
-- end-to-end. This migration must land before any Calendar/Gmail work
-- that depends on connect() is tested live.
--
-- Caches one Composio auth_config_id per toolkit slug, shared across
-- every firm (see getOrCreateAuthConfig in the composio edge function) —
-- this is not tenant data, so there's no firm_id column.
create table if not exists composio_auth_configs (
  id uuid primary key default gen_random_uuid(),
  toolkit_slug text not null unique,
  auth_config_id text not null,
  created_at timestamptz not null default now()
);

-- Only ever read/written by the composio edge function via the
-- service-role key, which bypasses RLS entirely. RLS is enabled with no
-- policies defined at all, so anon/authenticated clients are hard-blocked
-- from reading or writing Composio's internal config ids directly —
-- there is no legitimate reason a browser session should touch this
-- table.
alter table composio_auth_configs enable row level security;
