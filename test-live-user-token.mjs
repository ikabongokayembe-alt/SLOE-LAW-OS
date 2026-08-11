import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

(async () => {
  const timestamp = Date.now();
  const testEmail = `apex.verifier.${timestamp}@sloelaw.com`;

  console.log('Signing up real test user for token generation...');
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email: testEmail,
    password: 'StrongPass123!'
  });

  if (authErr) {
    console.error('SignUp Error:', authErr);
    return;
  }

  const token = authData.session?.access_token;
  console.log('Obtained User Access Token:', token ? `${token.substring(0, 25)}...` : 'NULL');

  console.log('\nCreating firm for user...');
  const { data: firmId, error: rpcErr } = await supabase.rpc('create_firm', {
    p_firm_name: `Apex Test Firm ${timestamp}`,
    p_principal_name: 'Alex Sterling'
  });

  if (rpcErr) {
    console.error('RPC create_firm Error:', rpcErr);
    return;
  }
  console.log('Firm created ID:', firmId);

  // Call ai-call edge function
  console.log('\n--- 1. Testing ai-call Edge Function ---');
  const aiRes = await fetch(`${url}/functions/v1/ai-call`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt: 'Say the word VERIFIED and nothing else.', expectJson: false })
  });
  console.log('ai-call Status:', aiRes.status);
  const aiText = await aiRes.text();
  console.log('ai-call Response:\n', aiText);

  // Call composio edge function
  console.log('\n--- 2. Testing composio Edge Function ---');
  const compRes = await fetch(`${url}/functions/v1/composio`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'status' })
  });
  console.log('composio Status:', compRes.status);
  const compText = await compRes.text();
  console.log('composio Response:\n', compText);
})();
