import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://law.sloelabs.com/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'apex.livepartner.1786406278000@gmail.com');
  await page.fill('input[type="password"]', 'StrongPass123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  await page.goto('https://law.sloelabs.com/agents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const viewDetailsBtn = page.locator('button:has-text("View details")').first();
  await viewDetailsBtn.click();
  await page.waitForTimeout(1000);

  const bodyText = await page.innerText('body');
  console.log('--- EXPANDED CARD BODY TEXT ---');
  console.log(bodyText);

  await browser.close();
})();
