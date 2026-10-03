import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/ko/airport';
const output = process.argv[3] ?? 'outputs/evidence/mobile-baseline.json';
const browser = await chromium.launch();
const results = [];
for (let run = 0; run < 3; run++) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__metrics = { lcp: null, cls: 0, longTasks: 0 };
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__metrics.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__metrics.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__metrics.longTasks += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(10000);
  results.push(await page.evaluate(() => ({ ...window.__metrics, resources: performance.getEntriesByType('resource').map(e => ({ name: e.name.replace(location.origin, ''), bytes: e.transferSize, duration: e.duration })), overflow: document.documentElement.scrollWidth > innerWidth })));
  results.at(-1).errors = errors;
  await context.close();
}
await browser.close();
await mkdir('outputs/evidence', { recursive: true });
await writeFile(output, JSON.stringify({ url, conditions: '390x844, cold cache, 4x CPU, 150ms RTT, 1.6Mbps down, 750kbps up, 10s after DOMContentLoaded, 3 runs; longTasks is observed blocking time, not Lighthouse TBT', results }, null, 2));
console.log(JSON.stringify(results.map(({ lcp, cls, longTasks, overflow, errors }) => ({ lcp, cls, longTasks, overflow, errors }))));
