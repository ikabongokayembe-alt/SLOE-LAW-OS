// CSV import tooling — deterministic column-mapping suggestions and row
// validation/resolution. Explicitly NOT AI-assisted (string-similarity
// matching only, per spec) — column mapping must stay fast, deterministic,
// and reproducible, and is always confirmed by a person before anything
// is inserted, never silently guessed and committed.

export type ImportEntityType = 'parties' | 'matters' | 'deadlines';

export type ImportFieldType =
  | 'text' | 'enum' | 'date' | 'boolean' | 'integer' | 'list'
  | 'lookup_party' | 'lookup_matter' | 'lookup_attorney' | 'lookup_practice_area';

export interface ImportFieldDef {
  key: string;
  label: string;
  required: boolean;
  type: ImportFieldType;
  enumValues?: string[];
  defaultValue?: any;
  description?: string;
  // Common real-world header variants (Clio/MyCase-style exports) that
  // won't score well on pure string similarity against the field's own
  // key/label (e.g. "matter_name" vs "title") — checked first, with
  // fuzzy matching as the fallback for anything not in this list.
  aliases?: string[];
}

export const PARTY_FIELDS: ImportFieldDef[] = [
  { key: 'name', label: 'Name', required: true, type: 'text', aliases: ['full_name', 'full name', 'client_name', 'client name', 'party_name', 'contact_name', 'contact'] },
  { key: 'party_type', label: 'Type', required: false, type: 'enum', enumValues: ['individual', 'organization'], defaultValue: 'individual', aliases: ['type', 'client_type', 'entity_type', 'contact_type'] },
  { key: 'aliases', label: 'Also known as', required: false, type: 'list', defaultValue: [], aliases: ['aka', 'also_known_as', 'other_names', 'alias'] },
  { key: 'notes', label: 'Notes', required: false, type: 'text', aliases: ['note', 'comments', 'comment'] },
];

export const MATTER_FIELDS: ImportFieldDef[] = [
  { key: 'title', label: 'Matter title', required: true, type: 'text', aliases: ['matter_name', 'matter name', 'matter_title', 'case_name', 'case name', 'case_title', 'name'] },
  { key: 'practice_area', label: 'Practice area', required: false, type: 'lookup_practice_area', aliases: ['practice area', 'matter_type', 'case_type', 'area_of_law', 'practice_group'] },
  { key: 'client_name', label: 'Client', required: false, type: 'lookup_party', aliases: ['client', 'client_name', 'party', 'party_name', 'primary_client'] },
  { key: 'assigned_attorney', label: 'Assigned attorney', required: false, type: 'lookup_attorney', aliases: ['attorney', 'responsible_attorney', 'lawyer', 'assigned_to', 'assigned attorney'] },
  { key: 'billing_type', label: 'Billing type', required: false, type: 'enum', enumValues: ['hourly', 'contingency', 'flat_fee', 'retainer'], defaultValue: 'hourly', aliases: ['billing', 'fee_type', 'fee_arrangement'] },
  { key: 'status', label: 'Status', required: false, type: 'enum', enumValues: ['active', 'on_hold', 'closed'], defaultValue: 'active', aliases: ['matter_status', 'case_status'] },
  { key: 'opened_date', label: 'Opened date', required: false, type: 'date', aliases: ['open_date', 'date_opened', 'start_date', 'opened'] },
  { key: 'description', label: 'Description', required: false, type: 'text', aliases: ['notes', 'summary', 'details'] },
];

export const DEADLINE_FIELDS: ImportFieldDef[] = [
  { key: 'title', label: 'Deadline title', required: true, type: 'text', aliases: ['deadline_name', 'deadline_title', 'task', 'event', 'name'] },
  { key: 'due_date', label: 'Due date', required: true, type: 'date', aliases: ['date', 'due', 'deadline_date'] },
  { key: 'matter_title', label: 'Matter', required: false, type: 'lookup_matter', aliases: ['matter', 'matter_name', 'case', 'related_matter'] },
  { key: 'deadline_type', label: 'Deadline type', required: false, type: 'enum', enumValues: ['statute_of_limitations', 'filing', 'court_date', 'other'], defaultValue: 'other', aliases: ['type', 'category'] },
  { key: 'status', label: 'Status', required: false, type: 'enum', enumValues: ['upcoming', 'completed', 'missed'], defaultValue: 'upcoming', aliases: ['deadline_status'] },
  { key: 'is_critical', label: 'Critical?', required: false, type: 'boolean', defaultValue: false, aliases: ['critical', 'urgent', 'priority'] },
  { key: 'reminder_days_before', label: 'Reminder (days before)', required: false, type: 'integer', defaultValue: 7, aliases: ['reminder', 'reminder_days'] },
  { key: 'assigned_to', label: 'Assigned attorney', required: false, type: 'lookup_attorney', aliases: ['attorney', 'assigned_attorney', 'responsible'] },
];

export const ENTITY_FIELDS: Record<ImportEntityType, ImportFieldDef[]> = {
  parties: PARTY_FIELDS,
  matters: MATTER_FIELDS,
  deadlines: DEADLINE_FIELDS,
};

export const ENTITY_LABELS: Record<ImportEntityType, string> = {
  parties: 'Parties', matters: 'Matters', deadlines: 'Deadlines',
};

// "Parties" is an irregular plural (party -> parties) — a naive
// slice(0, -1) on the label gives "Partie", so this is spelled out
// explicitly rather than derived.
export const ENTITY_SINGULAR: Record<ImportEntityType, string> = {
  parties: 'party', matters: 'matter', deadlines: 'deadline',
};

// ─────────────────────────────────────────────────────────────────────
// Deterministic string similarity — Levenshtein-based, no AI. Used only
// as the fallback when a header doesn't match a field's curated aliases.
// ─────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - levenshtein(na, nb) / maxLen);
}

function bestScoreForField(header: string, field: ImportFieldDef): number {
  let best = Math.max(similarity(header, field.key), similarity(header, field.label));
  for (const alias of field.aliases ?? []) {
    if (normalize(header) === normalize(alias)) return 1;
    best = Math.max(best, similarity(header, alias) * 0.97); // aliases score just under an exact key/label match
  }
  return best;
}

const MAPPING_THRESHOLD = 0.5;

// Greedy highest-score-first assignment: each CSV header and each field
// used at most once. Returns { fieldKey: header | null } — every field
// present, unmapped ones explicitly null (never guessed past the
// threshold, always visible to the person as "not mapped" for them to
// set manually if they want).
export function suggestColumnMapping(csvHeaders: string[], fields: ImportFieldDef[]): Record<string, string | null> {
  const candidates: { field: string; header: string; score: number }[] = [];
  for (const field of fields) {
    for (const header of csvHeaders) {
      const score = bestScoreForField(header, field);
      if (score >= MAPPING_THRESHOLD) candidates.push({ field: field.key, header, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const mapping: Record<string, string | null> = {};
  for (const f of fields) mapping[f.key] = null;
  const usedHeaders = new Set<string>();
  for (const c of candidates) {
    if (mapping[c.field] !== null) continue;
    if (usedHeaders.has(c.header)) continue;
    mapping[c.field] = c.header;
    usedHeaders.add(c.header);
  }
  return mapping;
}

// ─────────────────────────────────────────────────────────────────────
// Value parsing — deliberately forgiving on FORMAT (real exports are
// messy) but never forgiving on ambiguity: anything that doesn't clearly
// parse returns undefined rather than a guess.
// ─────────────────────────────────────────────────────────────────────

export function parseBoolean(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(v)) return true;
  if (['false', 'no', 'n', '0'].includes(v)) return false;
  return undefined;
}

export function parseIntegerField(raw: string): number | undefined {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return undefined;
  return parseInt(v, 10);
}

export function parseList(raw: string): string[] {
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

// Accepts ISO (2026-06-01), US slash (6/1/2026 or 06/01/2026), and
// dash-separated M-D-YYYY — the formats real CSV exports actually use.
// Returns a YYYY-MM-DD string or undefined if it doesn't clearly parse.
export function parseDateFlexible(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;

  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return toIsoDate(Number(m[3]), Number(m[1]), Number(m[2])); // US convention: M/D/YYYY

  return undefined;
}

function toIsoDate(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return undefined; // rejects e.g. 2026-02-30
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Matches a CSV value against an enum's allowed values, tolerant of case
// and separator style ("Flat Fee" / "flat-fee" / "flat_fee" all match
// "flat_fee"). Returns undefined if nothing matches — never guesses.
export function matchEnum(raw: string, allowed: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '_').trim();
  const target = norm(raw);
  return allowed.find(a => norm(a) === target);
}

// ─────────────────────────────────────────────────────────────────────
// Row resolution — turns one raw CSV row + a confirmed mapping into a
// candidate record, with every problem visible before commit.
// ─────────────────────────────────────────────────────────────────────

export interface RowIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ResolvedRow {
  index: number;
  raw: Record<string, string>;
  resolved: Record<string, any>;
  issues: RowIssue[];
  blocked: boolean; // has at least one error-severity issue — will never be inserted, even if the person leaves it checked
}

export interface ImportLookupContext {
  parties: { id: string; name: string }[];
  matters: { id: string; title: string }[];
  attorneys: { id: string; name: string }[];
  practiceAreas: { id: string; key: string; label: string }[];
}

function resolveLookup(
  raw: string,
  type: 'lookup_party' | 'lookup_matter' | 'lookup_attorney' | 'lookup_practice_area',
  ctx: ImportLookupContext,
): { id: string | null; found: boolean } {
  const target = raw.trim().toLowerCase();
  if (!target) return { id: null, found: true }; // empty is fine — these are all optional fields

  if (type === 'lookup_party') {
    const hit = ctx.parties.find(p => p.name.toLowerCase() === target);
    return { id: hit?.id ?? null, found: !!hit };
  }
  if (type === 'lookup_matter') {
    const hit = ctx.matters.find(m => m.title.toLowerCase() === target);
    return { id: hit?.id ?? null, found: !!hit };
  }
  if (type === 'lookup_attorney') {
    const hit = ctx.attorneys.find(a => a.name.toLowerCase() === target);
    return { id: hit?.id ?? null, found: !!hit };
  }
  // practice area — match by key or label, case-insensitive
  const hit = ctx.practiceAreas.find(p => p.key.toLowerCase() === target || p.label.toLowerCase() === target);
  return { id: hit?.id ?? null, found: !!hit };
}

export function resolveRow(
  index: number,
  rawRow: Record<string, string>,
  fields: ImportFieldDef[],
  mapping: Record<string, string | null>,
  ctx: ImportLookupContext,
): ResolvedRow {
  const resolved: Record<string, any> = {};
  const issues: RowIssue[] = [];

  for (const field of fields) {
    const header = mapping[field.key];
    const raw = header ? (rawRow[header] ?? '') : '';
    const hasValue = raw.trim() !== '';

    if (!hasValue) {
      if (field.required) {
        issues.push({ field: field.key, message: `${field.label} is required`, severity: 'error' });
      } else if (field.defaultValue !== undefined) {
        resolved[field.key] = field.defaultValue;
      }
      continue;
    }

    switch (field.type) {
      case 'text':
        resolved[field.key] = raw.trim();
        break;
      case 'enum': {
        const match = matchEnum(raw, field.enumValues!);
        if (match) {
          resolved[field.key] = match;
        } else if (field.required) {
          issues.push({ field: field.key, message: `"${raw}" isn't one of: ${field.enumValues!.join(', ')}`, severity: 'error' });
        } else {
          issues.push({ field: field.key, message: `"${raw}" isn't one of: ${field.enumValues!.join(', ')} — using default (${field.defaultValue})`, severity: 'warning' });
          resolved[field.key] = field.defaultValue;
        }
        break;
      }
      case 'date': {
        const iso = parseDateFlexible(raw);
        if (iso) {
          resolved[field.key] = iso;
        } else if (field.required) {
          issues.push({ field: field.key, message: `"${raw}" isn't a recognizable date`, severity: 'error' });
        } else {
          issues.push({ field: field.key, message: `"${raw}" isn't a recognizable date — left blank`, severity: 'warning' });
        }
        break;
      }
      case 'boolean': {
        const b = parseBoolean(raw);
        if (b !== undefined) {
          resolved[field.key] = b;
        } else {
          issues.push({ field: field.key, message: `"${raw}" isn't yes/no — using default (${field.defaultValue})`, severity: 'warning' });
          resolved[field.key] = field.defaultValue;
        }
        break;
      }
      case 'integer': {
        const n = parseIntegerField(raw);
        if (n !== undefined) {
          resolved[field.key] = n;
        } else {
          issues.push({ field: field.key, message: `"${raw}" isn't a whole number — using default (${field.defaultValue})`, severity: 'warning' });
          resolved[field.key] = field.defaultValue;
        }
        break;
      }
      case 'list':
        resolved[field.key] = parseList(raw);
        break;
      case 'lookup_party':
      case 'lookup_matter':
      case 'lookup_attorney':
      case 'lookup_practice_area': {
        const { id, found } = resolveLookup(raw, field.type, ctx);
        resolved[field.key] = id;
        if (!found) {
          issues.push({ field: field.key, message: `"${raw}" doesn't match an existing ${field.label.toLowerCase()} — left unlinked`, severity: 'warning' });
        }
        break;
      }
    }
  }

  const blocked = issues.some(i => i.severity === 'error');
  return { index, raw: rawRow, resolved, issues, blocked };
}

export function resolveAllRows(
  rows: Record<string, string>[],
  fields: ImportFieldDef[],
  mapping: Record<string, string | null>,
  ctx: ImportLookupContext,
): ResolvedRow[] {
  return rows.map((row, i) => resolveRow(i, row, fields, mapping, ctx));
}

// ─────────────────────────────────────────────────────────────────────
// Resolved generic fields (name/client_name/practice_area/...) → the
// actual DB column shape for each table. Kept as pure functions so the
// mapping from "what the CSV said" to "what gets written" is directly
// testable, not buried in the UI component.
// ─────────────────────────────────────────────────────────────────────

export function toPartyInsert(resolved: Record<string, any>): Record<string, any> {
  return {
    name: resolved.name,
    party_type: resolved.party_type ?? 'individual',
    aliases: resolved.aliases ?? [],
    ...(resolved.notes ? { notes: resolved.notes } : {}),
  };
}

// stage_id is ALWAYS the firm's initial/intake stage, never CSV-mappable
// — the conflict-check gate trigger only fires on an UPDATE of stage_id,
// not on INSERT, so inserting directly into a later stage would silently
// bypass the one mechanism this product treats as non-negotiable. See
// migration 0012's comment and the live-verification notes for this task.
export function toMatterInsert(resolved: Record<string, any>, initialStageId: string): Record<string, any> {
  return {
    title: resolved.title,
    practice_area_id: resolved.practice_area ?? null,
    stage_id: initialStageId,
    client_party_id: resolved.client_name ?? null,
    assigned_attorney_id: resolved.assigned_attorney ?? null,
    status: resolved.status ?? 'active',
    billing_type: resolved.billing_type ?? 'hourly',
    conflict_check_id: null,
    opened_date: resolved.opened_date ?? new Date().toISOString().slice(0, 10),
    ...(resolved.description ? { description: resolved.description } : {}),
  };
}

export function toDeadlineInsert(resolved: Record<string, any>): Record<string, any> {
  return {
    title: resolved.title,
    matter_id: resolved.matter_title ?? null,
    deadline_type: resolved.deadline_type ?? 'other',
    due_date: resolved.due_date,
    status: resolved.status ?? 'upcoming',
    assigned_to: resolved.assigned_to ?? null,
    is_critical: resolved.is_critical ?? false,
    reminder_days_before: resolved.reminder_days_before ?? 7,
  };
}
