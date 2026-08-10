import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'signup_screen.png' });
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type,
      placeholder: i.placeholder,
      name: i.name,
      id: i.id
    }));
  });
  console.log('Inputs found:', JSON.stringify(inputs, null, 2));
  await browser.close();
})();
