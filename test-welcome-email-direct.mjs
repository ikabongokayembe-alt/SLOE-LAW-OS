import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

(async () => {
  const timestamp = Date.now();
  const testEmail = 'ikabongokayembe@gmail.com';
  const firmName = `Sterling & Partners ${timestamp}`;

  console.log(`Dispatched welcome email edge function call for ${testEmail}...`);

  const { data, error } = await supabase.functions.invoke('welcome-email', {
    body: {
      email: testEmail,
      name: 'Ikabongo Kayembe',
      brokerageName: firmName,
      role: 'principal'
    }
  });

  if (error) {
    console.error('Edge Function invocation failed:', error);
  } else {
    console.log('Edge Function Invocation Succeeded! Result:', data);
  }
})();
