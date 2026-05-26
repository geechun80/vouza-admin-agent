// Playwright screenshot capture for README hero
const { chromium } = require('playwright');
const path = require('path');

const URL = 'http://localhost:3456';
const OUT = path.join(__dirname, '..', 'docs', 'assets');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  console.log('→ navigating');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // 0. Capture welcome splash for hero-chat (this is the actual landing)
  // — already serves as the brand-y hero shot
  console.log('→ hero-welcome.png');
  await page.screenshot({ path: path.join(OUT, 'hero-welcome.png'), fullPage: false });

  // Click Get Started to enter the wizard
  console.log('→ clicking Get Started');
  await page.evaluate(() => {
    if (typeof startSetup === 'function') startSetup();
  });
  await page.waitForTimeout(2000);

  // 1. Wizard / chat with Guide Bot
  console.log('→ hero-chat.png');
  await page.screenshot({ path: path.join(OUT, 'hero-chat.png'), fullPage: false });

  // 2. Setup panel
  console.log('→ hero-setup.png');
  await page.evaluate(() => {
    if (typeof toggleSetupPanel === 'function') {
      toggleSetupPanel();
    } else {
      document.querySelectorAll('.step-view').forEach(el => el.style.display = 'none');
      const el = document.getElementById('setup-panel');
      if (el) el.style.display = 'block';
    }
  });
  await page.waitForTimeout(5000); // let integration cards render
  await page.screenshot({ path: path.join(OUT, 'hero-setup.png'), fullPage: false });

  // 3. Health panel
  console.log('→ hero-health.png');
  await page.evaluate(() => {
    document.querySelectorAll('.step-view').forEach(el => el.style.display = 'none');
    const el = document.getElementById('health-panel');
    if (el) el.style.display = 'block';
    // trigger any refresh fn if present
    if (typeof refreshHealthPanel === 'function') refreshHealthPanel();
    if (typeof loadHealthDetailed === 'function') loadHealthDetailed();
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT, 'hero-health.png'), fullPage: false });

  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
