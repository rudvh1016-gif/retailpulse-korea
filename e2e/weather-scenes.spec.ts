import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, MYEONGDONG_CONTEXT, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';

for (const lang of ['ko', 'en', 'zh', 'ja']) for (const width of [320, 390, 430]) {
  test(`weather scene preserves fresh observation and forecast ${lang}/${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    await page.goto(`/${lang}/myeongdong`);
    const observation = page.locator('.context-environment');
    const forecast = page.locator('[data-signal-key="weather"]');
    await expect(observation).toContainText('29.4°C');
    await expect(observation).toContainText('44%');
    await expect(observation).toContainText('7μg/m³');
    await expect(forecast).toContainText('27°C');
    await expect(forecast).toContainText('60%');
    await expect(forecast).not.toContainText('65%');
    await expect(forecast).not.toContainText('2.5m/s');
    const panel = page.locator('.seoul-weather-panel');
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('> h3')).toBeVisible();
    await expect(panel.locator('.context-environment')).toHaveCount(1);
    await expect(panel.locator('[data-signal-key="weather"]')).toHaveCount(1);
    await expect(observation.locator('img')).toHaveCount(5);
    await expect(forecast.locator('img')).toHaveCount(3);
    for (const image of await panel.locator('img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => (element as HTMLImageElement).decode());
      await expect(image).toHaveAttribute('loading', 'lazy');
      await expect(image).toHaveAttribute('alt', '');
    }
    await expect(forecast.locator('details')).not.toHaveAttribute('open', '');
    const toggle = forecast.locator('summary');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(forecast.locator('details')).toHaveAttribute('open', '');
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await forecast.locator('h4').evaluate(el => getComputedStyle(el).color)).toBe('rgb(0, 0, 0)');
    expect(await forecast.locator('.weather-scene-values li').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('15px');
    expect(await observation.locator('.weather-scene-values li').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('15px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await tofuCharacters(forecast)).toEqual([]);
    expect(await tofuCharacters(observation)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('stale weather observation retains its clock, explanation and forecast fallback fields', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, areas: {
    ...SUMMARY_FIXTURE.areas, myeongdong: { ...SUMMARY_FIXTURE.areas.myeongdong,
      context: { ...MYEONGDONG_CONTEXT, weather: { ...MYEONGDONG_CONTEXT.weather, observedAt: '2026-08-30T14:50:00+09:00' } },
    },
  } }));
  await page.goto('/ko/myeongdong');
  const observation = page.locator('.context-environment');
  await expect(observation).not.toContainText('지금 29.4°C');
  await expect(observation).toContainText('08-30 14:50 관측 29.4°C');
  const explanation = observation.locator('details');
  await expect(explanation).not.toHaveAttribute('open', '');
  await explanation.locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(explanation.locator('p')).toBeVisible();
  await expect(explanation).toContainText('23시간 20분 전 관측된 값입니다');
  await expect(explanation).toContainText('기상청 예보라서 숫자가 다릅니다');
  const forecast = page.locator('[data-signal-key="weather"]');
  await expect(forecast).toContainText('습도 65%');
  await expect(forecast).toContainText('바람 2.5m/s');
  await expect(forecast.locator('img')).toHaveCount(5);
  await expect(page.locator('.seoul-weather-panel')).toHaveCount(1);
});

for (const probability of [0, null]) test(`forecast without observation preserves probability ${probability}`, async ({ page }) => {
  const weather = [{ targetAt: '2026-08-31T18:00:00+09:00', issuedAt: '2026-08-31T14:00:00+09:00',
    precipitationProbability: probability, temperatureTenthC: 270, conditionCode: 'clear' }];
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, areas: {
    ...SUMMARY_FIXTURE.areas, myeongdong: { ...SUMMARY_FIXTURE.areas.myeongdong, weather,
      context: { ...MYEONGDONG_CONTEXT, weather: null },
    },
  } }));
  await page.goto('/ko/myeongdong');
  const forecast = page.locator('[data-signal-key="weather"]');
  await expect(forecast).toContainText('27°C');
  await expect(forecast).toContainText('예보 발표');
  await expect(forecast).toContainText('14:00');
  if (probability === 0) await expect(forecast).toContainText('강수확률 최대 0%');
  else await expect(forecast).not.toContainText('강수확률 최대');
  await expect(forecast.locator('img')).toHaveCount(probability === 0 ? 3 : 2);
  await expect(forecast.locator('img[src*="/sun-"]')).toHaveCount(1);
  await expect(forecast.locator('img[src*="/rain-"]')).toHaveCount(probability === 0 ? 1 : 0);
  await forecast.locator('img').first().evaluate(el => (el as HTMLImageElement).decode());
  await expect(page.locator('.context-environment img')).toHaveCount(0);
});

test('rows with no published weather readings do not acquire numbers or a model', async ({ page }) => {
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, areas: {
    ...SUMMARY_FIXTURE.areas, myeongdong: { ...SUMMARY_FIXTURE.areas.myeongdong,
      weather: [{ targetAt: '2026-08-31T18:00:00+09:00', precipitationProbability: null, temperatureTenthC: null, conditionCode: null }],
      context: { ...MYEONGDONG_CONTEXT, weather: null },
    },
  } }));
  await page.goto('/ko/myeongdong');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('[data-signal-key="weather"]')).toHaveCount(0);
  await expect(page.locator('.signal-group-now .weather-scene img')).toHaveCount(0);
});

test('PTY-only weather preserves the existing missing-guidance rule without inventing 0%', async ({ page }) => {
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, areas: {
    ...SUMMARY_FIXTURE.areas, myeongdong: { ...SUMMARY_FIXTURE.areas.myeongdong,
      weather: [{ targetAt: '2026-08-31T18:00:00+09:00', precipitationProbability: null,
        temperatureTenthC: null, conditionCode: null, precipitationTypeCode: '3' }],
      context: { ...MYEONGDONG_CONTEXT, weather: null },
    },
  } }));
  await page.goto('/ko/myeongdong');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('[data-signal-key="weather"]')).toHaveCount(0);
  await expect(page.locator('.signal-group-now .weather-scene img')).toHaveCount(0);
});
