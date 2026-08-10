import { chromium } from 'playwright';

(async () => {
  // Pass empty env variables in vite or run node script that simulates unconfigured Supabase
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('1. Navigating to http://localhost:5173/login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'verify_login_screen.png' });

  console.log('2. Navigating to http://localhost:5173/signup...');
  await page.goto('http://localhost:5173/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'verify_signup_screen.png' });

  console.log('3. Sweeping all app screens while server is running...');
  const screens = [
    { name: 'Dashboard', path: '/' },
    { name: 'Matters', path: '/matters' },
    { name: 'Deadlines', path: '/deadlines' },
    { name: 'Parties (Conflict Check)', path: '/parties' },
    { name: 'Operator', path: '/operator' },
    { name: 'Analyst', path: '/analyst' },
    { name: 'Agent Library', path: '/agents' },
    { name: 'Team', path: '/team' },
    { name: 'Integrations', path: '/integrations' }
  ];

  for (const s of screens) {
    console.log(`Sweeping route: ${s.name} (${s.path})`);
    await page.goto(`http://localhost:5173${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `sweep_${s.name.replace(/[^a-zA-Z0-9]/g, '_')}.png` });
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
