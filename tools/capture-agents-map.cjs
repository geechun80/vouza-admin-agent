const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const htmlPath = path.join(__dirname, 'agents-map.html');
  await page.goto(pathToFileURL(htmlPath).href);
  await page.waitForTimeout(800);

  // Tight crop to the actual content
  const content = await page.evaluate(() => {
    const layout = document.querySelector('.layout');
    const footer = document.querySelector('footer');
    const r = layout.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();
    return {
      x: Math.max(0, r.left - 30),
      y: 20,
      width: Math.min(window.innerWidth, r.width + 60),
      height: fr.bottom + 30,
    };
  });

  await page.screenshot({
    path: path.join(__dirname, '..', 'docs', 'assets', 'agents-skills-map.png'),
    clip: content,
  });
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
