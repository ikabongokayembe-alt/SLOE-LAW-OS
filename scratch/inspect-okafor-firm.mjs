import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

const FIRM_ID = 'dd018a95-e94d-4f5a-b424-f74e7aba973b';

async function main() {
  console.log('Fetching Okafor Family Law firm details...');
  const { data: firm } = await supabase.from('firms').select('*').eq('id', FIRM_ID);
  console.log('Firm:', firm);

  console.log('\nFetching profiles in Okafor Family Law...');
  const { data: profiles } = await supabase.from('profiles').select('*').eq('firm_id', FIRM_ID);
  console.log('Profiles:', profiles);

  console.log('\nFetching active matters in Okafor Family Law...');
  const { data: matters } = await supabase.from('matters').select('id, title, firm_id, created_at').eq('firm_id', FIRM_ID).is('deleted_at', null).limit(5);
  console.log('Matters:', matters);
}

main().catch(console.error);
