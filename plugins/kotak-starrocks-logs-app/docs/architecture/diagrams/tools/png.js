// Phone-friendly PNG of an Archify diagram: viewer controls hidden, title + diagram + legend + cards.
// usage (inside the Playwright image): node png.js <diagram.html> <out.png> [viewport width, default 700]
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const [html, png, width = '700'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: Number(width), height: 1000 },
    deviceScaleFactor: 3,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await page.goto('file://' + path.resolve(html));
  await page.addStyleTag({ content: '.toolbar, .no-print { display: none !important; }' });
  await page.waitForTimeout(1200);
  const box = await (await page.$('div.container')).boundingBox();
  const pad = 14;
  await page.screenshot({
    path: png,
    fullPage: true,
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad },
  });
  await browser.close();
})();
