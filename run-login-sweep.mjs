import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('--- 1. Login with Demo Principal Credentials ---');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'principal@demo.local');
  await page.fill('input[type="password"]', 'demo123');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('Current URL after login:', page.url());
  await page.screenshot({ path: 'step1_command_center.png', fullPage: true });

  console.log('--- 2. Matters & Conflict Check Flow ---');
  await page.goto('http://localhost:5173/matters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step2_matters_kanban.png', fullPage: true });

  console.log('Clicking "New Matter"...');
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  const testClient = `Apex Client ${Date.now()}`;
  console.log(`Entering prospective client: ${testClient}`);
  await page.fill('input[placeholder="Full name or organization"]', testClient);
  
  console.log('Running conflict check...');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'step3_conflict_check_result.png' });

  console.log('Proceeding to matter details...');
  await page.click('button:has-text("Proceed to matter details")');
  await page.waitForTimeout(1000);

  console.log('Setting matter title...');
  await page.fill('input[placeholder="e.g. Smith v. Jones, Commercial Lease"]', 'Acquisition & Asset Purchase');
  await page.screenshot({ path: 'step4_matter_details_modal.png' });

  console.log('Submitting matter...');
  await page.click('button:has-text("Open matter")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'step5_matters_kanban_updated.png', fullPage: true });

  console.log('--- 3. Comprehensive Per-Screen Sweep ---');
  const screens = [
    { name: 'Deadlines', path: '/deadlines' },
    { name: 'Parties (Conflict Check)', path: '/parties' },
    { name: 'Operator', path: '/operator' },
    { name: 'Analyst', path: '/analyst' },
    { name: 'Agent Library', path: '/agents' },
    { name: 'Team', path: '/team' },
    { name: 'Integrations', path: '/integrations' }
  ];

  for (const s of screens) {
    console.log(`Sweeping screen: ${s.name} (${s.path})`);
    await page.goto(`http://localhost:5173${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screen_${s.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`, fullPage: true });
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
