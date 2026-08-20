import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

async function main() {
  const timestamp = Date.now();
  const email = `sarah.kim.${timestamp}@okaforfamilylaw.test`;
  const password = 'StrongPassword123!';

  console.log(`Creating/authenticating Sarah Kim (${email})...`);
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }

  const token = authData.session?.access_token;
  const userId = authData.user?.id;
  console.log('User created! ID:', userId);
  console.log('Access token:', token ? `${token.slice(0, 30)}...` : 'NONE');

  // Next, create firm for Okafor Family Law if needed or check existing firm
  const { data: firmId, error: rpcErr } = await supabase.rpc('create_firm', {
    p_firm_name: 'Okafor Family Law',
    p_principal_name: 'Sarah Kim',
  });

  if (rpcErr) {
    console.log('RPC create_firm error (may already exist):', rpcErr.message);
  } else {
    console.log('Firm ID created/associated:', firmId);
  }

  // Verify firm ID on profile
  const authedClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: profile } = await authedClient.from('profiles').select('*').eq('id', userId).single();
  console.log('Assigned Profile:', profile);
}

main().catch(console.error);
