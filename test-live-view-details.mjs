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

  console.log('2. Navigating to /agents...');
  await page.goto('https://law.sloelabs.com/agents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('3. Clicking "View details" button on catalog card...');
  const viewDetailsBtn = page.locator('button:has-text("View details")').first();
  await viewDetailsBtn.click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'live_view_details_expanded.png', fullPage: true });

  const bodyText = await page.innerText('body');
  const hasDeploymentPath = bodyText.includes('Deployment Path');
  const hasAccessLine = bodyText.includes('Access:');
  const hasHideDetails = bodyText.includes('Hide details');

  console.log('Is "Deployment Path" visible?:', hasDeploymentPath ? 'YES' : 'NO');
  console.log('Is "Access:" line visible?:', hasAccessLine ? 'YES' : 'NO');
  console.log('Did button toggle to "Hide details"?:', hasHideDetails ? 'YES' : 'NO');

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
