// Builds the firm-data context that goes into every AI prompt (Analyst,
// Operator, specialist agents) — deliberately, instead of the blind
// `JSON.stringify(context).substring(0, N)` this replaces.
//
// Why: confirmed via live volume testing (62 matters, 151 deadlines, 82
// parties) that the old approach cut off INSIDE the matters array before
// the deadlines/parties/conflictChecks keys were even reached — those
// categories were 100% invisible to the model, the cut JSON wasn't even
// syntactically valid, and nothing told the model (or the user) that
// anything was missing. Live-tested: asked the Analyst about upcoming
// deadlines with no assigned attorney; it had zero deadline data to
// answer from, and the UI's "Context in use" panel claimed otherwise.
//
// This fixes both problems:
//  1. An aggregate-stats summary is ALWAYS included in full, however
//     large the dataset — so counting/urgency questions ("how many
//     deadlines are overdue") stay answerable regardless of budget.
//  2. Remaining budget is filled with complete records only (never cut
//     mid-object), prioritized toward what's most likely relevant
//     (deadlines by urgency, matters missing an attorney) rather than
//     "whatever happened to serialize first."
//  3. Any category that didn't fully fit says so explicitly, in the text
//     itself, so the model can and should tell the user its view is
//     partial instead of silently answering as if it saw everything.

type Json = any;

// Calendar-date difference, NOT elapsed real time. due_date is a plain
// calendar date with no time component — comparing it against Date.now()
// (a real instant, carrying the current time-of-day) meant a deadline
// exactly 8 calendar days out would compute dd=7 any time before roughly
// midnight, because only ~7-and-a-fraction real days had elapsed yet.
// Confirmed live: at 4:14pm on 2026-08-14, three deadlines actually due
// 2026-08-22 (8 days out, correctly outside a "next 7 days" window) came
// back as dd=7 and got miscounted into that bucket — inflating "deadlines
// due within 7 days" from a real 11 to a reported 14. Both sides are now
// anchored to UTC midnight of their respective calendar dates, so the
// result is an exact integer day-count independent of what time it is
// right now or what timezone the browser is in.
function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dueUTC = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueUTC - todayUTC) / 86400000);
}

// Domain-aware ordering for the two record types most worth seeing
// complete first. Anything else (parties, conflictChecks, documents,
// practiceAreas, ...) is left in whatever order the caller passed it.
function priorityOrder(key: string, records: Json[]): Json[] {
  if (key === 'deadlines') {
    return [...records].sort((a, b) => {
      const ac = !!a?.is_critical, bc = !!b?.is_critical;
      if (ac !== bc) return ac ? -1 : 1;
      const ad = a?.due_date ? daysUntil(a.due_date) : Infinity;
      const bd = b?.due_date ? daysUntil(b.due_date) : Infinity;
      return ad - bd;
    });
  }
  if (key === 'matters') {
    return [...records].sort((a, b) => {
      const au = !a?.assigned_attorney_id, bu = !b?.assigned_attorney_id;
      if (au !== bu) return au ? -1 : 1;
      return String(b?.opened_date ?? '').localeCompare(String(a?.opened_date ?? ''));
    });
  }
  return records;
}

// Greedily includes whole records up to the char budget — never a
// partial/mid-object cut, so what's included is always valid JSON.
function fillBudget(records: Json[], budgetChars: number): { included: Json[]; text: string } {
  const included: Json[] = [];
  let used = 2; // '[' + ']'
  for (const r of records) {
    const piece = JSON.stringify(r);
    const additional = piece.length + (included.length > 0 ? 1 : 0); // + comma
    if (used + additional > budgetChars) break;
    included.push(r);
    used += additional;
  }
  return { included, text: JSON.stringify(included) };
}

function summarizeMatters(matters: Json[]) {
  const byStatus: Record<string, number> = {};
  let unassigned = 0;
  for (const m of matters) {
    const status = m?.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (!m?.assigned_attorney_id) unassigned++;
  }
  return { total: matters.length, by_status: byStatus, with_no_assigned_attorney: unassigned };
}

function summarizeDeadlines(deadlines: Json[]) {
  let overdue = 0, dueWithin7 = 0, dueWithin30 = 0, critical = 0, unassigned = 0;
  for (const d of deadlines) {
    if (d?.status === 'upcoming' && d?.due_date) {
      const dd = daysUntil(d.due_date);
      if (dd < 0) overdue++;
      else if (dd <= 7) dueWithin7++;
      else if (dd <= 30) dueWithin30++;
    }
    if (d?.is_critical) critical++;
    if (!d?.assigned_to) unassigned++;
  }
  return {
    total: deadlines.length, overdue, due_within_7_days: dueWithin7, due_within_30_days: dueWithin30,
    critical, with_no_assigned_attorney: unassigned,
  };
}

const SECTION_LABEL: Record<string, string> = {
  matters: 'MATTERS', deadlines: 'DEADLINES', parties: 'PARTIES', conflictChecks: 'CONFLICT CHECKS',
  documents: 'DOCUMENTS', practiceAreas: 'PRACTICE AREAS',
};

export interface ContextUsage {
  included: number;
  total: number;
}

export interface ContextBuildResult {
  text: string;
  truncated: boolean;
  // Per array-field usage (e.g. { matters: {included: 5, total: 62}, ... }) —
  // only keys actually present in the input context appear here.
  usage: Record<string, ContextUsage>;
}

// `context` mixes array fields (matters/deadlines/parties/...), which get
// the summarize+prioritize+budget treatment, with small scalar/object
// fields (e.g. firm_jurisdiction), which are always included verbatim in
// the summary since they're tiny and not the source of the problem.
export function buildFirmContext(context: Record<string, Json>, totalBudgetChars: number): ContextBuildResult {
  const arrayKeys = Object.keys(context).filter(k => Array.isArray(context[k]));
  const scalarKeys = Object.keys(context).filter(k => !Array.isArray(context[k]));

  const summary: Record<string, Json> = {};
  for (const k of scalarKeys) summary[k] = context[k];
  if (arrayKeys.includes('matters')) summary.matters_summary = summarizeMatters(context.matters);
  if (arrayKeys.includes('deadlines')) summary.deadlines_summary = summarizeDeadlines(context.deadlines);
  for (const k of arrayKeys) {
    if (k === 'matters' || k === 'deadlines') continue;
    summary[`${k}_total`] = (context[k] as Json[]).length;
  }
  const summaryText = JSON.stringify(summary);

  // Whatever's left after the (always-complete) summary is split across
  // the array fields, each section reclaiming budget the previous one
  // didn't need so a short category doesn't waste space earmarked for a
  // longer one still to come.
  let remaining = Math.max(0, totalBudgetChars - summaryText.length - arrayKeys.length * 150);
  const sections: string[] = [];
  const usage: Record<string, ContextUsage> = {};
  let truncated = false;

  arrayKeys.forEach((key, idx) => {
    const remainingKeys = arrayKeys.length - idx;
    const share = Math.floor(remaining / remainingKeys);
    const ordered = priorityOrder(key, context[key]);
    const { included, text } = fillBudget(ordered, share);
    remaining -= text.length;
    usage[key] = { included: included.length, total: ordered.length };
    const omitted = ordered.length - included.length;
    if (omitted > 0) truncated = true;

    const orderingNote = key === 'deadlines'
      ? ', prioritized by urgency (critical and soonest-due first)'
      : key === 'matters'
        ? ', prioritized by unassigned attorney first'
        : '';
    const omissionNote = omitted > 0
      ? ` (...${omitted} more omitted for length — the SUMMARY above still covers all ${ordered.length}; ask about a specific matter, attorney, or date range to see more of these directly.)`
      : '';
    sections.push(
      `${SECTION_LABEL[key] ?? key.toUpperCase()} — showing ${included.length} of ${ordered.length}${orderingNote}: ${text}${omissionNote}`
    );
  });

  const text = `SUMMARY (covers the FULL dataset — always complete, regardless of what's included below): ${summaryText}\n\n${sections.join('\n\n')}`;

  return { text, truncated, usage };
}
