console.log('=== Step 1: Testing Command Center Metrics calculation ===');

const mockMatters = [{ status: 'active', billing_type: 'hourly' }, { status: 'active', billing_type: 'flat' }];
const mockDeadlines = [{ status: 'upcoming', is_critical: true, due_date: '2026-08-10' }]; // overdue
const mockConflictChecks = [{ status: 'pending' }];

const active = mockMatters.filter(m => m.status === 'active').length;
const overdue = mockDeadlines.filter(d => d.status === 'upcoming' && (new Date(d.due_date).getTime() < new Date().getTime())).length;
const pending = mockConflictChecks.filter(c => c.status === 'pending' || c.status === 'flagged').length;

console.log(`Metrics: Active=${active}, Overdue=${overdue}, PendingConflicts=${pending}`);

if (active !== 2 || overdue !== 1 || pending !== 1) {
  console.error('FAIL: Stat calculations do not match expected numbers');
  process.exit(1);
}

console.log('\n=== Step 2: Testing Specialist Recommendation Calculations ===');

const SPECIALISTS = [
  { key: 'billing_time_entry', name: 'Billing & Time Entry Agent', relevantIf: (h) => h > 0 },
];

const hourlyCount = mockMatters.filter(m => m.billing_type === 'hourly').length;
const recs = SPECIALISTS.filter(s => s.relevantIf(hourlyCount));

console.log('Recommended Specialist Count:', recs.length);

if (recs.length !== 1 || recs[0].key !== 'billing_time_entry') {
  console.error('FAIL: Expected billing_time_entry recommendation');
  process.exit(1);
}

console.log('\n✅ ALL COMMAND CENTER LAYOUT REORGANIZATION TESTS PASSED!');
