import { buildFirmContext } from '../src/lib/contextBuilder.ts';

console.log('=== Step 1: Testing buildFirmContext Document Summary Inclusion ===');

const mockMatters = [
  { id: 'm-202', title: 'Weston v. Castellan Freight - MVA Injury' },
];

const mockDocs = [
  { id: 'd9803f5f', matter_id: 'm-202', file_name: 'Retainer Agreement - Weston.pdf' },
];

const built = buildFirmContext(
  {
    matters: mockMatters,
    deadlines: [],
    parties: [],
    documents: mockDocs,
  },
  3000
);

console.log('Built context text snippet (Summary):');
console.log(built.text.slice(0, 400));

if (!built.text.includes('Retainer Agreement - Weston.pdf')) {
  console.error('FAIL: Retainer Agreement - Weston.pdf not found in built context summary');
  process.exit(1);
}

if (!built.text.includes('Weston v. Castellan Freight - MVA Injury')) {
  console.error('FAIL: Matter title not found in documents_summary by_matter');
  process.exit(1);
}

console.log('\n=== Step 2: Testing Fast Email Intent Regex Filter ===');

const isEmailRequest = (msg) =>
  /\b(email|draft an email|write an email|compose an email|send an email|outreach|client update)\b/i.test(msg);

const prepMsg = 'I need to get moving on the File Amended Complaint deadline. What documents do we have on file?';
const emailMsg = 'Draft an email to the client regarding the File Amended Complaint deadline for matter Weston v. Castellan Freight.';

console.log(`Prep Msg isEmail: ${isEmailRequest(prepMsg)} (Expected: false)`);
console.log(`Email Msg isEmail: ${isEmailRequest(emailMsg)} (Expected: true)`);

if (isEmailRequest(prepMsg) !== false || isEmailRequest(emailMsg) !== true) {
  console.error('FAIL: Fast email intent regex filter failed');
  process.exit(1);
}

console.log('\n✅ ALL OPERATOR CONTEXT & ACCURACY TESTS PASSED!');
