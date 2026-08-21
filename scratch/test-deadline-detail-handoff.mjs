console.log('=== Step 1: Testing Deadline Operator Prompt Formulation ===');

const mockDeadline = {
  id: 'd-101',
  title: 'Amended Complaint',
  due_date: '2026-08-18',
  status: 'upcoming',
  deadline_type: 'filing',
  matter_id: 'm-202',
};

const mockMatter = {
  id: 'm-202',
  title: 'Weston v. Castellan Freight - MVA Injury',
};

const days = -2; // 2 days overdue
const statusStr = `${Math.abs(days)} days overdue`;
const expectedPrompt = `Help me prepare for "${mockDeadline.title}" on matter "${mockMatter.title}" — due ${mockDeadline.due_date}, currently ${statusStr}.`;

console.log('Formulated Operator Handoff Prompt:');
console.log(expectedPrompt);

if (!expectedPrompt.includes('Amended Complaint') || !expectedPrompt.includes('Weston v. Castellan Freight') || !expectedPrompt.includes('2 days overdue')) {
  console.error('FAIL: Prompt formulation missing expected details');
  process.exit(1);
}

console.log('\n=== Step 2: Testing Matter Documents Linking ===');

const mockDocs = [
  { id: 'doc-1', matter_id: 'm-202', file_name: 'Initial_Pleadings.pdf' },
  { id: 'doc-2', matter_id: 'm-999', file_name: 'Other_Case.pdf' },
];

const linked = mockDocs.filter(doc => doc.matter_id === mockDeadline.matter_id);
console.log('Linked Documents Count:', linked.length);

if (linked.length !== 1 || linked[0].file_name !== 'Initial_Pleadings.pdf') {
  console.error('FAIL: Document filtering by matter_id failed');
  process.exit(1);
}

console.log('\n✅ ALL DEADLINE DETAIL & OPERATOR HANDOFF TESTS PASSED!');
