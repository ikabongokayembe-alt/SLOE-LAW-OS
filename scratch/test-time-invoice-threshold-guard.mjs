import { findUnbilledMatters } from '../src/lib/riskSignals.ts';

console.log('=== Testing findUnbilledMatters Threshold Enforcement ===');

const now = new Date(2026, 7, 21, 10, 0, 0).getTime(); // Aug 21, 2026

const mockMatters = [
  { id: 'm-weston', title: 'Weston v. Castellan Freight', status: 'active' },
  { id: 'm-meridian', title: 'Meridian Freight Services - Advisory', status: 'active' },
];

const mockTimeEntries = [
  // Weston: 3 hrs (180 min), oldest entry 35 days ago -> SHOULD BE FLAGGED
  { id: 't-1', matter_id: 'm-weston', duration_minutes: 180, billable: true, date: '2026-07-17', invoice_id: null },
  
  // Meridian Freight: 3 hrs (180 min), but only 9 days ago -> SHOULD NOT BE FLAGGED
  { id: 't-2', matter_id: 'm-meridian', duration_minutes: 180, billable: true, date: '2026-08-12', invoice_id: null },
];

const unbilled = findUnbilledMatters(mockMatters, mockTimeEntries, now);

console.log('Unbilled matters found:');
console.log(JSON.stringify(unbilled, null, 2));

const isWestonFlagged = unbilled.some(u => u.matter.id === 'm-weston');
const isMeridianFlagged = unbilled.some(u => u.matter.id === 'm-meridian');

console.log(`Weston (35 days old, 180 min): isFlagged = ${isWestonFlagged} (expected: true)`);
console.log(`Meridian (9 days old, 180 min): isFlagged = ${isMeridianFlagged} (expected: false)`);

if (!isWestonFlagged || isMeridianFlagged) {
  console.error('FAIL: findUnbilledMatters threshold check failed');
  process.exit(1);
}

console.log('✅ THRESHOLD CHECK TEST PASSED SUCCESSFULLY!');
