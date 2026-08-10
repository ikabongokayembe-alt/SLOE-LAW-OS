import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('--- 1. Verification of Dev Mode Authentication / App Shell Boot ---');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'verify_01_command_center.png', fullPage: true });

  console.log('--- 2. Matters & Conflict Check Flow Verification ---');
  await page.goto('http://localhost:5173/matters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'verify_02_matters_kanban.png', fullPage: true });

  console.log('Opening New Matter Modal...');
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  const testClient = `Apex Client ${Date.now()}`;
  console.log(`Setting Client Name: ${testClient}`);
  await page.fill('input[placeholder="Full name or organization"]', testClient);
  
  console.log('Running conflict check...');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'verify_03_conflict_check_cleared.png' });

  console.log('Proceeding to matter details...');
  await page.click('button:has-text("Proceed to matter details")');
  await page.waitForTimeout(1000);

  console.log('Entering matter title...');
  await page.fill('input[placeholder="e.g. Smith v. Jones, Commercial Lease"]', 'Acquisition & Asset Purchase');
  await page.screenshot({ path: 'verify_04_matter_details.png' });

  console.log('Submitting matter...');
  await page.click('button:has-text("Open matter")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'verify_05_matters_intake_column.png', fullPage: true });

  console.log('--- 3. Per-Screen Comprehensive UI Sweep ---');
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
    await page.screenshot({ path: `verify_screen_${s.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`, fullPage: true });
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
