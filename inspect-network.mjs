import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err}`));
  page.on('requestfailed', req => console.log(`[REQ FAILED] ${req.url()} - ${req.failure()?.errorText}`));
  page.on('response', res => {
    if (res.status() >= 400) console.log(`[RES ${res.status()}] ${res.url()}`);
  });
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(5000);
  await browser.close();
})();
