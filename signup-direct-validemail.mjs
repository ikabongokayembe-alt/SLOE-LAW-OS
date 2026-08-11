import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

(async () => {
  const timestamp = Date.now();
  const testEmail = `lawyer${timestamp}@gmail.com`;
  const firmName = `Apex Legal Group ${timestamp}`;
  const principalName = 'Alex Sterling';

  console.log(`Executing direct Supabase signup...`);
  console.log(`Email: ${testEmail}`);
  console.log(`Firm: ${firmName}`);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: 'StrongPass123!'
  });

  if (signUpError) {
    console.error('SignUp Error:', signUpError);
    return;
  }

  console.log('SignUp Data session:', signUpData.session ? 'Session created' : 'No session');

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_firm', {
    p_firm_name: firmName,
    p_principal_name: principalName
  });

  if (rpcError) {
    console.error('RPC create_firm Error:', rpcError);
    return;
  }

  console.log('RPC create_firm Result (firm_id):', rpcData);

  // Query firms
  const { data: firms, error: firmError } = await supabase.from('firms').select('*');
  console.log('Firms in Supabase:', firms);

  // Create Matter
  const { data: stages } = await supabase.from('matter_stages').select('*').eq('firm_id', rpcData).order('sort_order');
  const initialStage = stages?.[0];

  const matterTitle = `Live Asset Purchase ${timestamp}`;
  const { data: newMatter, error: matterErr } = await supabase.from('matters').insert({
    firm_id: rpcData,
    title: matterTitle,
    stage_id: initialStage?.id,
    status: 'active',
    opened_date: new Date().toISOString().slice(0, 10)
  }).select();

  console.log('Created Matter in Supabase:', newMatter);
})();
