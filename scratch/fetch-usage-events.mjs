const SUPABASE_URL = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

console.log('Fetching recent usage_events from Supabase REST API...');

const res = await fetch(`${SUPABASE_URL}/rest/v1/usage_events?select=*&order=created_at.desc&limit=10`, {
  headers: {
    Authorization: `Bearer ${ANON_KEY}`,
    apikey: ANON_KEY,
  },
});

console.log('Status:', res.status, res.statusText);
const data = await res.json();
console.log('Recent usage_events:\n', JSON.stringify(data, null, 2));
