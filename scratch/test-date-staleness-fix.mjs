import { daysUntilDateOnly, daysBetweenDateOnly } from '../src/lib/dates.ts';
import { assessDeadlineRisk } from '../src/lib/riskSignals.ts';
import { buildUrgentActions } from '../src/lib/urgentActions.ts';

console.log('=== Step 1: Testing Date Math Consistency ===');

// Mock target date: Aug 21, 2026 at 10:11 AM
const now = new Date(2026, 7, 21, 10, 11, 25).getTime();
const dueAug19 = '2026-08-19';

const daysLeft = daysUntilDateOnly(dueAug19, now);
const daysPassed = daysBetweenDateOnly(dueAug19, now);

console.log(`dueAug19 (${dueAug19}) evaluated on Aug 21, 2026:`);
console.log(`  daysUntilDateOnly: ${daysLeft} (expected: -2)`);
console.log(`  daysBetweenDateOnly: ${daysPassed} (expected: 2)`);

if (daysLeft !== -2 || daysPassed !== 2) {
  console.error(`FAIL: expected daysLeft = -2 and daysPassed = 2, got ${daysLeft} / ${daysPassed}`);
  process.exit(1);
}
console.log('✅ Date Math Consistency Passed!');

console.log('\n=== Step 2: Testing assessDeadlineRisk Overdue Day Count ===');

const mockDeadline = {
  id: 'd-19',
  title: 'Term Sheet Review',
  due_date: '2026-08-19',
  status: 'upcoming',
  matter_id: 'm-brightpath',
  deadline_type: 'filing',
};

const risk = assessDeadlineRisk(mockDeadline, [mockDeadline], [], [], now);
console.log('assessDeadlineRisk result:');
console.log(JSON.stringify(risk, null, 2));

if (risk.level !== 'at_risk' || !risk.reasons.some(r => r.includes('Overdue by 2 days'))) {
  console.error(`FAIL: expected "Overdue by 2 days.", got ${JSON.stringify(risk.reasons)}`);
  process.exit(1);
}
console.log('✅ assessDeadlineRisk Passed!');

console.log('\n=== Step 3: Testing buildUrgentActions Overdue Detail Count ===');

const mockMatter = {
  id: 'm-brightpath',
  title: 'Brightpath Ventures - Series A Formation',
  status: 'active',
};

const urgent = buildUrgentActions({
  matters: [mockMatter],
  deadlines: [mockDeadline],
  documents: [],
  timeEntries: [],
  communications: [],
  conflictChecks: [],
  parties: [],
}, now);

const overdueAction = urgent.find(x => x.id === 'overdue-d-19');

console.log('buildUrgentActions overdue result:');
console.log(JSON.stringify(overdueAction, null, 2));

if (!overdueAction || !overdueAction.detail.includes('2 days ago')) {
  console.error(`FAIL: expected detail to include "2 days ago", got "${overdueAction?.detail}"`);
  process.exit(1);
}
console.log('✅ buildUrgentActions Passed!');

console.log('\n🎉 ALL DATE STALENESS & OVERDUE DISCREPANCY TESTS PASSED!');
