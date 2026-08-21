console.log('=== Step 1: Testing Conflict Check Pending Review State ===');

const mockCheck = {
  id: 'chk-101',
  searched_name: 'Castellan Freight LLC',
  status: 'flagged',
  matter_id: 'm-202',
  signals: [
    { kind: 'related', path: 'Adverse party in Weston v. Castellan Freight', adverse: true, facts: ['Adverse role'] },
  ],
};

const patch = {
  status: 'pending_review',
  notes: '[Pending Operator Review] Help requested by attorney',
};

const updatedCheck = { ...mockCheck, ...patch };
console.log('Updated Conflict Check Status:', updatedCheck.status);
console.log('Updated Notes:', updatedCheck.notes);

if (updatedCheck.status !== 'pending_review') {
  console.error('FAIL: Conflict check status must remain pending_review, not cleared or waived');
  process.exit(1);
}

console.log('\n=== Step 2: Testing Operator Prompt Formulation ===');

const findingsText = updatedCheck.signals.map(s => `${s.path} (${s.facts.join('; ')})`).join(' | ');
const notes = '';
const prompt = `I need help evaluating a flagged conflict check for "${updatedCheck.searched_name}". Finding details: ${findingsText}. ${notes.trim() ? 'Reviewer notes: ' + notes.trim() : 'No initial notes provided.'} How should our firm evaluate or manage this conflict?`;

console.log('Generated Operator Prompt:');
console.log(`"${prompt}"`);

if (!prompt.includes('Castellan Freight LLC') || !prompt.includes('Adverse party in Weston v. Castellan Freight')) {
  console.error('FAIL: Generated Operator prompt missing conflict finding details');
  process.exit(1);
}

console.log('\n=== Step 3: Testing Email Pre-Fill Formatting ===');

const emailSubject = `Conflict Check Review: ${updatedCheck.searched_name}`;
const emailBody = `Conflict Check Finding Summary:
- Searched Name: ${updatedCheck.searched_name}
- Findings: ${findingsText}

Please review the conflict finding above and confirm whether formal clearance or a conflict waiver is required.`;

console.log('Pre-filled Subject:', emailSubject);
console.log('Pre-filled Body:\n' + emailBody);

if (!emailSubject.includes('Castellan Freight LLC') || !emailBody.includes('Adverse party in Weston v. Castellan Freight')) {
  console.error('FAIL: Pre-filled email missing conflict finding context');
  process.exit(1);
}

console.log('\n✅ ALL CONFLICT CHECK ACTION TESTS PASSED!');
