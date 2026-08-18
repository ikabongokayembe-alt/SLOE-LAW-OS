// The intelligence layer's foundation: what needs a decision right now.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THIS IS DETERMINISTIC AND NOT A MODEL CALL
//
// The reference implementation (Realty OS UrgentActionsCard) contains no
// AI at all. Its striking example —
//   "Follow up with Sarah Mitchell (BHD 250,000-300,000 budget) — No
//    contact in 141 days, currently in viewing scheduled. 3 Amwaj
//    waterfront units, cash buyer, financing via Al Salam Bank pending."
// — decomposes into a template over `lead.name` and budget columns, a
// computed day count, `lead.stage`, and `lead.interest_description`
// rendered verbatim. The rule is `stage ∈ active && hoursSince >= 48`.
//
// The perceived intelligence comes from three things, none of them a
// model: a consequence RULE, DATA DENSITY on the record, and a card
// SHAPE (title / description / reasoning / action).
//
// That inversion matters here more than it did there, because this brief
// asks for legal-domain reasoning AND forbids fabricated citations —
// which pull against each other the moment a model writes the text. A
// detector reading real columns cannot invent a statute, a deadline, or
// a jurisdiction rule. It can only be wrong about emphasis.
//
// So: rules detect and rank. Every string below is built from values
// that exist in the database. Where a claim is general professional
// risk rather than a verified jurisdictional rule, it is phrased as
// such and marked `grounding: 'general'` so the UI can label it. Only
// the SOL engine's verified citations may ever be marked 'verified'.
// ─────────────────────────────────────────────────────────────────────

import { Matter, Deadline, LawDocument, TimeEntry, MatterCommunication, ConflictCheck, Party } from '../types';
import { findUnbilledMatters } from './riskSignals';

// Ranked by the consequence a solo practitioner actually carries, not by
// date proximity. A missed filing is career risk; a quiet client is
// revenue risk; they should never sort together by "days".
export type ConsequenceClass =
  | 'professional'   // sanctions, malpractice, duty-of-competence exposure
  | 'revenue'        // billable work at risk, unbilled effort, stalled matters
  | 'relationship';  // client trust and communication

const CLASS_WEIGHT: Record<ConsequenceClass, number> = {
  professional: 300,
  revenue: 200,
  relationship: 100,
};

export interface UrgentAction {
  id: string;
  consequence: ConsequenceClass;
  // Sorting score within and across classes. Class dominates; severity
  // orders within it.
  score: number;
  // The decision, named as an action. Never a count.
  title: string;
  // The specific facts that make it true, from real columns.
  detail: string;
  // Why it matters. `grounding` governs how the UI may present it.
  reasoning: string;
  grounding: 'fact' | 'general';
  // Where the user goes to act. No detector performs an action itself —
  // everything with legal consequence is surfaced, never executed.
  ctaLabel: string;
  href: string;
}

export interface ActionInputs {
  matters: Matter[];
  deadlines: Deadline[];
  documents: LawDocument[];
  timeEntries: TimeEntry[];
  communications: MatterCommunication[];
  conflictChecks: ConflictCheck[];
  parties: Party[];
}

const DAY = 86400000;

function daysBetween(iso: string, now: number): number {
  return Math.round((now - new Date(iso).getTime()) / DAY);
}
function daysUntil(iso: string, now: number): number {
  return Math.round((new Date(iso).getTime() - now) / DAY);
}
function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Thresholds are named constants rather than inline numbers so they can
// be argued with. None of them is a legal rule; they are practice
// heuristics, and the UI never presents them as jurisdiction-specific.
const STALE_CONTACT_DAYS = 21;   // an active matter silent for three weeks
const PREP_SIGNAL_DAYS = 14;     // window for "has work happened on this"
const IMMINENT_DAYS = 7;         // a deadline close enough that prep matters

export function buildUrgentActions(input: ActionInputs, now = Date.now()): UrgentAction[] {
  const { matters, deadlines, documents, timeEntries, communications, conflictChecks } = input;
  const out: UrgentAction[] = [];

  const activeMatters = matters.filter(m => m.status === 'active' && !m.deleted_at);
  const matterById = new Map(activeMatters.map(m => [m.id, m]));
  const titleOf = (id: string | null | undefined) =>
    (id && matterById.get(id)?.title) || 'an unlinked matter';

  // ── 1. Overdue deadlines ───────────────────────────────────────────
  // Highest consequence in the product. Phrased as professional risk in
  // general terms — no jurisdiction claim, because none is verifiable
  // from this data.
  for (const d of deadlines) {
    if (d.status !== 'upcoming' || d.deleted_at) continue;
    const overdueBy = -daysUntil(d.due_date, now);
    if (overdueBy <= 0) continue;
    out.push({
      id: `overdue-${d.id}`,
      consequence: 'professional',
      score: CLASS_WEIGHT.professional + Math.min(overdueBy, 60) + (d.is_critical ? 30 : 0),
      title: `Address the missed ${d.title} on ${titleOf(d.matter_id)}`,
      detail: `Due ${new Date(d.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} — ${plural(overdueBy, 'day')} ago${d.is_critical ? ', flagged critical' : ''}.`,
      reasoning: 'A missed filing date generally carries professional-responsibility exposure and often needs a curative filing rather than silence. The specific consequence depends on your jurisdiction and the court — this flag is a prompt to decide, not a rule.',
      grounding: 'general',
      ctaLabel: 'Open deadline',
      href: '/deadlines',
    });
  }

  // ── 2. Imminent critical deadline with no sign of prep ─────────────
  // The cross-table judgement the brief asked for: a deadline days away
  // on a matter with no recent time entries AND no recent documents is
  // materially different from one being actively worked.
  for (const d of deadlines) {
    if (d.status !== 'upcoming' || d.deleted_at || !d.matter_id) continue;
    const left = daysUntil(d.due_date, now);
    if (left < 0 || left > IMMINENT_DAYS || !d.is_critical) continue;
    const recentTime = timeEntries.some(
      t => t.matter_id === d.matter_id && daysBetween(t.date, now) <= PREP_SIGNAL_DAYS);
    const recentDocs = documents.some(
      x => x.matter_id === d.matter_id && daysBetween(x.created_at, now) <= PREP_SIGNAL_DAYS);
    if (recentTime || recentDocs) continue;
    out.push({
      id: `unprepped-${d.id}`,
      consequence: 'professional',
      score: CLASS_WEIGHT.professional + (IMMINENT_DAYS - left) * 3,
      title: `No recorded prep for ${d.title} on ${titleOf(d.matter_id)}`,
      detail: `Due in ${plural(left, 'day')}. No time logged and no document filed against this matter in the last ${PREP_SIGNAL_DAYS} days.`,
      reasoning: 'Absence of time entries and documents is not proof no work happened — it may only mean nothing was recorded. Either way it is worth confirming before the date, because it is the same signal you would see if it had genuinely been missed.',
      grounding: 'fact',
      ctaLabel: 'Open matter',
      href: '/matters',
    });
  }

  // ── 3. Active matter with no conflict check ────────────────────────
  for (const m of activeMatters) {
    const has = m.conflict_check_id ||
      conflictChecks.some(c => c.matter_id === m.id && c.status === 'cleared');
    if (has) continue;
    out.push({
      id: `noconflict-${m.id}`,
      consequence: 'professional',
      score: CLASS_WEIGHT.professional + 20,
      title: `Run a conflict check on ${m.title}`,
      detail: m.opened_date
        ? `Active since ${new Date(m.opened_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} with no cleared conflict check on file.`
        : 'Active with no cleared conflict check on file.',
      reasoning: 'Conflict screening is normally expected before substantive work, and the record of having run it matters as much as the result. This is a gap in the file, not an allegation that a conflict exists.',
      grounding: 'fact',
      ctaLabel: 'Run check',
      href: '/parties',
    });
  }

  // ── 4. Stale client contact — the Realty OS port ───────────────────
  // Same rule shape as the reference (active + silent beyond a window),
  // reading matter_communications instead of lead.last_contact.
  for (const m of activeMatters) {
    const last = communications
      .filter(c => c.matter_id === m.id)
      .map(c => new Date(c.sent_at).getTime())
      .sort((a, b) => b - a)[0];
    const silentFor = last ? Math.round((now - last) / DAY) : null;
    if (silentFor !== null && silentFor < STALE_CONTACT_DAYS) continue;
    // A matter with no logged communication at all is a weaker signal
    // than one that went quiet — it may simply predate the integration.
    const openedDays = m.opened_date ? daysBetween(m.opened_date, now) : null;
    if (silentFor === null && (openedDays === null || openedDays < STALE_CONTACT_DAYS)) continue;
    out.push({
      id: `stale-${m.id}`,
      consequence: 'relationship',
      score: CLASS_WEIGHT.relationship + Math.min(silentFor ?? openedDays ?? 0, 180),
      title: `Check in with the client on ${m.title}`,
      detail: silentFor !== null
        ? `No logged contact in ${plural(silentFor, 'day')} on an active matter.`
        : `No client contact has ever been logged on this matter, open ${plural(openedDays!, 'day')}.`,
      reasoning: 'Silence on an active matter is the most common source of client complaints, and it is cheap to fix. Draft a short update rather than waiting for them to ask.',
      grounding: 'fact',
      ctaLabel: 'Draft update',
      href: '/communications',
    });
  }

  // ── 5. Unbilled work — revenue risk ────────────────────────────────
  // Detection lives in riskSignals.ts's findUnbilledMatters -- the Time
  // screen's own banner reads from the exact same function, so the two
  // surfaces can't disagree about which matters qualify.
  //
  // Entries already covered by a generated invoice (see lib/invoice.ts /
  // migration 0025) are filtered out HERE, at the call site -- never
  // inside findUnbilledMatters itself, which stays untouched. Same filter
  // TimeEntriesScreen.tsx applies before its own call, so Command Center
  // and Time can never disagree about which entries still count.
  for (const u of findUnbilledMatters(matters, timeEntries.filter(t => !t.invoice_id), now)) {
    out.push({
      id: `unbilled-${u.matter.id}`,
      consequence: 'revenue',
      score: CLASS_WEIGHT.revenue + Math.min(Math.round(u.minutes / 60), 80),
      title: `Bill the logged time on ${u.matter.title}`,
      detail: `${(u.minutes / 60).toFixed(1)} billable hours recorded, oldest entry ${plural(u.ageDays, 'day')} old.`,
      reasoning: 'Time recorded but not invoiced is the most recoverable revenue in a small practice, and it gets harder to justify to a client the longer it sits.',
      grounding: 'fact',
      ctaLabel: 'Open time',
      href: '/time',
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

// The Command Center shows a decision list, not everything that could be
// said. Cap it so the surface stays a shortlist — the full sets live on
// their own screens, and a list long enough to scroll is a report again.
export function topUrgentActions(input: ActionInputs, limit = 5, now = Date.now()): UrgentAction[] {
  return buildUrgentActions(input, now).slice(0, limit);
}
