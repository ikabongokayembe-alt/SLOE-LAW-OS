-- Real client intake pipeline (product-audit Gap 2): Matters already has
-- an "Intake" stage, but everything landing there was manual entry. A
-- shareable, per-firm link now lets a prospective client's own submission
-- create a real Party and a real Matter directly in that stage -- not a
-- separate inbox that still needs re-typing into Matters.
--
-- Deliberately ONE fixed form shape, not a form-builder: name, contact
-- info, practice area, and a short description are the only inputs this
-- schema (or the RPCs below) know how to accept.
--
-- One token per firm (not one-time-use like client_invites/invites) --
-- an intake link is meant to be posted on a website and submitted
-- through repeatedly, unlike a single recipient's portal invite.
alter table firms add column if not exists intake_token uuid not null default gen_random_uuid();
create unique index if not exists idx_firms_intake_token on firms(intake_token);

-- Real, live-confirmed gap found while adding this: `firms` has SELECT
-- (migration 0001) and the client-scoped SELECT (0018), but NO update
-- policy at all -- the existing updateFirm() action (Firm Settings'
-- country/region/currency/locale save) has been silently writing zero
-- rows this whole time, same failure shape as documents' pre-0019 gap
-- (RLS enabled + no matching policy = every update matches nothing, no
-- error thrown). Needed here for intake_token regeneration regardless,
-- so fixing it now rather than filing it separately.
create policy "firms update" on firms for update using (
  id = current_firm_id() and current_app_role() in ('principal', 'manager')
) with check (
  id = current_firm_id() and current_app_role() in ('principal', 'manager')
);

-- ── Public, unauthenticated intake -- same SECURITY DEFINER token
-- pattern as get_invite_email/accept_invite (migration 0001) and
-- get_client_invite_email/accept_client_invite (0018): a caller with no
-- session and no firm_id can still perform ONE narrowly-scoped action,
-- authorized entirely by possessing the right token, never by RLS.
--
-- Unlike the invite RPCs, submit_intake creates no auth.users row and no
-- signed-in identity at all -- a prospective client is not creating an
-- account here, just submitting a form. So there is no "accept" step;
-- this single call both validates the token and performs the write.

-- Lets the public form resolve which firm a link belongs to (name, for
-- "You're contacting X"), and that firm's active practice areas (for a
-- dropdown) -- without granting any direct SELECT on firms/practice_areas
-- to anonymous callers. Returns nothing (empty result set) for an
-- unknown token; the frontend treats that as "invalid link".
create or replace function get_intake_firm(p_token uuid)
returns table (firm_id uuid, firm_name text, practice_areas jsonb)
language sql stable security definer as $$
  select
    f.id,
    f.name,
    coalesce(
      (select jsonb_agg(jsonb_build_object('key', pa.key, 'label', pa.label) order by pa.label)
       from practice_areas pa where pa.firm_id = f.id and pa.is_active = true),
      '[]'::jsonb
    )
  from firms f
  where f.intake_token = p_token;
$$;

-- The actual write. p_practice_area_key may be null/unmatched (client
-- didn't know, or picked "not sure") -- the matter is created without a
-- practice area rather than guessing one.
--
-- conflict_check_id is deliberately NEVER set here -- this is what keeps
-- an intake-sourced matter subject to the exact same rule as one entered
-- by staff: enforce_conflict_check_gate() (migration 0002) already
-- blocks ANY matter from leaving an is_initial stage without a cleared
-- or waived conflict check, purely from stage_id + conflict_check_id,
-- with no notion of how the matter was created. Nothing new was needed
-- to satisfy "don't skip conflict-check on intake-sourced matters" --
-- just not bypassing the existing gate by, say, inserting directly into
-- a non-initial stage or fabricating a conflict_check_id.
--
-- The initial stage is picked the same way NewMatterModal already does
-- client-side (lowest sort_order among is_initial stages, ignoring
-- practice_area_id) -- intentionally the identical rule, not a
-- reimplementation that could silently disagree with it.
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

  insert into parties (firm_id, name, party_type, aliases, notes)
    values (v_firm_id, trim(p_name), 'individual', '{}', v_notes)
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
