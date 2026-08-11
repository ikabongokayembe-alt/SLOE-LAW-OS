import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://law.sloelabs.com/matters', { waitUntil: 'networkidle' });
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder="Full name or organization"]', 'Test Client Inspect Step 3');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'modal_step3.png' });

  const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({
    placeholder: i.placeholder,
    type: i.type,
    value: i.value
  })));
  console.log('Inputs found in step 3 modal:', inputs);

  await browser.close();
})();
