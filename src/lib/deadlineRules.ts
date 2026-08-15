import { DeadlineRule } from '../types';

// Statute-of-limitations engine — deterministic matching and date math
// only. Nothing in this file talks to an AI model, and nothing here
// should ever be replaced with one: see migration 0011's comment for why
// that boundary is non-negotiable (a fabricated citation is legal
// malpractice risk, not a UX nitpick).

export const TRIGGER_EVENT_LABELS: Record<string, string> = {
  injury_date: 'Date of injury',
  death_date: 'Date of death',
  breach_date: 'Date of breach',
  prior_order_date: 'Date of the prior order being modified',
};

export function triggerEventLabel(triggerEvent: string): string {
  return TRIGGER_EVENT_LABELS[triggerEvent] ?? triggerEvent.replace(/_/g, ' ');
}

// A practice area can legitimately have more than one applicable rule
// (e.g. personal_injury has both a standard-injury row and a
// wrongful-death row, keyed by different trigger_events) — the correct
// behavior is to surface every match and let the person pick which one
// actually fits their matter's facts, never to silently pick the first
// one. region === null on a rule means "applies regardless of the firm's
// region" (a hypothetical future national-level rule); every current
// seed row has a concrete region, so this only matters going forward.
export function findMatchingRules(
  rules: DeadlineRule[],
  country: string | null | undefined,
  region: string | null | undefined,
  practiceAreaKey: string | null | undefined,
): DeadlineRule[] {
  if (!country || !practiceAreaKey) return [];
  return rules.filter(r =>
    r.country === country &&
    (r.region === null || r.region === region) &&
    r.practice_area === practiceAreaKey
  );
}

// Calendar-day/month/year arithmetic only — deliberately simple, per the
// task this shipped under. business_days_only exists as a schema
// placeholder for later; nothing here accounts for weekends or court
// holidays, and the disclaimer shown alongside any computed date says so
// honestly rather than silently overpromising precision this doesn't have.
// Parses the trigger date as calendar-local (not via new Date(isoString),
// which parses bare YYYY-MM-DD as UTC midnight and can shift a day
// depending on the viewer's timezone).
export function computeRuleDate(rule: DeadlineRule, triggerDateISO: string): string {
  const [y, m, d] = triggerDateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  switch (rule.duration_unit) {
    case 'years': date.setFullYear(date.getFullYear() + rule.duration_value); break;
    case 'months': date.setMonth(date.getMonth() + rule.duration_value); break;
    case 'days': date.setDate(date.getDate() + rule.duration_value); break;
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 'restriction' rules (§156.102's shape) are the INVERSE of a normal SOL:
// an earliest-eligible date, not a must-file-by deadline. This label is
// what keeps that from silently rendering backwards in the UI — the one
// failure mode explicitly called out as most likely to get built wrong.
export function ruleFramingLabel(rule: DeadlineRule): string {
  return rule.rule_type === 'restriction' ? 'Earliest filing date' : 'Filing deadline';
}

export function ruleFramingSentence(rule: DeadlineRule, computedDate: string): string {
  return rule.rule_type === 'restriction'
    ? `Cannot file until ${computedDate} — earliest eligible date, not a deadline.`
    : `Must file by ${computedDate}.`;
}

export function deadlineTitleFromRule(rule: DeadlineRule): string {
  const label = rule.rule_type === 'restriction' ? 'Earliest filing date' : 'Statute of limitations deadline';
  return `${label} — ${rule.citation}`;
}

// Shown next to every rule-generated deadline, verbatim boundary
// language — not optional decoration.
export function ruleDisclaimer(rule: DeadlineRule): string {
  return `Rule-based, verified ${rule.source_verified_at} — confirm against the current statute before relying on this for a filing decision.`;
}
