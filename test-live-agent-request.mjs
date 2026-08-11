import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('1. Logging in to https://law.sloelabs.com...');
  await page.goto('https://law.sloelabs.com/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'apex.livepartner.1786406278000@gmail.com');
  await page.fill('input[type="password"]', 'StrongPass123!');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('Current URL after login:', page.url());

  console.log('2. Navigating to /agents...');
  await page.goto('https://law.sloelabs.com/agents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'live_agents_before_request.png', fullPage: true });

  console.log('3. Requesting "Legal Research Agent"...');
  const requestBtn = page.locator('button:has-text("Request agent")').first();
  if (await requestBtn.count() > 0) {
    await requestBtn.click();
    await page.waitForTimeout(2500);
  }

  await page.screenshot({ path: 'live_agents_after_request.png', fullPage: true });

  console.log('4. Reloading page to verify persistence in Supabase database...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'live_agents_reloaded.png', fullPage: true });

  const bodyText = await page.innerText('body');
  const hasRequestedNow = bodyText.includes('Requested now');
  const hasLegalResearchInRequested = bodyText.includes('Legal Research Agent');

  console.log('Is "Requested now" section present?:', hasRequestedNow ? 'YES' : 'NO');
  console.log('Is "Legal Research Agent" listed under Requested now after reload?:', hasLegalResearchInRequested ? 'YES' : 'NO');

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
