-- Phone Answering AI Voice Agent Integration (Twilio + ElevenLabs Conversational AI).
--
-- Adds firm configuration for the designated Twilio voice phone number,
-- and a log table to store incoming post-call transcript/analysis webhooks
-- received from ElevenLabs.

alter table firms add column if not exists phone_answering_number text;
alter table parties add column if not exists phone text;
create index if not exists idx_parties_phone on parties(phone);


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

-- Update submit_intake to populate structured parties.phone column
create or replace function submit_intake(
  p_token uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_practice_area_key text,
  p_description text
) returns uuid
language plpgsql security definer as $$
declare
  v_firm_id uuid;
  v_practice_area_id uuid;
  v_practice_area_label text;
  v_stage_id uuid;
  v_party_id uuid;
  v_matter_id uuid;
  v_notes text;
begin
  select id into v_firm_id from firms where intake_token = p_token;
  if v_firm_id is null then
    raise exception 'Invalid or expired intake link';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name is required';
  end if;

  select id, label into v_practice_area_id, v_practice_area_label
    from practice_areas where firm_id = v_firm_id and key = p_practice_area_key and is_active = true limit 1;

  select id into v_stage_id from matter_stages
    where firm_id = v_firm_id and is_initial = true order by sort_order limit 1;
  if v_stage_id is null then
    raise exception 'This firm has not configured an intake stage yet';
  end if;

  v_notes := 'Submitted via online intake form.';
  if coalesce(trim(p_email), '') <> '' then v_notes := v_notes || ' Email: ' || trim(p_email) || '.'; end if;
  if coalesce(trim(p_phone), '') <> '' then v_notes := v_notes || ' Phone: ' || trim(p_phone) || '.'; end if;

  insert into parties (firm_id, name, party_type, aliases, phone, notes)
    values (v_firm_id, trim(p_name), 'individual', '{}', nullif(trim(p_phone), ''), v_notes)
    returning id into v_party_id;

  insert into matters (
    firm_id, title, practice_area_id, stage_id, client_party_id,
    status, billing_type, conflict_check_id, description
  ) values (
    v_firm_id,
    trim(p_name) || ' — ' || coalesce(v_practice_area_label, 'New Inquiry'),
    v_practice_area_id, v_stage_id, v_party_id,
    'active', 'hourly', null,
    coalesce(nullif(trim(p_description), ''), 'No description provided.') || E'\n\n— Submitted via online intake form.'
  ) returning id into v_matter_id;

  return v_matter_id;
end;
$$;

