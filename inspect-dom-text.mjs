import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  const text = await page.innerText('body');
  console.log('Body Text:\n', text);
  await browser.close();
})();
