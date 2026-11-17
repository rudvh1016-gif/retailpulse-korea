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
    await page.goto(`/${lang}/business?place=airport&terminal=T1`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const guide = page.getByTestId('industry-guide');
    for (const id of ['beauty', 'fashion', 'food', 'convenience', 'popup', 'tourism', 'liquor', 'luxury'] as const) {
      await guide.getByRole('button', { name: industryProfiles[id].label[lang], exact: true }).click();
      for (const [index, row] of industryPlaybooks[id].priorities.entries()) {
        await expect(guide.getByRole('heading', { name: row.title[lang], exact: true })).toBeVisible();
        const priority = guide.locator('.operating-priority').nth(index);
        await expect(priority.getByText(row.action[lang], { exact: true })).toBeVisible();
        // Airport guidance keeps the reasoning in an evidence disclosure.
        const evidence = priority.locator('details');
        await expect(evidence).toHaveCount(1);
        await expect(evidence).not.toHaveAttribute('open', '');
        await expect(evidence.getByText(row.reason[lang], { exact: true })).not.toBeVisible();
        const toggle = evidence.locator(':scope > summary');
        await toggle.focus();
        await toggle.press('Enter');
        await expect(evidence).toHaveAttribute('open', '');
        await expect(evidence.getByText(row.reason[lang], { exact: true })).toBeVisible();
        await toggle.press('Enter');
        await expect(evidence).not.toHaveAttribute('open', '');
      }
      await expect(guide.locator('.operating-record')).toHaveCount(0);
      await expect(guide.locator('.operating-priority')).toHaveCount(3);
      const checklist = guide.locator('.operating-checklist');
      await checklist.locator(':scope > summary').click();
      await expect(checklist).toHaveAttribute('open', '');
      await expect(checklist.locator('.checklist-rows > li')).toHaveCount(industryProfiles[id].checklist[lang].length);
      expect(await tofuCharacters(guide)).toEqual([]);
    }
    await guide.getByRole('button', { name: industryProfiles.beauty.label[lang], exact: true }).click();
    await guide.locator('.operating-priority').first().locator('details > summary').click();
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
  await page.goto('/ko/business?place=airport&terminal=T1');
  const guide = page.getByTestId('industry-guide');
  await expect(guide.getByTestId('industry-unselected')).toBeVisible();
  await guide.getByRole('button', { name: industryProfiles.beauty.label.ko, exact: true }).click();
  await expect(guide).toContainText('상시 운영 참고');
  await expect(guide).toContainText('매출·방문자 수 예측이 아닙니다');
  await expect(guide.getByRole('heading', { name: '품목보다 색상·용량 단위로 재고 확인' })).toBeVisible();
  await expect(guide).not.toContainText('LIVE');
});

for (const width of [320, 390, 430]) test(`airport concept models and keyboard disclosures ${width}`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.goto('/ko/business?place=airport&terminal=T1');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const guide = page.getByTestId('industry-guide');
  for (const id of ['beauty', 'convenience'] as const) {
    await guide.getByRole('button', { name: industryProfiles[id].label.ko, exact: true }).click();
    const image = guide.locator('.airport-shop-model img');
    await expect(guide.locator('.store-industry-model')).toHaveCount(0);
    await expect(guide.locator('.airport-shop-model figcaption')).toContainText('실제 공항 매장 위치가 아닙니다');
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();
    expect(await image.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain(`/airport-models/shop-${id}.webp`);
    await expect(image).toHaveAttribute('alt', '');
    const detail = guide.locator('.operating-checklist');
    await expect(detail).not.toHaveAttribute('open', '');
    await detail.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(guide.getByText(industryPlaybooks[id].priorities[0].action.ko, { exact: true })).toBeVisible();
    await expect(detail.locator('.checklist-rows > li')).toHaveCount(industryProfiles[id].checklist.ko.length);
    await page.keyboard.press('Enter');
    await expect(detail).not.toHaveAttribute('open', '');
    await guide.scrollIntoViewIfNeeded();
    await guide.screenshot({ path: info.outputPath(`${id}-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect(await guide.locator('.operating-priority h4').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(0, 0, 0)');
  }
  expect(errors).toEqual([]);
});
