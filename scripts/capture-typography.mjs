import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const root = process.argv[2] ?? 'https://koretaildata.com';
const name = process.argv[3] ?? 'public-before';
const browser = await chromium.launch();
await mkdir('outputs/evidence', { recursive: true });
const records = [];
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${root}/ko/airport`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.screenshot({ path: `outputs/evidence/${name}-${width}.png`, fullPage: true });
  records.push({ width, styles: await page.evaluate(() => {
    const selectors = ['body', 'h1', '.date-nav-shortcuts button', '.airport-metric-label', '.av-display', '.section-head h2', '.airport-detail-head h3', '.airport-composition-panel-head h4', '.prep-note'];
    return selectors.flatMap(selector => [...document.querySelectorAll(selector)].slice(0, 4).map(el => { const s = getComputedStyle(el); return { selector, text: el.textContent.slice(0, 70), family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, spacing: s.letterSpacing, lineHeight: s.lineHeight, color: s.color }; }));
  }) });
  await page.close();
}
await browser.close();
await writeFile(`outputs/evidence/${name}-typography.json`, JSON.stringify(records, null, 2));
console.log(`Saved ${name} typography and pixels for 390/1280px`);
