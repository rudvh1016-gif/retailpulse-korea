import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { industryProfiles } from '../lib/industry-guidance';
import { industryPlaybooks, airportStoreAreas } from '../lib/industry-playbooks';
import { tofuCharacters } from './font-glyphs';

for (const lang of ['ko', 'en', 'zh', 'ja'] as const) for (const width of [390, 1280]) {
  test(`store decisions and airport context ${lang} ${width}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    await page.goto(`/${lang}/business`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const guide = page.getByTestId('industry-guide');
    for (const id of ['beauty', 'fashion', 'food', 'convenience', 'popup', 'tourism'] as const) {
      await guide.getByRole('button', { name: industryProfiles[id].label[lang], exact: true }).click();
      for (const row of industryPlaybooks[id].priorities) {
        await expect(guide.getByRole('heading', { name: row.title[lang], exact: true })).toBeVisible();
        await expect(guide.getByText(row.action[lang], { exact: true })).toBeVisible();
      }
      await expect(guide).toContainText(industryPlaybooks[id].record[lang]);
      await expect(guide.locator('.operating-priority')).toHaveCount(3);
      for (const summary of await guide.locator('details > summary').all()) await summary.click();
      expect(await tofuCharacters(guide)).toEqual([]);
    }
    await guide.getByRole('button', { name: industryProfiles.beauty.label[lang], exact: true }).click();
    await guide.locator('.operating-priority details').first().locator('summary').click();
    await expect(guide.getByText(industryPlaybooks.beauty.priorities[0].reason[lang], { exact: true })).toBeVisible();
    await guide.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`business-${lang}-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

    await page.goto(`/${lang}/airport`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const airport = page.getByTestId('industry-guide');
    const select = airport.locator('select');
    await expect(select).toHaveValue('landside');
    await select.selectOption('airside');
    await expect(airport).toContainText(airportStoreAreas.airside.action[lang]);
    await expect(airport).toContainText(industryPlaybooks.beauty.airport[lang]);
    await select.selectOption('concourse');
    await expect(airport).toContainText(airportStoreAreas.concourse.action[lang]);
    await expect(airport.locator('.airport-operating-context')).not.toContainText(airportStoreAreas.airside.action[lang]);
    await airport.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`airport-${lang}-${width}.png`) });
    const arrivals = { ko: '입국', en: 'ARRIVALS', zh: '入境', ja: '入国' }[lang];
    await page.locator('.airport-context-nav').getByRole('button', { name: arrivals, exact: true }).click();
    await expect(select).toHaveValue('arrival');
    await expect(airport).toContainText(airportStoreAreas.arrival.action[lang]);
    await select.selectOption('arrivalDutyFree');
    await expect(airport).toContainText(airportStoreAreas.arrivalDutyFree.action[lang]);
    expect(await tofuCharacters(airport)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(errors).toEqual([]);
  });
}

test('general preparation remains identifiable when current data is missing', async ({ page }) => {
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, areas: {} }));
  await page.goto('/ko/business');
  const guide = page.getByTestId('industry-guide');
  await expect(guide).toContainText('상시 운영 참고');
  await expect(guide).toContainText('매출·방문자 수 예측이 아닙니다');
  await expect(guide.getByRole('heading', { name: '품목보다 색상·용량 단위로 재고 확인' })).toBeVisible();
  await expect(guide).not.toContainText('LIVE');
});
