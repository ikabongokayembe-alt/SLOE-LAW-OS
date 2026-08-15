-- E-signature via Dropbox Sign (formerly HelloSign).
--
-- One row per document sent for signature. Deliberately NOT a column on
-- documents: the same document can legitimately be sent more than once
-- (a first send declined, a second send to a corrected address), and a
-- document column would either lose that history or force an awkward
-- "latest attempt wins" overwrite. A separate table keeps every attempt.
--
-- ─────────────────────────────────────────────────────────────────────
-- Column choices, matched to existing convention rather than invented:
--   * firm_id / matter_id / document_id — same cascade shape as
--     time_entries (0013) and documents (0005). document_id cascades:
--     a signature request for a deleted document has no meaning.
--   * created_by references profiles(id) — same convention as
--     documents.uploaded_by and time_entries.created_by: WHO initiated
--     this, and the field the update/delete policies below are scoped
--     to. Not attorneys(id) — a paralegal can send for signature and
--     never has an attorneys row (see 0006).
--   * status is a text + check rather than a new enum type, matching
--     documents.extraction_status (0017) rather than user_role (0001).
--     Statuses beyond the three the vendor reports (a local 'error'
--     state, say) would need a migration either way; the check keeps
--     bad values out without adding a type to maintain.
--   * signed_document_id — the documents row holding the SIGNED copy,
--     which is itself a version of the original via parent_document_id
--     (0008). Storing it directly rather than re-deriving it by walking
--     the version chain and guessing which member is "the signed one":
--     a version chain can hold ordinary re-uploads too, so there is no
--     reliable way to identify the signed copy from the chain alone.
--     Nullable — it does not exist until the document actually comes
--     back signed. `on delete set null` so deleting the signed copy
--     doesn't destroy the record that a signature happened.
--   * dropbox_sign_request_id is the vendor's signature_request_id,
--     unique — it is the idempotency key the webhook/status path looks
--     a row up by, and two local rows pointing at one vendor request
--     would make that lookup ambiguous. Nullable because the row is
--     inserted BEFORE the vendor call returns (so a crash mid-call
--     leaves a visible 'sent' row rather than silent nothing), then
--     populated on success.
--   * No recipient name column — Dropbox Sign requires a name in its
--     signers payload, but the frontend sends the party/recipient name
--     transiently; persisting it here would duplicate parties data that
--     can drift. Only the email, which is what identifies the signer.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists signature_requests (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  matter_id uuid references matters(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  signed_document_id uuid references documents(id) on delete set null,
  recipient_email text not null,
  status text not null default 'sent' check (status in ('sent', 'signed', 'declined')),
  dropbox_sign_request_id text unique,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_signature_requests_firm on signature_requests(firm_id);
create index if not exists idx_signature_requests_document on signature_requests(document_id);
create index if not exists idx_signature_requests_matter on signature_requests(matter_id);

alter table signature_requests enable row level security;

-- Read: firm-wide, the same tenancy-not-role principle established by
-- the 0006 team-visibility fix and followed by time_entries (0013) —
-- anyone at the firm can see that a document is out for signature.
-- current_firm_id() reads the caller's own profile, so a caller from
-- another firm matches zero rows regardless of what they ask for.
drop policy if exists "signature_requests select" on signature_requests;
create policy "signature_requests select" on signature_requests for select using (
  firm_id = current_firm_id()
);

-- Insert: any firm member, no role gate — matches documents/time_entries
-- insert. The `with check` on firm_id is what stops a caller from
-- inserting a row attributed to a different firm.
drop policy if exists "signature_requests insert" on signature_requests;
create policy "signature_requests insert" on signature_requests for insert with check (
  firm_id = current_firm_id()
);

-- Update/delete: the initiator, or principal/manager — the exact
-- predicate documents uses for delete and time_entries reuses, rather
-- than a new rule invented here. Note the edge function writes status
-- transitions with the service role, which bypasses RLS entirely; these
-- policies govern only direct client writes (e.g. a user cancelling
-- their own request), so a signer's status can never be forged from a
-- browser session.
drop policy if exists "signature_requests update" on signature_requests;
create policy "signature_requests update" on signature_requests for update using (
  firm_id = current_firm_id() and (created_by = auth.uid() or current_app_role() in ('principal', 'manager'))
);
drop policy if exists "signature_requests delete" on signature_requests;
create policy "signature_requests delete" on signature_requests for delete using (
  firm_id = current_firm_id() and (created_by = auth.uid() or current_app_role() in ('principal', 'manager'))
);
