import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('1. Navigating to signup page...');
  await page.goto('http://localhost:5173/signup', { waitUntil: 'networkidle' });

  console.log('Filling out firm signup form...');
  const testEmail = `apex.lawyer.${Date.now()}@apexlaw.com`;
  const inputs = page.locator('input');
  await inputs.nth(0).fill('Test Apex Law Group');
  await inputs.nth(1).fill('Alex Sterling');
  await inputs.nth(2).fill(testEmail);
  await inputs.nth(3).fill('StrongPass123!');
  
  console.log('Submitting signup...');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(4000);
  console.log('Current URL after signup:', page.url());
  await page.screenshot({ path: 'step1_command_center.png', fullPage: true });

  // 2. Go to Matters & create new matter with conflict check
  console.log('2. Navigating to /matters...');
  await page.click('a[href="/matters"]');
  await page.waitForTimeout(1500);

  console.log('Clicking "New Matter"...');
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  const testClient = `Apex Client ${Date.now()}`;
  console.log(`Entering client name: ${testClient}`);
  await page.fill('input[placeholder="Full name or organization"]', testClient);
  
  console.log('Running conflict check...');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'step2_conflict_check_cleared.png' });

  console.log('Proceeding after conflict check...');
  await page.click('button:has-text("Proceed to matter details")');
  await page.waitForTimeout(1000);

  console.log('Setting matter title...');
  await page.fill('input[placeholder="e.g. Smith v. Jones, Commercial Lease"]', 'Commercial Lease & Asset Purchase');
  await page.screenshot({ path: 'step3_matter_details_modal.png' });

  console.log('Submitting new matter...');
  await page.click('button:has-text("Open matter")');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'step4_matters_kanban_intake.png', fullPage: true });

  // 3 & 4. Per-Screen Sweep
  const navLinks = [
    { name: 'Deadlines', selector: 'a[href="/deadlines"]' },
    { name: 'Parties (Conflict Check)', selector: 'a[href="/parties"]' },
    { name: 'Operator', selector: 'a[href="/operator"]' },
    { name: 'Analyst', selector: 'a[href="/analyst"]' },
    { name: 'Agent Library', selector: 'a[href="/agents"]' },
    { name: 'Team', selector: 'a[href="/team"]' },
    { name: 'Integrations', selector: 'a[href="/integrations"]' }
  ];

  for (const item of navLinks) {
    console.log(`Sweeping screen: ${item.name}`);
    const link = page.locator(item.selector);
    if (await link.count() > 0) {
      await link.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `screen_${item.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`, fullPage: true });
    }
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
