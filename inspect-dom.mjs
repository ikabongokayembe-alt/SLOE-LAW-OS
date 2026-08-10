import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'landing_page.png' });
  const html = await page.content();
  console.log('HTML length:', html.length);
  console.log('Body HTML preview:', html.substring(0, 1000));
  await browser.close();
})();
