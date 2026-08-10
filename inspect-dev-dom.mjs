import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'dev_boot_inspect.png' });
  const text = await page.innerText('body');
  console.log('Body text at root:\n', text);
  await browser.close();
})();
