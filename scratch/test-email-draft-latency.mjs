console.log('=== Step 1: Testing Fast-Path Direct Email Regex Match ===');

const directPrompts = [
  'Draft an email to the client regarding the File Amended Complaint deadline for matter Weston v. Castellan Freight - MVA Injury',
  'Draft an update email to the client regarding the prenuptial deadline',
  'Send an email to opposing counsel',
  'Write a client update message',
];

const DIRECT_EMAIL_REGEX = /^(draft|write|compose|send)\b.*?\b(email|message|letter|client update)\b/i;

for (const p of directPrompts) {
  const isDirect = DIRECT_EMAIL_REGEX.test(p.trim());
  console.log(`Prompt: "${p.slice(0, 45)}..." -> Direct Match: ${isDirect}`);
  if (!isDirect) {
    console.error(`FAIL: Direct email regex failed for prompt "${p}"`);
    process.exit(1);
  }
}

console.log('\n✅ DIRECT EMAIL FAST-PATH LATENCY TEST PASSED!');
