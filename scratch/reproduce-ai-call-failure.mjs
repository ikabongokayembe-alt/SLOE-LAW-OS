import { emailComposePrompt, operatorChatPrompt } from '../src/lib/prompts.ts';

const SUPABASE_URL = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const deadlinePrompt = 'Draft an email to the client regarding the "File Amended Complaint" deadline for matter "Weston v. Castellan Freight - MVA Injury".';
const generalPrompt = 'I need to get moving on the "File Amended Complaint" deadline for matter "Weston v. Castellan Freight - MVA Injury". It was due on Aug 18, 2026 (3 days overdue). What documents do we have on file for this matter, and what\'s the best way to handle this deadline today?';

const mockMatters = [
  { id: 'm-weston-1', label: 'Weston v. Castellan Freight - MVA Injury' },
];
const mockParties = [
  { id: 'p-weston', label: 'Arthur Weston' },
];

const emailBody = {
  prompt: emailComposePrompt(deadlinePrompt, mockMatters, mockParties),
  expectJson: true,
  feature: 'email_draft',
};

const chatBody = {
  prompt: operatorChatPrompt(generalPrompt, [], 'Summary context'),
  expectJson: false,
  feature: 'operator_chat',
};

async function testEndpoint(name, body) {
  console.log(`\n========================================`);
  console.log(`Testing [${name}]`);
  console.log(`Payload preview (first 200 chars):\n${JSON.stringify(body.prompt).slice(0, 200)}...`);
  console.log(`expectJson: ${body.expectJson}`);
  
  const startTime = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    
    const elapsed = Date.now() - startTime;
    console.log(`HTTP Status Code: ${res.status} ${res.statusText} (${elapsed}ms)`);
    const rawText = await res.text();
    console.log(`Raw Response Body:\n${rawText}`);
    return { status: res.status, text: rawText };
  } catch (err) {
    console.error(`Fetch error:`, err);
    return { status: 0, text: String(err) };
  }
}

console.log('--- TEST 1: Plain Chat ("Get help from Operator") ---');
await testEndpoint('Operator Chat (SUCCEEDS)', chatBody);

console.log('\n--- TEST 2: Email Draft ("Draft update email") ---');
await testEndpoint('Email Draft (FAILS)', emailBody);
