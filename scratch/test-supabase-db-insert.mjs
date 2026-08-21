import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

console.log('--- Testing operator_conversations table query ---');
const { data: profiles, error: profErr } = await supabase.from('profiles').select('*').limit(1);
console.log('Profiles query status:', profErr ?? 'OK', 'Profiles count:', profiles?.length);

const { data: convs, error: convErr } = await supabase.from('operator_conversations').select('*').limit(5);
console.log('Operator Conversations query status:', convErr ?? 'OK', 'Count:', convs?.length);

const deadlinePrompt = 'Draft an email to the client regarding the "File Amended Complaint" deadline for matter "Weston v. Castellan Freight - MVA Injury".';

console.log('\n--- Testing createConversation database insert with anon client ---');
const { data: newConv, error: insErr } = await supabase
  .from('operator_conversations')
  .insert({
    agent: 'operator',
    firm_id: '00000000-0000-0000-0000-000000000000',
    created_by: '00000000-0000-0000-0000-000000000000',
    title: deadlinePrompt.slice(0, 60),
  })
  .select('*')
  .single();

console.log('Insert Result Error:', insErr);
console.log('Insert Result Data:', newConv);
