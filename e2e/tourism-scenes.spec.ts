import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';

for (const [area, lang] of [['myeongdong', 'ko'], ['hongdae', 'en'], ['seongsu', 'zh'], ['itaewon', 'ja']]) {
  test(`tourism models preserve existing facts and source text: ${area}/${lang}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    await page.goto(`/${lang}/tourism-desk/${area}`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const desk = page.locator('.tourism-desk');
    const district = desk.locator('.tourism-district-scene img');
    await district.scrollIntoViewIfNeeded();
    await district.evaluate(element => (element as HTMLImageElement).decode());
    await expect(district).toHaveAttribute('src', `/airport-models/district-${area}.webp`);
    await expect(district).toHaveAttribute('loading', 'lazy');
    await expect(district).toHaveAttribute('alt', '');
    for (const summary of await desk.locator('.tourism-brief-detail > summary').all()) await summary.click();
    const reading = desk.locator('.tourism-brief-content').first().locator('strong');
    if (await reading.count()) await expect(reading).toBeVisible();
    else await expect(desk.locator('.tourism-shift-brief')).toBeVisible();
    const events = desk.locator('.tourism-event');
    if (await events.count()) {
      await expect(events.first().locator('.tourism-event-facts')).toContainText('TourAPI');
      const description = events.first().locator('.tourism-event-description');
      if (await description.count()) {
        await expect(description).not.toHaveAttribute('open', '');
        await description.locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(description.locator('p')).toBeVisible();
      }
    }
    expect(await desk.locator('.tourism-shift-brief h2').evaluate(element => getComputedStyle(element).color)).toBe('rgb(0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(await tofuCharacters(desk)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const width of [320, 390, 430]) {
  test(`forecast and observed air remain distinct and keyboard readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    await page.goto('/ko/tourism-desk/myeongdong');
    const weather = page.getByTestId('weather-scene');
    await expect(weather.locator('.weather-scene-forecast')).toContainText('기온 27°C');
    await expect(weather.locator('.weather-scene-forecast')).toContainText('60%');
    await expect(weather.locator('.weather-scene-observation')).toContainText('PM10 7μg/m³');
    await expect(weather.locator('.weather-scene-observation')).toContainText('서울시 도시데이터');
    await expect(weather.locator('.weather-scene-observation')).toContainText('14:05');
    await expect(weather.locator('.weather-scene-forecast')).not.toContainText('PM10');
    await expect(weather.locator('details')).not.toHaveAttribute('open', '');
    await weather.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(weather.locator('details')).toHaveAttribute('open', '');
    await expect(weather.locator('details')).toContainText('18:00');
    const image = weather.locator('img');
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => (element as HTMLImageElement).decode());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const events = page.locator('.tourism-event');
    await expect(events).toHaveCount(3);
    await expect(events.first().locator('.tourism-event-facts')).toContainText('2026-08-20');
    await expect(events.first().locator('.tourism-event-facts')).toContainText('2026-09-10');
  });
}

test('empty weather preserves the missing-data state and zero rain remains zero', async ({ page }) => {
  const base = SUMMARY_FIXTURE.areas.myeongdong;
  const zero = [{ targetAt: '2026-08-31T18:00:00+09:00', precipitationProbability: 0, temperatureTenthC: 270, conditionCode: 'clear' }];
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, areas: {
    ...SUMMARY_FIXTURE.areas, myeongdong: { ...base, weather: zero },
  } }));
  await page.goto('/ko/tourism-desk/myeongdong');
  await expect(page.getByTestId('weather-scene').locator('.weather-scene-forecast')).toContainText('0%');
  await page.unroute('**/api/live/summary*');
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, areas: {
    ...SUMMARY_FIXTURE.areas, myeongdong: { ...base, weather: [] },
  } }));
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('[data-brief="weather"]')).toHaveCount(0);
  await expect(page.locator('.tourism-shift-brief img[src*="temperature"]')).toHaveCount(0);
});
