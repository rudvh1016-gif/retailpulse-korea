import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';

test('v14 overview reflows across 600px without rereading data or covering labels', async ({ page }) => {
  const date = '2026-08-31';
  const flights = [{ physicalFlightId: 'v14-t1', flightNumber: 'KE1', terminal: 'T1', gate: '1',
    direction: 'departure', scheduledAt: `${date}T10:00:00+09:00`, retrievedAt: `${date}T01:00:00Z`, status: 'scheduled', airportCode: 'NRT' }];
  let reads = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-04T03:00:00Z') });
  await page.route('**/api/live/summary*', route => route.fulfill({ json: SUMMARY_FIXTURE }));
  await page.route('**/api/live/flights*', route => {
    reads++;
    return route.fulfill({ json: { mode: 'live-flights', flights, truncated: false, retrievedAt: `${date}T01:00:00Z` } });
  });
  await page.route('**/api/live/airport-days*', route => route.fulfill({ json: { mode: 'airport-days', history: [] } }));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/ko/airport');
  const model = page.getByTestId('airport-departure-model-slot').locator('.airport-concept-model');
  const picture = model.locator('.airport-concept-picture');
  const image = picture.locator('img');
  await model.scrollIntoViewIfNeeded();
  for (const phase of ['day', 'night'] as const) {
    await page.clock.setSystemTime(new Date(phase === 'day' ? '2026-10-04T03:00:00Z' : '2026-10-04T09:00:00Z'));
    await page.clock.runFor(60_001);
    for (const width of [360, 390, 1280, 600, 601, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(
        new RegExp(`/OVERVIEW_${width <= 600 ? 'MOBILE' : 'LANDSCAPE'}_${phase}(?:-390|-900)?\\.webp$`),
      );
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const box = (await image.boundingBox())!;
      expect(box.height / box.width).toBeCloseTo(width <= 600 ? 1720 / 1200 : 1300 / 2400, 2);
      const labels = await picture.locator('.airport-scene-anchor').all();
      expect(labels).toHaveLength(3);
      const positions = await Promise.all(labels.map(label => label.boundingBox()));
      for (const label of positions) {
        expect(label!.x).toBeGreaterThanOrEqual(box.x);
        expect(label!.x + label!.width).toBeLessThanOrEqual(box.x + box.width);
        expect(label!.y).toBeGreaterThanOrEqual(box.y - 1);
        expect(label!.y + label!.height).toBeLessThanOrEqual(box.y + box.height);
      }
      if (width <= 600) expect(positions[1]!.y).toBeGreaterThan(positions[0]!.y + 30);
      else expect(positions[1]!.y).toBeCloseTo(positions[0]!.y, 0);
      const counts = (await model.locator('.airport-concept-counts').boundingBox())!;
      expect(counts.y + counts.height).toBeLessThanOrEqual(box.y);
      await expect(model.locator('.airport-concept-label')).toHaveCount(0);
      await expect(model).toHaveAttribute('data-denominator', '1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  expect(reads).toBe(1);
  expect(errors).toEqual([]);
});
