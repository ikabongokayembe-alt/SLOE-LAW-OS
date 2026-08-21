import { tryComposeEmail } from '../src/lib/emailCompose.ts';

console.log('=== Step 1: Testing Deadline Email Handoff Prompt Target ===');

const mockMatters = [
  { id: 'm-weston-1', title: 'Weston v. Castellan Freight - MVA Injury', client_party_id: 'p-weston' },
  { id: 'm-fontaine-2', title: 'Fontaine - Prenuptial Agreement', client_party_id: 'p-fontaine' },
];

const mockParties = [
  { id: 'p-weston', name: 'Arthur Weston' },
  { id: 'p-fontaine', name: 'Claire Fontaine' },
];

const mockInvites = [
  { party_id: 'p-weston', email: 'artie.weston@example.com', created_at: '2026-08-01T00:00:00Z' },
];

const prompt = 'Draft an email to the client regarding the "File Amended Complaint" deadline for matter "Weston v. Castellan Freight - MVA Injury".';

const mockCtx = {
  matters: mockMatters,
  parties: mockParties,
  clientInvites: mockInvites,
  communications: [],
};

console.log(`Testing prompt: "${prompt}"`);

const composed = await tryComposeEmail(prompt, mockCtx, (status) => console.log(`[Status] ${status}`));

if (!composed) {
  console.error('FAIL: tryComposeEmail returned null for deadline prompt');
  process.exit(1);
}

console.log('Successfully composed email object:');
console.log('Matter ID:', composed.matterId);
console.log('Party Name:', composed.partyName);
console.log('Recipient To:', composed.to);
console.log('Subject:', composed.subject);
console.log('Body preview:\n', composed.body.slice(0, 150));

if (composed.matterId !== 'm-weston-1') {
  console.error('FAIL: Matter ID failed to resolve to Weston v. Castellan Freight');
  process.exit(1);
}

if (composed.to !== 'artie.weston@example.com') {
  console.error('FAIL: Recipient email failed to resolve to artie.weston@example.com');
  process.exit(1);
}

console.log('\n✅ ALL EMAIL DRAFT RELIABILITY TESTS PASSED!');
