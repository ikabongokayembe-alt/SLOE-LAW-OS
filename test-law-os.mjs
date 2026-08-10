import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('Navigating directly to http://localhost:5173/signup...');
  await page.goto('http://localhost:5173/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'step0_signup_page.png' });

  // 1. Sign up as a new Firm
  console.log('Filling signup form...');
  const testEmail = `test.lawyer.${Date.now()}@apexlaw.com`;
  await page.fill('input[placeholder="Sterling & Partners"]', 'Test Apex Law Group');
  await page.fill('input[placeholder="Alex Sterling"]', 'Alex Sterling');
  await page.fill('input[placeholder="alex@sterlinglaw.com"]', testEmail);
  await page.fill('input[type="password"]', 'StrongPass123!');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(4000);
  console.log('Current URL after signup:', page.url());
  await page.screenshot({ path: 'step1_command_center.png', fullPage: true });

  // 2. Go to Matters, click "New Matter"
  console.log('Navigating to /matters...');
  await page.goto('http://localhost:5173/matters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step2_matters_board.png', fullPage: true });

  console.log('Opening New Matter Modal...');
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  const testClient = `Apex Client ${Date.now()}`;
  console.log(`Setting Client Name: ${testClient}`);
  await page.fill('input[placeholder*="Acme Corp"]', testClient);
  await page.fill('input[placeholder*="Commercial Lease"]', 'Acquisitions & Contracts');
  
  // Run Conflict Check
  const checkBtn = page.locator('button:has-text("Run Conflict Check")');
  if (await checkBtn.count() > 0) {
    console.log('Running conflict check...');
    await checkBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: 'step3_conflict_check_result.png' });

  // Submit Matter Creation
  console.log('Creating Matter...');
  await page.click('button:has-text("Open Matter")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'step4_matter_created_kanban.png', fullPage: true });

  // 3 & 4. Per-Screen Sweep
  const routes = [
    { name: 'Deadlines', path: '/deadlines' },
    { name: 'Parties (Conflict Check)', path: '/parties' },
    { name: 'Operator', path: '/operator' },
    { name: 'Analyst', path: '/analyst' },
    { name: 'Agent Library', path: '/agents' },
    { name: 'Team', path: '/team' },
    { name: 'Integrations', path: '/integrations' }
  ];

  for (const r of routes) {
    console.log(`Sweeping route: ${r.name} (${r.path})`);
    await page.goto(`http://localhost:5173${r.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screen_${r.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`, fullPage: true });
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
