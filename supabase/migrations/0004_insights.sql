-- Backs the Analyst screen's "Regenerate insights" feature — AI-generated
-- observations about the firm's matters/deadlines, stored so they persist
-- across sessions rather than regenerating on every page load.

create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  type text,
  headline text not null,
  body text not null default '',
  reasoning text,
  "references" jsonb not null default '[]',
  confidence numeric,
  suggested_actions jsonb not null default '[]',
  scope text,
  dismissed_at timestamptz,
  generated_at timestamptz not null default now()
);

create index if not exists idx_insights_firm on insights(firm_id);

alter table insights enable row level security;
create policy "insights select" on insights for select using (firm_id = current_firm_id());
create policy "insights insert" on insights for insert with check (firm_id = current_firm_id());
create policy "insights update" on insights for update using (firm_id = current_firm_id());
