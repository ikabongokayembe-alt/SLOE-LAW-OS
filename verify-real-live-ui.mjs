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
  await page.waitForTimeout(2000);

  console.log('Current URL after load:', page.url());
  await page.screenshot({ path: 'live_real_boot.png', fullPage: true });

  const bodyText = await page.innerText('body');
  console.log('Body Text Snippet:\n', bodyText.substring(0, 500));

  const hasDemoBanner = bodyText.includes('DEMO MODE') || bodyText.includes('Demo Partner');
  console.log('Is Demo Banner Present?:', hasDemoBanner ? 'YES (Mock Mode)' : 'NO (Real Mode)');

  // 2. Perform Real Signup
  console.log('\n2. Navigating to Signup Page...');
  await page.goto('https://law.sloelabs.com/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'live_signup_form.png', fullPage: true });

  const timestamp = Date.now();
  const testEmail = `apex.livepartner.${timestamp}@gmail.com`;
  const firmName = `Apex Law Firm ${timestamp}`;
  const principalName = 'Alex Sterling';

  console.log(`Filling out real signup: ${testEmail}...`);
  const inputs = page.locator('input');
  await inputs.nth(0).fill(firmName);
  await inputs.nth(1).fill(principalName);
  await inputs.nth(2).fill(testEmail);
  await inputs.nth(3).fill('StrongPass123!');

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
