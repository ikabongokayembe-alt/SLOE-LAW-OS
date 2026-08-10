import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/matters', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'matters_debug.png' });
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.innerText);
  });
  console.log('Buttons found:', buttons);
  const text = await page.innerText('body');
  console.log('Body Text:\n', text);
  await browser.close();
})();
