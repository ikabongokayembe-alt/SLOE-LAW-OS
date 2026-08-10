import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('1. Setting up mock session in localStorage...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  
  // Set dev profile in localStorage before navigating
  await page.evaluate(() => {
    const mockProfile = {
      id: 'dev-principal',
      firm_id: 'e47f9c12-8b3a-4d21-9f5e-1a2b3c4d5e6f',
      firm_name: 'Demo Firm',
      attorney_id: null,
      role: 'principal',
      name: 'Demo Partner (Principal)',
      email: 'principal@demo.local'
    };
    localStorage.setItem('law_os_dev_profile', JSON.stringify(mockProfile));
  });

  console.log('2. Navigating to Dashboard / Command Center...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('Current URL:', page.url());
  await page.screenshot({ path: 'step1_command_center.png', fullPage: true });

  console.log('3. Navigating to /matters...');
  await page.goto('http://localhost:5173/matters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'step2_matters_kanban.png', fullPage: true });

  console.log('Clicking "New Matter"...');
  await page.click('button:has-text("New Matter")');
  await page.waitForTimeout(1000);

  const testClient = `Apex Client ${Date.now()}`;
  console.log(`Entering prospective client: ${testClient}`);
  await page.fill('input[placeholder="Full name or organization"]', testClient);
  
  console.log('Running conflict check...');
  await page.click('button:has-text("Run conflict check")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'step3_conflict_check_result.png' });

  console.log('Proceeding to matter details...');
  await page.click('button:has-text("Proceed to matter details")');
  await page.waitForTimeout(1000);

  console.log('Setting matter title...');
  await page.fill('input[placeholder="e.g. Smith v. Jones, Commercial Lease"]', 'Acquisition & Asset Purchase');
  await page.screenshot({ path: 'step4_matter_details_modal.png' });

  console.log('Submitting matter...');
  await page.click('button:has-text("Open matter")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'step5_matters_kanban_updated.png', fullPage: true });

  console.log('4. Comprehensive Per-Screen Navigation Sweep...');
  const screens = [
    { name: 'Deadlines', path: '/deadlines' },
    { name: 'Parties (Conflict Check)', path: '/parties' },
    { name: 'Operator', path: '/operator' },
    { name: 'Analyst', path: '/analyst' },
    { name: 'Agent Library', path: '/agents' },
    { name: 'Team', path: '/team' },
    { name: 'Integrations', path: '/integrations' }
  ];

  for (const s of screens) {
    console.log(`Sweeping screen: ${s.name} (${s.path})`);
    await page.goto(`http://localhost:5173${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screen_${s.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`, fullPage: true });
  }

  console.log('--- CONSOLE LOGS ---');
  console.log(consoleLogs.join('\n'));
  console.log('--- PAGE ERRORS ---');
  console.log(pageErrors.join('\n'));

  await browser.close();
})();
