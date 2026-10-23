import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Isolated real-component fixture, not an enabled production build. The only
// replacement is the test bundle's in-memory snapshot module; no runtime switch.
let script = '';
let styles = '';
test.use({ serviceWorkers: 'block' });
test.beforeAll(async () => {
  const client = '\0counter-fixture-client';
  const result = await build({
    configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'isolated-counter-snapshot', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/pageviews-client') || id === 'virtual:counter-snapshot') return client; },
      load(id) { if (id === client) return `let value=null;const listeners=new Set();export const getPageviewsSnapshot=()=>value;export const subscribePageviews=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};export function publishFixture(next){value=next;listeners.forEach(fn=>fn())}`; },
    }],
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./fixtures/site-view-counter-entry.tsx', import.meta.url)), name: 'CounterFixture', cssFileName: 'counter-fixture', formats: ['iife'] } },
  });
  for (const output of (Array.isArray(result) ? result : [result])) if ('output' in output) for (const item of output.output) {
    if (item.type === 'chunk') {
      // Vite's normal resolver otherwise wins before this test-only replacement.
      // Fail at bundle construction rather than silently subscribing to the OFF store.
      expect(Object.keys(item.modules)).toContain(client);
      expect(Object.keys(item.modules).some(id => /[/\\]lib[/\\]pageviews-client\.ts$/.test(id))).toBe(false);
      script += item.code;
    }
    else if (item.fileName.endsWith('.css')) styles += String(item.source);
  }
});
const counts = { available: true, today: 1234, total: 56789, totalComplete: true, day: '2026-10-23', startedAt: '2026-10-22T15:00:00.000Z' };
for (const lang of ['ko', 'en', 'zh', 'ja']) for (const width of [320, 390, 820, 1024, 1440]) {
  test(`${lang} ${width}: isolated enabled counter fixture`, async ({ page }) => {
    await page.route('**/*', route => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
    await page.setContent(`<div id="counter-fixture" data-lang="${lang}"></div>`);
    await page.addStyleTag({ content: styles });
    await page.addScriptTag({ content: script });
    await page.evaluate(value => (window as unknown as { setCounterFixture: (v: unknown) => void }).setCounterFixture(value), counts);
    const counter = page.locator('.site-view-counter'), button = counter.locator('button');
    await expect(counter.locator('.site-view-counter-today strong')).toHaveText('1,234');
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    if (width <= 820) {
      const brand = (await page.locator('.brand').boundingBox())!;
      expect(brand.x + brand.width).toBeLessThanOrEqual(box.x);
      expect((await page.locator('.header-meta').boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height);
      await expect(counter.locator('.site-view-counter-desktop-total')).toBeHidden();
    } else await expect(counter.locator('.site-view-counter-desktop-total')).toBeVisible();
    await button.focus(); await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(counter.locator('.site-view-counter-total strong')).toHaveText('56,789');
    await expect(counter.locator('time')).toHaveAttribute('datetime', counts.startedAt);
    await page.keyboard.press('Escape'); await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Space'); await expect(button).toHaveAttribute('aria-expanded', 'true');
    await button.click(); await expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(value => (window as unknown as { setCounterFixture: (v: unknown) => void }).setCounterFixture(value), { ...counts, today: 0 });
    await expect(counter.locator('.site-view-counter-today strong')).toHaveText('0');
    await page.evaluate(value => (window as unknown as { setCounterFixture: (v: unknown) => void }).setCounterFixture(value), { ...counts, today: 8, total: null, totalComplete: false });
    await expect(counter.locator('.site-view-counter-today strong')).toHaveText('8');
    await button.click();
    await expect(counter.locator('.site-view-counter-total strong')).toHaveText('—');
    await expect(counter.locator('.site-view-counter-gap')).toBeVisible();
    await expect(counter.locator('time')).toHaveAttribute('datetime', counts.startedAt);
    await page.evaluate(() => (window as unknown as { setCounterFixture: (v: unknown) => void }).setCounterFixture({ available: false, reason: 'unavailable' }));
    await expect(counter).toHaveCount(0);
  });
}
