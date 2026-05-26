// Capture Configure modal + pipeline-progress hero screenshots
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

  // Get past welcome splash
  await page.evaluate(() => { if (typeof startSetup === 'function') startSetup(); });
  await page.waitForTimeout(1500);

  // Switch to Setup panel
  await page.evaluate(() => {
    if (typeof toggleSetupPanel === 'function') toggleSetupPanel();
  });
  await page.waitForTimeout(2000);

  // ─── Screenshot 1: Configure modal for Gmail ───────────────────────────────
  console.log('→ opening Gmail Configure modal');
  await page.evaluate(() => {
    if (typeof openSetupConfigModal === 'function') {
      openSetupConfigModal('gmail');
    }
  });
  await page.waitForTimeout(1200);

  // Fill the textarea with a sample service-account JSON shape (placeholder) for visual
  await page.evaluate(() => {
    const ta = document.querySelector('#setupConfigModal textarea');
    if (ta) {
      ta.value = JSON.stringify({
        type: "service_account",
        project_id: "vouza-demo",
        private_key_id: "abc123def456…",
        private_key: "-----BEGIN PRIVATE KEY-----\nMII… (truncated for demo) …\n-----END PRIVATE KEY-----\n",
        client_email: "vouza-agent@vouza-demo.iam.gserviceaccount.com",
        client_id: "1234567890",
        auth_uri: "https://accounts.google.com/o/oauth2/auth"
      }, null, 2);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.waitForTimeout(600);
  console.log('→ hero-configure-modal.png');
  await page.screenshot({ path: path.join(OUT, 'hero-configure-modal.png'), fullPage: false });

  // Close modal
  await page.evaluate(() => {
    if (typeof closeSetupConfigModal === 'function') closeSetupConfigModal();
  });
  await page.waitForTimeout(600);

  // ─── Screenshot 2: Pipeline progress in flight ─────────────────────────────
  console.log('→ injecting pipeline progress state');
  await page.evaluate(() => {
    // Find the gmail integration row's steps container
    const stepsEl = document.getElementById('setup-steps-gmail');
    if (!stepsEl) return;
    stepsEl.style.display = 'block';
    stepsEl.innerHTML = `
      <div class="setup-step-line"><span class="ok">✓ detect</span> <span style="color:var(--text-muted)">(12ms)</span></div>
      <div class="setup-step-line"><span class="ok">✓ validate</span> <span style="color:var(--text-muted)">(8ms)</span></div>
      <div class="setup-step-line"><span class="running">⟳ test</span></div>
      <div class="setup-step-line"><span style="color:var(--text-muted)">○ save</span></div>
      <div class="setup-step-line"><span style="color:var(--text-muted)">○ confirm</span></div>
      <div class="setup-step-line"><span style="color:var(--text-muted)">○ live-test</span></div>
    `;
    // Scroll that row into view
    stepsEl.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await page.waitForTimeout(800);
  console.log('→ hero-pipeline-progress.png');
  await page.screenshot({ path: path.join(OUT, 'hero-pipeline-progress.png'), fullPage: false });

  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
