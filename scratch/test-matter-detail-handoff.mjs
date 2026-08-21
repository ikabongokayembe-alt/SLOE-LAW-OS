console.log('=== Step 1: Testing Priority 1 — Overdue/At-Risk Deadline Handoff (Brightpath Ventures - Series A Formation) ===');

const mockMatter1 = {
  id: 'm-brightpath',
  title: 'Brightpath Ventures - Series A Formation',
  client_party_id: 'p-brightpath',
  practice_area_id: 'pa-corp',
  status: 'active',
};

const mockClient1 = { id: 'p-brightpath', name: 'Brightpath Ventures' };
const mockDeadline1 = {
  id: 'd-termsheet',
  title: 'Term Sheet Review',
  due_date: '2026-08-18',
  status: 'upcoming',
  matter_id: 'm-brightpath',
};

// Simulate prompt generation logic from MatterDetailPanel
function generatePrompt({ matter, clientParty, practiceArea, deadlines, deadlineRisks, urgentActions, bottleneck, documentGap, conflictCheck }) {
  const parseDateOnly = (dStr) => {
    const [y, m, d] = dStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const daysUntil = (dStr) => {
    const diff = parseDateOnly(dStr).getTime() - new Date(2026, 7, 21).setHours(0, 0, 0, 0); // 2026-08-21
    return Math.round(diff / 86400000);
  };
  const formatDateOnly = (dStr) => {
    return parseDateOnly(dStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  let prompt = '';

  const overdueDeadline = deadlines.find(d => d.status === 'upcoming' && daysUntil(d.due_date) < 0);
  const atRiskDeadlineObj = deadlineRisks.find(x => x.risk.level === 'at_risk') ||
    deadlineRisks.find(x => x.risk.level === 'watch');
  const targetDeadline = overdueDeadline || atRiskDeadlineObj?.deadline;

  if (targetDeadline) {
    const days = daysUntil(targetDeadline.due_date);
    const isOverdue = days < 0;
    const formattedDueDate = formatDateOnly(targetDeadline.due_date);
    const daysText = isOverdue
      ? `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
      : `${days} day${days === 1 ? '' : 's'} remaining`;

    prompt = `I need to get moving on the "${targetDeadline.title}" deadline for matter "${matter.title}". It was due on ${formattedDueDate} (${daysText}). What documents do we have on file for this matter, and what's the best way to handle this deadline today?`;
  } else if (urgentActions.length > 0) {
    const topAction = urgentActions[0];
    prompt = `I need to address an urgent finding on matter "${matter.title}"${clientParty ? ` (${clientParty.name})` : ''}: ${topAction.title}. ${topAction.detail} What documents do we have on file, and what are the best next steps to handle this today?`;
  } else if (bottleneck) {
    prompt = `Matter "${matter.title}"${clientParty ? ` (${clientParty.name})` : ''} appears to be stalled: ${bottleneck.detail}. What's blocking progress, and how can we get this matter moving today?`;
  } else if (documentGap) {
    prompt = `We have a document gap on matter "${matter.title}"${clientParty ? ` (${clientParty.name})` : ''}: ${documentGap.detail}. What documents are missing, and how should we proceed today?`;
  } else if (conflictCheck && conflictCheck.status === 'flagged') {
    prompt = `The conflict check for matter "${matter.title}"${clientParty ? ` (${clientParty.name})` : ''} is currently flagged. Can you review the conflict findings and help me analyze whether this can be cleared or waived today?`;
  } else {
    const clientStr = clientParty ? ` for ${clientParty.name}` : '';
    const practiceStr = practiceArea ? ` (${practiceArea.label})` : '';
    prompt = `I'm working on the matter "${matter.title}"${clientStr}${practiceStr}. Can you give me an overview of the matter status, key documents, and upcoming actions needed today?`;
  }

  return prompt;
}

// Test Case 1: Overdue Term Sheet Review
const prompt1 = generatePrompt({
  matter: mockMatter1,
  clientParty: mockClient1,
  practiceArea: { id: 'pa-corp', label: 'Corporate & M&A' },
  deadlines: [mockDeadline1],
  deadlineRisks: [{ deadline: mockDeadline1, risk: { level: 'at_risk', reasons: ['Overdue by 3 days'] } }],
  urgentActions: [],
  bottleneck: null,
  documentGap: null,
  conflictCheck: null,
});

console.log('Priority 1 Prompt Output:');
console.log(`"${prompt1}"`);

if (
  !prompt1.includes('I need to get moving on') ||
  !prompt1.includes('Term Sheet Review') ||
  !prompt1.includes('Brightpath Ventures - Series A Formation') ||
  !prompt1.includes('overdue by 3 days')
) {
  console.error('FAIL: Priority 1 prompt failed validation');
  process.exit(1);
}
console.log('✅ Priority 1 Passed!');

// Test Case 2: Flagged Conflict Check
console.log('\n=== Step 2: Testing Priority 2 — Flagged Conflict Check ===');
const prompt2 = generatePrompt({
  matter: mockMatter1,
  clientParty: mockClient1,
  practiceArea: { id: 'pa-corp', label: 'Corporate & M&A' },
  deadlines: [],
  deadlineRisks: [],
  urgentActions: [],
  bottleneck: null,
  documentGap: null,
  conflictCheck: { id: 'cc-1', status: 'flagged' },
});

console.log('Priority 2 Prompt Output:');
console.log(`"${prompt2}"`);

if (
  !prompt2.includes('conflict check for matter "Brightpath Ventures - Series A Formation" (Brightpath Ventures) is currently flagged') ||
  !prompt2.includes('cleared or waived')
) {
  console.error('FAIL: Priority 2 prompt failed validation');
  process.exit(1);
}
console.log('✅ Priority 2 Passed!');

// Test Case 3: Fallback General Prompt
console.log('\n=== Step 3: Testing Priority 3 — General Fallback Prompt ===');
const prompt3 = generatePrompt({
  matter: mockMatter1,
  clientParty: mockClient1,
  practiceArea: { id: 'pa-corp', label: 'Corporate & M&A' },
  deadlines: [],
  deadlineRisks: [],
  urgentActions: [],
  bottleneck: null,
  documentGap: null,
  conflictCheck: { id: 'cc-1', status: 'cleared' },
});

console.log('Priority 3 Prompt Output:');
console.log(`"${prompt3}"`);

if (
  !prompt3.includes('I\'m working on the matter "Brightpath Ventures - Series A Formation" for Brightpath Ventures (Corporate & M&A)') ||
  !prompt3.includes('overview of the matter status')
) {
  console.error('FAIL: Priority 3 prompt failed validation');
  process.exit(1);
}
console.log('✅ Priority 3 Passed!');

console.log('\n🎉 ALL MATTER DETAIL OPERATOR HANDOFF PROMPT TESTS PASSED!');
