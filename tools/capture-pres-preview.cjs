const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 794, height: 1123 }, // A4 @ 96dpi
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  for (const [lang, file] of [['en', 'presentation-en.html'], ['zh', 'presentation-zh.html']]) {
    const url = pathToFileURL(path.join(__dirname, '..', 'docs', 'presentation', file)).href;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    // Screenshot just first page (height ~ A4 portrait)
    await page.screenshot({
      path: path.join(__dirname, '..', 'docs', 'assets', `presentation-${lang}-preview.png`),
      clip: { x: 0, y: 0, width: 794, height: 1123 },
    });
    console.log(`  ✓ ${lang} cover preview`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
