import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const timestamp = Date.now();
  const targetEmail = 'ikabongokayembe@gmail.com';
  const firmName = `Apex Law Chambers ${timestamp}`;

  console.log(`Executing real signup on https://law.sloelabs.com...`);
  console.log(`Target Email: ${targetEmail}`);
  console.log(`Firm Name: ${firmName}`);

  await page.goto('https://law.sloelabs.com/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'signup_real_page.png' });

  const inputs = page.locator('input');
  await inputs.nth(0).fill(firmName);
  await inputs.nth(1).fill('Ikabongo Kayembe');
  await inputs.nth(2).fill(targetEmail);
  await inputs.nth(3).fill('StrongPass123!');

  const startTime = Date.now();
  await page.click('button[type="submit"]');

  await page.waitForTimeout(5000);
  const durationMs = Date.now() - startTime;
  console.log(`Signup button clicked. Trigger completed in ${durationMs}ms.`);
  console.log('Current page URL:', page.url());

  await page.screenshot({ path: 'signup_real_aftermath.png', fullPage: true });
  await browser.close();
})();
