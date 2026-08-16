// Sub-task 2: "compare against a norm" for Deadlines and Matters.
//
// ─────────────────────────────────────────────────────────────────────
// WHERE THE NORM COMES FROM, AND WHY IT ISN'T A CONSTANT
//
// The obvious implementation is a table of typical stage durations per
// practice area. That would be an invented professional claim — exactly
// what the SOL engine exists to avoid, and what this layer is forbidden
// to do. There is no verifiable source for "family law matters normally
// clear intake in 12 days", so this file does not pretend there is one.
//
// Instead the baseline is the FIRM'S OWN history: the median observed
// time other matters spent in the same stage, derived from audit_log
// rows where stage_id actually changed. A firm is compared against
// itself, which is both defensible and self-calibrating.
//
// Three honesty constraints follow from that, all enforced below:
//   * Below MIN_SAMPLES comparable transitions, there is NO norm and
//     nothing is flagged. "Not enough history yet" is a real answer.
//   * audit_log only covers changes since migration 0016 and the store
//     caps it at 500 rows, so a matter may have no recorded transition.
//     Those fall back to opened_date and are labelled "since opened",
//     never "in this stage" — a different claim, honestly stated.
//   * The multiplier that makes something "stuck" is named and blunt,
//     not tuned to look clever.
// ─────────────────────────────────────────────────────────────────────

import { Matter, Deadline, LawDocument, TimeEntry, AuditLogEntry, MatterStage } from '../types';

const DAY = 86400000;

// Below this many observed transitions for a stage, the firm has not
// told us what normal looks like and we say so instead of guessing.
const MIN_SAMPLES = 3;
// How far past the firm's own median counts as stuck. Deliberately
// generous — this should catch the genuinely stalled matter, not
// everything slightly above average.
const STUCK_MULTIPLIER = 2;
// Prep-signal window, matching urgentActions.ts so the two layers can't
// disagree about what "recent work" means.
const PREP_SIGNAL_DAYS = 14;

export interface StageEntry {
  at: number;
  // 'audit'  — a real recorded transition into the current stage.
  // 'opened' — no transition on record; this is time since the matter
  //            opened, which is an upper bound, not time in stage.
  source: 'audit' | 'opened';
}

// Most recent audit row where stage_id actually changed. Rows are
// scanned rather than assumed sorted, because the store's 500-row cap
// means the relevant transition may sit anywhere in what was returned.
export function deriveStageEntry(matter: Matter, auditLog: AuditLogEntry[]): StageEntry {
  let latest = 0;
  for (const e of auditLog) {
    if (e.table_name !== 'matters' || e.record_id !== matter.id || e.action !== 'update') continue;
    const from = e.old_values?.stage_id;
    const to = e.new_values?.stage_id;
    if (!to || from === to) continue;
    if (to !== matter.stage_id) continue; // a transition into some earlier stage
    const t = new Date(e.changed_at).getTime();
    if (t > latest) latest = t;
  }
  if (latest) return { at: latest, source: 'audit' };
  return { at: new Date(matter.opened_date).getTime(), source: 'opened' };
}

export interface StageNorm {
  medianDays: number;
  sampleSize: number;
}

// Median, not mean: one matter that sat for a year would drag a mean
// far enough to hide everything else.
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Observed durations are reconstructed from consecutive stage changes on
// the same matter: leaving stage X at time T2 having entered it at T1
// contributes (T2 - T1) to X's sample. Only COMPLETED spells count — a
// matter currently sitting in a stage tells us nothing about how long
// that stage takes, and including it would bias the norm toward whatever
// is currently stuck.
export function computeStageNorms(auditLog: AuditLogEntry[]): Map<string, StageNorm> {
  const byMatter = new Map<string, { at: number; from: any; to: any }[]>();
  for (const e of auditLog) {
    if (e.table_name !== 'matters' || e.action !== 'update') continue;
    const from = e.old_values?.stage_id;
    const to = e.new_values?.stage_id;
    if (!from || !to || from === to) continue;
    const arr = byMatter.get(e.record_id) ?? [];
    arr.push({ at: new Date(e.changed_at).getTime(), from, to });
    byMatter.set(e.record_id, arr);
  }

  const samples = new Map<string, number[]>();
  for (const [, events] of byMatter) {
    events.sort((a, b) => a.at - b.at);
    for (let i = 1; i < events.length; i++) {
      const entered = events[i - 1];
      const left = events[i];
      if (entered.to !== left.from) continue; // non-contiguous history
      const days = Math.round((left.at - entered.at) / DAY);
      if (days < 0) continue;
      const arr = samples.get(entered.to) ?? [];
      arr.push(days);
      samples.set(entered.to, arr);
    }
  }

  const norms = new Map<string, StageNorm>();
  for (const [stageId, xs] of samples) {
    if (xs.length < MIN_SAMPLES) continue; // no claim without evidence
    norms.set(stageId, { medianDays: median(xs), sampleSize: xs.length });
  }
  return norms;
}

export interface BottleneckMatter {
  matter: Matter;
  daysInStage: number;
  source: StageEntry['source'];
  norm: StageNorm;
  stageLabel: string;
  unowned: boolean;
  detail: string;
}

export function findBottlenecks(
  matters: Matter[], stages: MatterStage[], auditLog: AuditLogEntry[], now = Date.now(),
): BottleneckMatter[] {
  const norms = computeStageNorms(auditLog);
  if (norms.size === 0) return []; // firm has no baseline yet — say nothing
  const labelOf = new Map(stages.map(s => [s.id, s.label]));
  const out: BottleneckMatter[] = [];

  for (const m of matters) {
    if (m.status !== 'active' || m.deleted_at) continue;
    const norm = norms.get(m.stage_id);
    if (!norm) continue;
    const entry = deriveStageEntry(m, auditLog);
    const daysInStage = Math.round((now - entry.at) / DAY);
    if (daysInStage <= norm.medianDays * STUCK_MULTIPLIER) continue;

    const stageLabel = labelOf.get(m.stage_id) ?? 'this stage';
    const where = entry.source === 'audit' ? `in ${stageLabel}` : 'since opening';
    out.push({
      matter: m, daysInStage, source: entry.source, norm, stageLabel,
      unowned: !m.assigned_attorney_id,
      detail: `${daysInStage} days ${where} — this firm's other matters clear ${stageLabel} in about ${norm.medianDays} days (median of ${norm.sampleSize}).`
        + (entry.source === 'opened' ? ' No stage change is on record, so this is time since the matter opened, not time in this stage.' : '')
        + (!m.assigned_attorney_id ? ' No attorney assigned.' : ''),
    });
  }
  return out.sort((a, b) => b.daysInStage / b.norm.medianDays - a.daysInStage / a.norm.medianDays);
}

// ── Deadline risk ────────────────────────────────────────────────────

export type DeadlineRiskLevel = 'none' | 'watch' | 'at_risk';

export interface DeadlineRisk {
  level: DeadlineRiskLevel;
  // Each reason is a statement of observed fact, not a judgement.
  reasons: string[];
  // Later deadlines on the same matter, which is the only downstream
  // relationship derivable from this schema. Deliberately NOT presented
  // as legal dependency — nothing here knows that one filing legally
  // depends on another. It is stated as sequence, which is true.
  downstream: Deadline[];
}

export function assessDeadlineRisk(
  d: Deadline,
  all: Deadline[],
  timeEntries: TimeEntry[],
  documents: LawDocument[],
  now = Date.now(),
): DeadlineRisk {
  const reasons: string[] = [];
  const daysLeft = Math.round((new Date(d.due_date).getTime() - now) / DAY);
  const downstream = d.matter_id
    ? all.filter(x =>
        x.matter_id === d.matter_id && x.id !== d.id &&
        x.status === 'upcoming' && !x.deleted_at &&
        new Date(x.due_date).getTime() > new Date(d.due_date).getTime())
    : [];

  if (d.status !== 'upcoming' || d.deleted_at) return { level: 'none', reasons, downstream };

  if (daysLeft < 0) {
    reasons.push(`Overdue by ${-daysLeft} day${-daysLeft === 1 ? '' : 's'}.`);
    return { level: 'at_risk', reasons, downstream };
  }

  if (d.matter_id) {
    const recentTime = timeEntries.some(t => t.matter_id === d.matter_id && (now - new Date(t.date).getTime()) / DAY <= PREP_SIGNAL_DAYS);
    const recentDocs = documents.some(x => x.matter_id === d.matter_id && (now - new Date(x.created_at).getTime()) / DAY <= PREP_SIGNAL_DAYS);
    if (!recentTime && !recentDocs && daysLeft <= 14) {
      reasons.push(`No time logged and no document filed on this matter in ${PREP_SIGNAL_DAYS} days.`);
    }
  }
  if (!d.assigned_to) reasons.push('Nobody is assigned.');
  if (downstream.length > 0 && daysLeft <= 14) {
    reasons.push(`${downstream.length} later deadline${downstream.length === 1 ? '' : 's'} on this matter follow${downstream.length === 1 ? 's' : ''} it.`);
  }

  if (reasons.length === 0) return { level: 'none', reasons, downstream };
  // Critical + imminent + unprepared is the combination worth a strong
  // flag. Anything else that produced a reason is worth a quiet one.
  const level: DeadlineRiskLevel =
    d.is_critical && daysLeft <= 14 && reasons.length >= 2 ? 'at_risk' : 'watch';
  return { level, reasons, downstream };
}
