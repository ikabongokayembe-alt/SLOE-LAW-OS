export interface Attorney {
  id: string;
  name: string;
  license_number?: string;
  licensing_body?: string;
  specialization?: string;
  matters_active: number;
  matters_closed_ytd: number;
}

export interface Firm {
  id: string;
  name: string;
  country?: string | null;
  region?: string | null;
  currency?: string | null;
  locale?: string | null;
}

export interface PracticeArea {
  id: string;
  key: string;
  label: string;
  is_active: boolean;
}

export interface MatterStage {
  id: string;
  practice_area_id: string | null;
  stage_key: string;
  label: string;
  sort_order: number;
  is_initial: boolean;
  is_terminal: boolean;
}

export interface Party {
  id: string;
  name: string;
  party_type: 'individual' | 'organization';
  aliases: string[];
  notes?: string;
  import_batch_id?: string | null;
}

export type ConflictCheckStatus = 'pending' | 'cleared' | 'flagged' | 'waived';

export interface ConflictCheck {
  id: string;
  matter_id: string | null;
  searched_name: string;
  matched_party_ids: string[];
  status: ConflictCheckStatus;
  cleared_by?: string;
  cleared_at?: string;
  notes?: string;
  created_at: string;
}

export type BillingType = 'hourly' | 'contingency' | 'flat_fee' | 'retainer';
export type MatterStatus = 'active' | 'on_hold' | 'closed';

export interface Matter {
  id: string;
  title: string;
  practice_area_id: string | null;
  stage_id: string;
  client_party_id: string | null;
  assigned_attorney_id: string | null;
  status: MatterStatus;
  billing_type: BillingType;
  conflict_check_id: string | null;
  opened_date: string;
  closed_date?: string | null;
  description?: string;
  import_batch_id?: string | null;
}

export type DeadlineType = 'statute_of_limitations' | 'filing' | 'court_date' | 'other';
export type DeadlineStatus = 'upcoming' | 'completed' | 'missed';

export interface Deadline {
  id: string;
  matter_id: string | null;
  title: string;
  deadline_type: DeadlineType;
  due_date: string;
  status: DeadlineStatus;
  assigned_to: string | null;
  is_critical: boolean;
  reminder_days_before: number;
  import_batch_id?: string | null;
  // Set once this deadline has been pushed to the firm's connected Google
  // Calendar (see migration 0015) — one-directional, explicit push only,
  // never auto-synced. Null/undefined means "not pushed yet."
  calendar_event_id?: string | null;
}

// Client Portal MVP (see migration 0018) — a firm-side record of who's
// already been invited/has access, so the Matters screen can show
// "invite" vs. "pending" vs. "has access" instead of blindly re-sending.
export interface ClientInvite {
  id: string;
  party_id: string;
  email: string;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

// Just enough to know a party already has a working portal login — the
// client's own auth/session details never surface in the staff app.
export interface ClientUser {
  party_id: string;
}

// Send + log email against a matter, through the firm's connected Gmail
// (see migration 0015 / supabase/functions/composio's send_matter_email
// action). Sending and logging only — not a mirror of an inbox thread.
export interface MatterCommunication {
  id: string;
  matter_id: string;
  sent_to: string;
  subject: string;
  body: string;
  sent_by: string | null;
  sent_at: string;
}

// One row per insert/update/delete on any of the six audited tables (see
// migration 0016) — written ONLY by a database trigger, never by the
// app. old_values/new_values are the full row as jsonb, so the UI can
// diff arbitrary fields without knowing the audited table's shape ahead
// of time.
export type AuditAction = 'insert' | 'update' | 'delete';

export interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  changed_by: string | null;
  changed_at: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  // Embedded via the changed_by -> profiles(id) foreign key at query
  // time (see loadAll) — RLS-limited like anything else: a viewer who
  // can't read another member's profile row (see migration 0001's
  // profiles policy) gets null here for that row, not an error. The UI
  // treats that as "can't resolve," not "nobody."
  profiles?: { name: string } | null;
}

// CSV import tooling — one row per completed import run, so a bad
// import can be identified and undone as a unit. See migration 0012.
export interface ImportBatch {
  id: string;
  entity_type: 'parties' | 'matters' | 'deadlines';
  row_count: number;
  created_by?: string | null;
  created_at: string;
}

// Billing Phase 1: time capture and export only — see migration 0013.
// No `amount` field: duration_minutes * rate is computed at read time
// (src/lib/timeEntries.ts), never persisted, so an edit to either input
// can't leave a stale total sitting in the database.
export interface TimeEntry {
  id: string;
  matter_id: string;
  attorney_id: string | null;
  created_by?: string | null;
  date: string;
  duration_minutes: number;
  rate: number | null;
  currency: string | null;
  description?: string;
  billable: boolean;
  created_at: string;
}

export interface Insight {
  id: string;
  type: string;
  headline: string;
  body: string;
  reasoning?: string;
  references?: string[];
  confidence?: number;
  suggested_actions?: { label: string; action_type: string }[];
  scope?: string;
}

// Statute-of-limitations engine: a deterministic lookup row, never
// AI-generated (see supabase/migrations/0011_deadline_rules.sql for why
// that distinction is non-negotiable). Global reference data — not
// scoped to a firm.
export type DeadlineRuleType = 'deadline' | 'restriction';
export type DeadlineRuleDurationUnit = 'years' | 'months' | 'days';

export interface DeadlineRule {
  id: string;
  country: string;
  region: string | null;
  practice_area: string;
  trigger_event: string;
  duration_value: number;
  duration_unit: DeadlineRuleDurationUnit;
  rule_type: DeadlineRuleType;
  exceptions?: string | null;
  citation: string;
  source_verified_at: string;
  business_days_only: boolean;
  notes?: string | null;
}

export interface LawDocument {
  id: string;
  matter_id: string | null;
  file_name: string;
  storage_path: string;
  file_type?: string;
  file_size?: number;
  uploaded_by?: string;
  created_at: string;
  // Always points at the ROOT document of a version chain (the first
  // upload), never at the immediately-preceding version — see migration
  // 0008. Null means "not a version of anything."
  parent_document_id?: string | null;
  // Populated asynchronously by the extract-document-text edge function
  // after upload — see migration 0017. 'pending' until that call
  // finishes (or never ran); the Documents screen's search box can't
  // find this document by content until it's 'done'.
  extraction_status?: 'pending' | 'done' | 'skipped' | 'failed';
  // Client Portal MVP (see migration 0018) — nothing is client-visible by
  // default; a firm has to actively share each document.
  client_visible?: boolean;
}

// One row of full-text search results — returned by the search_documents
// Postgres function (migration 0017), not the documents table directly,
// so it carries a ready-to-render snippet instead of the full
// extracted_text.
export interface DocumentSearchResult {
  id: string;
  file_name: string;
  matter_id: string | null;
  storage_path: string;
  extraction_status: string;
  snippet: string;
  rank: number;
}
