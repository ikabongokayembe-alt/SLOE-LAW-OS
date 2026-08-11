import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://law.sloelabs.com/matters', { waitUntil: 'networkidle' });
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder="Full name or organization"]', 'Test Client Inspect');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'modal_after_check.png' });

  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText));
  console.log('Buttons visible in modal step 2:', buttons);

  await browser.close();
})();
