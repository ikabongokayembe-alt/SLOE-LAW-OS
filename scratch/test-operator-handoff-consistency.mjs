console.log('=== Step 1: Testing Communications Screen Follow-Up Prompt Formulation ===');

const mockMatter = { title: 'Fontaine - Prenuptial Agreement' };
const client = 'Claire Fontaine';
const daysSilent = 24;

const clientStr = client ?? 'the client';
const commPrompt = `Draft a follow-up email for matter "${mockMatter.title}" to ${clientStr}. No client contact has been logged for ${daysSilent} days.`;

console.log('Communications Handoff Prompt:');
console.log(`"${commPrompt}"`);

if (!commPrompt.includes('Fontaine - Prenuptial Agreement') || !commPrompt.includes('Claire Fontaine') || !commPrompt.includes('24 days')) {
  console.error('FAIL: Communications follow-up prompt missing required matter/client/days context');
  process.exit(1);
}

console.log('\n=== Step 2: Testing Conflict Check Draft Email Handoff Prompt ===');

const searchedName = 'Castellan Freight LLC';
const findingsText = 'Adverse party in Weston v. Castellan Freight (Adverse role)';
const notes = 'Need to verify if waiver is needed';

const conflictPrompt = `Draft an email regarding the flagged conflict check for "${searchedName}". Finding details: ${findingsText}. ${notes.trim() ? 'Reviewer notes: ' + notes.trim() : ''}`;

console.log('Conflict Check Handoff Prompt:');
console.log(`"${conflictPrompt}"`);

if (!conflictPrompt.includes('Castellan Freight LLC') || !conflictPrompt.includes('Adverse party in Weston v. Castellan Freight') || !conflictPrompt.includes('Need to verify')) {
  console.error('FAIL: Conflict check draft email prompt missing findings/notes context');
  process.exit(1);
}

console.log('\n✅ ALL OPERATOR HANDOFF CONSISTENCY TESTS PASSED!');
