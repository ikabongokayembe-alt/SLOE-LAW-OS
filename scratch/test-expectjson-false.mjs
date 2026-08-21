import { emailComposePrompt } from '../src/lib/prompts.ts';

const SUPABASE_URL = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const deadlinePrompt = 'Draft an email to the client regarding the "File Amended Complaint" deadline for matter "Weston v. Castellan Freight - MVA Injury".';

const mockMatters = [
  { id: 'm-weston-1', label: 'Weston v. Castellan Freight - MVA Injury' },
];
const mockParties = [
  { id: 'p-weston', label: 'Arthur Weston' },
];

const promptText = emailComposePrompt(deadlinePrompt, mockMatters, mockParties);

console.log('--- TEST A: expectJson: true (Current behavior) ---');
const resA = await fetch(`${SUPABASE_URL}/functions/v1/ai-call`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ANON_KEY}`,
    apikey: ANON_KEY,
  },
  body: JSON.stringify({ prompt: promptText, expectJson: true, feature: 'email_draft' }),
});
console.log('expectJson: true -> Status:', resA.status, await resA.text());

console.log('\n--- TEST B: expectJson: false (Plain text transport, JSON prompt) ---');
const resB = await fetch(`${SUPABASE_URL}/functions/v1/ai-call`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ANON_KEY}`,
    apikey: ANON_KEY,
  },
  body: JSON.stringify({ prompt: promptText, expectJson: false, feature: 'email_draft' }),
});
console.log('expectJson: false -> Status:', resB.status, await resB.text());
