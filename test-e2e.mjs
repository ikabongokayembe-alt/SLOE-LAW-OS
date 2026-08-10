import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // 1. Sign up as a new Firm
  console.log('Checking Signup...');
  await page.click('text=Create one');
  await page.fill('input[placeholder="Sterling & Partners"]', 'Test Apex Law Group');
  await page.fill('input[placeholder="alex@sterlinglaw.com"]', `test.lawyer.${Date.now()}@apexlaw.com`);
  await page.fill('input[type="password"]', 'StrongPass123!');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('Current URL after signup:', page.url());

  // Take screenshot of Command Center / Dashboard
  await page.screenshot({ path: 'step1_command_center.png', fullPage: true });

  // 2. Go to Matters & New Matter
  console.log('Navigating to Matters...');
  await page.click('text=Matters');
  await page.waitForTimeout(1000);
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  const testClient = `Client_${Date.now()}`;
  console.log(`Running conflict check for: ${testClient}`);
  await page.fill('input[placeholder*="Client"]', testClient);
  
  // Click Conflict Check if present
  const checkBtn = page.locator('button:has-text("Run Conflict Check"), button:has-text("Conflict Check")');
  if (await checkBtn.count() > 0) {
    await checkBtn.first().click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: 'step2_conflict_check.png' });

  // Submit new matter form
  const submitMatterBtn = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Open Matter"), button:has-text("Save")');
  if (await submitMatterBtn.count() > 0) {
    await submitMatterBtn.first().click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'step3_matters_kanban.png', fullPage: true });

  // 3 & 4. Per-screen sweep
  const screens = ['Deadlines', 'Parties (Conflict Check)', 'Operator', 'Analyst', 'Agent Library', 'Team', 'Integrations'];
  for (const screen of screens) {
    console.log(`Sweeping screen: ${screen}`);
    const link = page.locator(`a:has-text("${screen}"), button:has-text("${screen}"), span:has-text("${screen}")`);
    if (await link.count() > 0) {
      await link.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `screen_${screen.replace(/[^a-zA-Z0-9]/g, '_')}.png`, fullPage: true });
    }
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
