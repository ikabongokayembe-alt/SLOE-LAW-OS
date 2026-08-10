import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err}`));

  await page.goto('http://localhost:5173/signup', { waitUntil: 'networkidle' });

  const inputs = page.locator('input');
  await inputs.nth(0).fill('Test Apex Law Group');
  await inputs.nth(1).fill('Alex Sterling');
  await inputs.nth(2).fill(`apex.lawyer.${Date.now()}@apexlaw.com`);
  await inputs.nth(3).fill('StrongPass123!');
  
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'signup_response.png' });
  const text = await page.innerText('body');
  console.log('Body text after signup attempt:\n', text);

  await browser.close();
})();
