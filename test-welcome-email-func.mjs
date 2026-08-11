import { createClient } from '@supabase/supabase-js';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

(async () => {
  const timestamp = Date.now();
  const testEmail = `lawyer.test.${timestamp}@sloelabs.com`;

  console.log(`Testing welcome-email edge function endpoint...`);
  console.log(`Target Email: ikabongokayembe@gmail.com`);

  const res = await fetch(`${url}/functions/v1/welcome-email`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'ikabongokayembe@gmail.com',
      name: 'Ikabongo Kayembe',
      brokerageName: 'Apex Legal Group',
      role: 'principal'
    })
  });

  console.log('HTTP Status:', res.status);
  const text = await res.text();
  console.log('Response Body:', text);
})();
