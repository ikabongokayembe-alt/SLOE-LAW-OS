import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

(async () => {
  const timestamp = Date.now();
  const testEmail = `apex.lawyer.${timestamp}@sloelaw.com`;
  const firmName = `Apex Legal Group ${timestamp}`;
  const principalName = 'Alex Sterling';

  console.log(`Step 1: Signing up auth user: ${testEmail}...`);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: testEmail,
    password: 'StrongPass123!'
  });

  if (authError) {
    console.error('Auth signUp failed:', authError);
    return;
  }

  console.log('User created. User ID:', authData.user?.id);

  console.log('Step 2: Calling create_firm RPC...');
  const { data: firmId, error: rpcError } = await supabase.rpc('create_firm', {
    p_firm_name: firmName,
    p_principal_name: principalName
  });

  if (rpcError) {
    console.error('RPC create_firm Error:', rpcError);
    return;
  }

  console.log('SUCCESS! Created Firm ID:', firmId);

  // Query created firm
  const { data: firmData } = await supabase.from('firms').select('*').eq('id', firmId);
  console.log('Firm record in Supabase:', firmData);

  // Fetch initial stage
  const { data: stages } = await supabase.from('matter_stages').select('*').eq('firm_id', firmId).order('sort_order');
  const initialStage = stages?.[0];
  console.log('Initial stage created:', initialStage?.label);

  // Run conflict check
  const clientName = `Acme Corporate Client ${timestamp}`;
  const { data: checkData, error: checkErr } = await supabase.rpc('run_conflict_check', {
    p_firm_id: firmId,
    p_entity_name: clientName,
    p_searched_party_id: null
  });
  console.log('Conflict check RPC result ID:', checkData);

  // Create real matter
  const matterTitle = `Commercial Lease & Asset Acquisition ${timestamp}`;
  const { data: matterData, error: matterErr } = await supabase.from('matters').insert({
    firm_id: firmId,
    title: matterTitle,
    stage_id: initialStage?.id,
    status: 'active',
    opened_date: new Date().toISOString().slice(0, 10),
    conflict_check_id: checkData
  }).select();

  console.log('Matter created in Supabase:', matterData?.[0]?.title);

  // Move stage to Engaged (second stage)
  if (stages && stages.length > 1) {
    const engagedStage = stages[1];
    const { data: updatedMatter } = await supabase.from('matters')
      .update({ stage_id: engagedStage.id })
      .eq('id', matterData[0].id)
      .select();
    console.log('Moved Matter stage from Intake to Engaged:', updatedMatter?.[0]?.stage_id === engagedStage.id ? 'VERIFIED' : 'FAILED');
  }

  console.log('\n======================================================');
  console.log('ACTUAL VERIFIED SUPABASE RECORDS FOR REPORT');
  console.log('======================================================');
  console.log(`ACTUAL EMAIL USED: ${testEmail}`);
  console.log(`ACTUAL FIRM NAME: ${firmName}`);
  console.log(`ACTUAL CLIENT NAME: ${clientName}`);
  console.log(`ACTUAL MATTER TITLE: ${matterTitle}`);
  console.log(`ACTUAL FIRM ID: ${firmId}`);
  console.log(`ACTUAL MATTER ID: ${matterData?.[0]?.id}`);
  console.log('======================================================\n');
})();
