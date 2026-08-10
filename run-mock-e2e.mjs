import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('1. Booting app shell in dev mode...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  // Set mock authenticated profile state in localStorage if needed or trigger dev profile
  await page.waitForTimeout(2000);
  console.log('Current URL at boot:', page.url());
  await page.screenshot({ path: 'step1_dashboard.png', fullPage: true });

  console.log('2. Navigating to /matters...');
  await page.goto('http://localhost:5173/matters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step2_matters.png', fullPage: true });

  console.log('3. Navigating to /deadlines...');
  await page.goto('http://localhost:5173/deadlines', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step3_deadlines.png', fullPage: true });

  console.log('4. Navigating to /parties...');
  await page.goto('http://localhost:5173/parties', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step4_parties.png', fullPage: true });

  console.log('5. Navigating to /operator...');
  await page.goto('http://localhost:5173/operator', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step5_operator.png', fullPage: true });

  console.log('6. Navigating to /analyst...');
  await page.goto('http://localhost:5173/analyst', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step6_analyst.png', fullPage: true });

  console.log('7. Navigating to /agents...');
  await page.goto('http://localhost:5173/agents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step7_agents.png', fullPage: true });

  console.log('8. Navigating to /team...');
  await page.goto('http://localhost:5173/team', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step8_team.png', fullPage: true });

  console.log('9. Navigating to /integrations...');
  await page.goto('http://localhost:5173/integrations', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step9_integrations.png', fullPage: true });

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
