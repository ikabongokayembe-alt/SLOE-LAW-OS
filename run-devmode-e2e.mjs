import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('1. Logging in with Demo Credentials...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'principal@demo.local');
  await page.fill('input[type="password"]', 'demo123');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(2000);
  console.log('Current URL:', page.url());
  await page.screenshot({ path: 'step1_dashboard.png', fullPage: true });

  console.log('2. Navigating to /matters...');
  await page.goto('http://localhost:5173/matters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step2_matters_kanban.png', fullPage: true });

  console.log('Opening New Matter Modal...');
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  const testClient = `Apex Client ${Date.now()}`;
  console.log(`Entering client name: ${testClient}`);
  await page.fill('input[placeholder="Full name or organization"]', testClient);
  
  console.log('Running conflict check...');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'step3_conflict_check_cleared.png' });

  console.log('Proceeding after conflict check...');
  await page.click('button:has-text("Proceed to matter details")');
  await page.waitForTimeout(1000);

  console.log('Setting matter title...');
  await page.fill('input[placeholder="e.g. Smith v. Jones, Commercial Lease"]', 'Acquisition & Asset Purchase');
  await page.screenshot({ path: 'step4_matter_details_modal.png' });

  console.log('Submitting matter...');
  await page.click('button:has-text("Open matter")');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'step5_matters_kanban_updated.png', fullPage: true });

  console.log('3. Navigating to /deadlines...');
  await page.goto('http://localhost:5173/deadlines', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step6_deadlines.png', fullPage: true });

  console.log('4. Navigating to /parties...');
  await page.goto('http://localhost:5173/parties', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step7_parties.png', fullPage: true });

  console.log('5. Navigating to /operator...');
  await page.goto('http://localhost:5173/operator', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step8_operator.png', fullPage: true });

  console.log('6. Navigating to /analyst...');
  await page.goto('http://localhost:5173/analyst', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step9_analyst.png', fullPage: true });

  console.log('7. Navigating to /agents...');
  await page.goto('http://localhost:5173/agents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step10_agents.png', fullPage: true });

  console.log('8. Navigating to /team...');
  await page.goto('http://localhost:5173/team', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step11_team.png', fullPage: true });

  console.log('9. Navigating to /integrations...');
  await page.goto('http://localhost:5173/integrations', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step12_integrations.png', fullPage: true });

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
