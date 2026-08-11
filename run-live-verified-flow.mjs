import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  const timestamp = Date.now();
  const testEmail = `apex.lawyer.${timestamp}@sloelawtest.com`;
  const firmName = `Apex Legal Group ${timestamp}`;
  const clientName = `Apex Client ${timestamp}`;
  const matterTitle = `Acquisition & Asset Purchase ${timestamp}`;

  console.log(`--- LIVE VERIFICATION RUN ---`);
  console.log(`Target Site: https://law.sloelabs.com`);
  console.log(`ACTUAL TEST EMAIL: ${testEmail}`);
  console.log(`ACTUAL FIRM NAME: ${firmName}`);
  console.log(`ACTUAL CLIENT NAME: ${clientName}`);
  console.log(`ACTUAL MATTER TITLE: ${matterTitle}`);

  // 1. Sign up on live site
  console.log('1. Navigating to https://law.sloelabs.com/signup...');
  await page.goto('https://law.sloelabs.com/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'live_01_signup.png' });

  console.log('Filling signup form...');
  const inputs = page.locator('input');
  await inputs.nth(0).fill(firmName);
  await inputs.nth(1).fill('Alex Sterling');
  await inputs.nth(2).fill(testEmail);
  await inputs.nth(3).fill('StrongPass123!');
  
  await page.click('button[type="submit"]');

  console.log('Waiting for signup to complete and redirect to app...');
  await page.waitForTimeout(5000);
  console.log('Current URL after signup:', page.url());
  await page.screenshot({ path: 'live_02_dashboard.png', fullPage: true });

  // 2. Go to Matters & create new matter
  console.log('2. Navigating to Matters...');
  await page.goto('https://law.sloelabs.com/matters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'live_03_matters_kanban.png', fullPage: true });

  console.log('Opening New Matter Modal...');
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  console.log(`Entering client name: ${clientName}`);
  await page.fill('input[placeholder="Full name or organization"]', clientName);
  
  console.log('Running conflict check...');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'live_04_conflict_check_result.png' });

  // Click proceed button using flexible selector
  console.log('Proceeding after conflict check...');
  const proceedBtn = page.locator('button:has-text("Proceed"), button:has-text("Continue"), button:has-text("Next")');
  if (await proceedBtn.count() > 0) {
    await proceedBtn.first().click();
    await page.waitForTimeout(1000);
  }

  console.log(`Entering matter title: ${matterTitle}`);
  await page.fill('input[placeholder="e.g. Smith v. Jones, Commercial Lease"]', matterTitle);
  await page.screenshot({ path: 'live_05_matter_details_modal.png' });

  console.log('Opening matter (submitting to Supabase)...');
  await page.click('button:has-text("Open matter")');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'live_06_matters_intake_column.png', fullPage: true });

  // 3. Sweep all 9 routes on live domain
  console.log('3. Sweeping all 9 routes on live domain...');
  const routes = [
    { name: 'Dashboard', path: '/' },
    { name: 'Matters', path: '/matters' },
    { name: 'Deadlines', path: '/deadlines' },
    { name: 'Parties', path: '/parties' },
    { name: 'Operator', path: '/operator' },
    { name: 'Analyst', path: '/analyst' },
    { name: 'Agent Library', path: '/agents' },
    { name: 'Team', path: '/team' },
    { name: 'Integrations', path: '/integrations' }
  ];

  for (const r of routes) {
    console.log(`Sweeping live route: ${r.name} (${r.path})`);
    await page.goto(`https://law.sloelabs.com${r.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `live_screen_${r.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`, fullPage: true });
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
