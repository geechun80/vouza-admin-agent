// Render presentation HTML pages to PDF via Playwright
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

async function renderToPdf(htmlPath, pdfPath) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: true,
  });
  await browser.close();
  const stat = fs.statSync(pdfPath);
  console.log(`  ✓ ${path.basename(pdfPath)}  (${Math.round(stat.size / 1024)} KB)`);
}

(async () => {
  const presDir = path.join(__dirname, '..', 'docs', 'presentation');
  const outDir  = path.join(__dirname, '..', 'docs', 'assets');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Rendering presentations…');
  await renderToPdf(
    path.join(presDir, 'presentation-en.html'),
    path.join(outDir, 'Vouza-Admin-Agent-Overview-EN.pdf'),
  );
  await renderToPdf(
    path.join(presDir, 'presentation-zh.html'),
    path.join(outDir, 'Vouza-Admin-Agent-Overview-ZH.pdf'),
  );
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
