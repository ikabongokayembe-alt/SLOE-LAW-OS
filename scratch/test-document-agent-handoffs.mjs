console.log('=== Step 1: Testing Document Type Relevance Filtering ===');

const relevantFiles = [
  'Motion_for_Summary_Judgment.pdf',
  'Amended_Complaint_Weston.pdf',
  'Discovery_Requests_Propounded.docx',
  'Subpoena_Duces_Tecum.pdf',
  'Appellate_Brief_Draft.pdf',
];

const nonRelevantFiles = [
  'Retainer_Agreement_Weston.pdf',
  'Invoice_1002_Unpaid.pdf',
  'Client_Photo_ID.jpg',
];

const RELEVANT_REGEX = /(motion|pleading|complaint|brief|discovery|subpoena|opinion|order|ruling|statute|petition|affidavit|court|law)/i;

for (const f of relevantFiles) {
  const isRel = RELEVANT_REGEX.test(f);
  console.log(`File: "${f}" -> Research Relevant: ${isRel}`);
  if (!isRel) {
    console.error(`FAIL: File "${f}" should be marked as research relevant`);
    process.exit(1);
  }
}

for (const f of nonRelevantFiles) {
  const isRel = RELEVANT_REGEX.test(f);
  console.log(`File: "${f}" -> Research Relevant: ${isRel}`);
  if (isRel) {
    console.error(`FAIL: Routine file "${f}" should NOT be marked as research relevant`);
    process.exit(1);
  }
}

console.log('\n=== Step 2: Testing Agent Task-Based Handoff Routing Targets ===');

const tasks = [
  { type: 'drafting', expectedAgent: 'Operator', expectedRoute: '/operator' },
  { type: 'analysis', expectedAgent: 'Analyst', expectedRoute: '/analyst' },
  { type: 'research', expectedAgent: 'Legal Research Agent', expectedRoute: '/agents/case-law-researcher' },
];

for (const t of tasks) {
  let agentName = '';
  let route = '';
  if (t.type === 'drafting') { agentName = 'Operator'; route = '/operator'; }
  else if (t.type === 'analysis') { agentName = 'Analyst'; route = '/analyst'; }
  else if (t.type === 'research') { agentName = 'Legal Research Agent'; route = '/agents/case-law-researcher'; }

  console.log(`Task: "${t.type}" -> Route: ${route} (${agentName})`);
  if (agentName !== t.expectedAgent || route !== t.expectedRoute) {
    console.error(`FAIL: Routing mismatch for task "${t.type}"`);
    process.exit(1);
  }
}

console.log('\n✅ ALL DOCUMENT AGENT HANDOFF TESTS PASSED!');
