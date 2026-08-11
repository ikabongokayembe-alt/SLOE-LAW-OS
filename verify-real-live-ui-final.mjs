import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('1. Navigating to https://law.sloelabs.com...');
  await page.goto('https://law.sloelabs.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const bodyText = await page.innerText('body');
  const hasDemoBanner = bodyText.includes('DEMO MODE') || bodyText.includes('Demo Partner');
  console.log('Is Demo Banner Present?:', hasDemoBanner ? 'YES (Mock Mode)' : 'NO (Real Mode)');

  console.log('2. Clicking "Create a workspace" link on login page...');
  await page.click('text=Create a workspace');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'live_real_signup_form.png', fullPage: true });

  const timestamp = Date.now();
  const testEmail = `apex.livepartner.${timestamp}@gmail.com`;
  const firmName = `Apex Law Firm ${timestamp}`;
  const principalName = 'Alex Sterling';

  console.log(`Filling out real signup form: ${testEmail}...`);
  await page.fill('input[placeholder*="Khalifa"]', firmName);
  await page.fill('input[type="text"]:not([placeholder*="Khalifa"])', principalName);
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', 'StrongPass123!');

  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  console.log('Current URL after real signup submit:', page.url());
  await page.screenshot({ path: 'live_signup_authenticated.png', fullPage: true });

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
