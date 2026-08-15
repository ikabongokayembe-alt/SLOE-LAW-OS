import { DeadlineRule } from '../types';

// Dev/mock-mode mirror of supabase/migrations/0011_deadline_rules.sql's
// seed rows — same four values, same citations, verbatim. This is NOT a
// second source of truth: the migration is authoritative for the live
// database; this file exists only so local dev (isSupabaseConfigured
// false) can exercise the rule-matching UI meaningfully without a real
// backend. If the migration's seed data ever changes, this must change
// with it — do not let these drift into two different answers for the
// same statute.
export const deadlineRules: DeadlineRule[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    country: 'US', region: 'TX', practice_area: 'personal_injury', trigger_event: 'injury_date',
    duration_value: 2, duration_unit: 'years', rule_type: 'deadline',
    exceptions: null,
    citation: 'Tex. Civ. Prac. & Rem. Code §16.003(a)',
    source_verified_at: new Date().toISOString().slice(0, 10),
    business_days_only: false,
    notes: 'Also covers property damage, trespass.',
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    country: 'US', region: 'TX', practice_area: 'personal_injury', trigger_event: 'death_date',
    duration_value: 2, duration_unit: 'years', rule_type: 'deadline',
    exceptions: null,
    citation: 'Tex. Civ. Prac. & Rem. Code §16.003(b)',
    source_verified_at: new Date().toISOString().slice(0, 10),
    business_days_only: false,
    notes: 'Wrongful death — clock starts at death, not the underlying injury date.',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    country: 'US', region: 'TX', practice_area: 'corporate', trigger_event: 'breach_date',
    duration_value: 4, duration_unit: 'years', rule_type: 'deadline',
    exceptions: null,
    citation: 'Tex. Civ. Prac. & Rem. Code §16.004',
    source_verified_at: new Date().toISOString().slice(0, 10),
    business_days_only: false,
    notes: "Applies to written and oral contracts alike; discovery rule may apply for concealed/latent breaches — flag for attorney judgment, don't auto-resolve.",
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    country: 'US', region: 'TX', practice_area: 'family', trigger_event: 'prior_order_date',
    duration_value: 1, duration_unit: 'years', rule_type: 'restriction',
    exceptions: 'Endangerment affidavit; mutual consent of all parties; 6-month relinquishment of primary residence to another party.',
    citation: 'Tex. Fam. Code §156.102',
    source_verified_at: new Date().toISOString().slice(0, 10),
    business_days_only: false,
    notes: 'Restricts EARLY filing to change primary-residence designation — not a deadline to file by. The inverse shape of the other three rows in this table.',
  },
];
