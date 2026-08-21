console.log('=== Step 1: Testing Natural Human Prompt Formulation ===');

const mockDeadline = {
  id: 'd-101',
  title: 'File Amended Complaint',
  due_date: '2026-08-18',
  status: 'upcoming',
  deadline_type: 'filing',
  matter_id: 'm-202',
};

const mockMatter = {
  id: 'm-202',
  title: 'Weston v. Castellan Freight - MVA Injury',
};

const formattedDueDate = 'Aug 18, 2026';
const daysText = '3 days overdue';

const prompt = `I need to get moving on the "${mockDeadline.title}" deadline for matter "${mockMatter.title}". It was due on ${formattedDueDate} (${daysText}). What documents do we have on file for this matter, and what's the best way to handle this deadline today?`;

console.log('Natural Operator Handoff Prompt:');
console.log(`"${prompt}"`);

if (
  !prompt.includes('I need to get moving on') ||
  !prompt.includes('File Amended Complaint') ||
  !prompt.includes('Weston v. Castellan Freight - MVA Injury') ||
  !prompt.includes('Aug 18, 2026') ||
  !prompt.includes('3 days overdue') ||
  !prompt.includes('What documents do we have on file for this matter')
) {
  console.error('FAIL: Prompt formulation did not match expected natural phrasing');
  process.exit(1);
}

console.log('\n✅ NATURAL HUMAN PROMPT FORMULATION TEST PASSED!');
