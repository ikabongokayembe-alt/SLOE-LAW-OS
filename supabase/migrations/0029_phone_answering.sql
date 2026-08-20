-- Phone Answering AI Voice Agent Integration (Twilio + ElevenLabs Conversational AI).
--
-- Adds firm configuration for the designated Twilio voice phone number,
-- and a log table to store incoming post-call transcript/analysis webhooks
-- received from ElevenLabs.

alter table firms add column if not exists phone_answering_number text;

create table if not exists phone_call_logs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  caller_phone text,
  caller_name text,
  call_duration_seconds integer,
  summary text,
  transcript jsonb,
  outcome_action text not null check (outcome_action in ('intake_created', 'matter_noted', 'callback_flagged')),
  matched_matter_id uuid references matters(id) on delete set null,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_phone_call_logs_firm on phone_call_logs(firm_id);
create index if not exists idx_phone_call_logs_matter on phone_call_logs(matched_matter_id);

alter table phone_call_logs enable row level security;

create policy "phone_call_logs select" on phone_call_logs for select using (
  firm_id = current_firm_id()
);
