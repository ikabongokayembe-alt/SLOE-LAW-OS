import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const timestamp = Date.now();
  const testEmail = `test.askbanner.${timestamp}@sloelawtest.com`;
  const firmName = `Ask Banner Test Firm ${timestamp}`;
  const testQuestion = `Which matters need urgent attention before Friday's hearing?`;

  console.log('1. Signing up a new account on production...');
  await page.goto('https://law.sloelabs.com/signup', { waitUntil: 'networkidle' });

  const inputs = page.locator('input');
  await inputs.nth(0).fill(firmName);
  await inputs.nth(1).fill('Test Attorney');
  await inputs.nth(2).fill(testEmail);
  await inputs.nth(3).fill('StrongPass123!');

  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  console.log('Logged in URL:', page.url());

  console.log('2. Navigating to Command Center / Dashboard...');
  await page.goto('https://law.sloelabs.com/', { waitUntil: 'networkidle' });

  console.log(`3. Typing question into ask banner: "${testQuestion}"...`);
  const askInput = page.locator('input[placeholder*="Which matters need attention"]');
  await askInput.fill(testQuestion);

  console.log('Pressing Enter...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    askInput.press('Enter')
  ]);

  console.log('URL immediately after navigation:', page.url());

  // Wait a moment for streaming/AI response
  console.log('Waiting 8 seconds for AI response to stream in...');
  await page.waitForTimeout(8000);

  console.log('URL after auto-send effect & searchParams clear:', page.url());

  await page.screenshot({ path: 'test_ask_banner_result.png', fullPage: true });

  const messages = await page.locator('.prose, [class*="chat"], div').evaluateAll(els => {
    return els.map(e => e.textContent).filter(t => t && t.length > 10);
  });

  const chatContainerText = await page.evaluate(() => document.body.innerText);
  console.log('--- PAGE INNER TEXT ---');
  console.log(chatContainerText);

  await browser.close();
})();
