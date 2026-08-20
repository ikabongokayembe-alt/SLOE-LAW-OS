import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const TARGET_FIRM_ID = 'dd018a95-e94d-4f5a-b424-f74e7aba973b';

async function main() {
  const email = `sarah.kim.1787244763840@okaforfamilylaw.test`;
  const password = 'StrongPassword123!';

  const supabase = createClient(url, anonKey);
  const { data: authData } = await supabase.auth.signInWithPassword({ email, password });
  const token = authData.session.access_token;
  const userId = authData.user.id;

  const authedClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  console.log('Attempting to switch profile firm_id to target:', TARGET_FIRM_ID);
  const { error: updateErr } = await authedClient.from('profiles').update({
    firm_id: TARGET_FIRM_ID,
    role: 'paralegal'
  }).eq('id', userId);

  if (updateErr) {
    console.log('Update profile error:', updateErr);
  } else {
    console.log('Successfully updated profile to firm_id:', TARGET_FIRM_ID);
  }

  const { data: profile } = await authedClient.from('profiles').select('*').eq('id', userId).single();
  console.log('Current Profile:', profile);

  const { data: matters, error: matErr } = await authedClient.from('matters').select('id, title, firm_id, created_at').is('deleted_at', null);
  console.log('Matters accessible for this firm:', matters, matErr);
}

main().catch(console.error);
