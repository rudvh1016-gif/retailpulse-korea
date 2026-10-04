import {test, expect} from '@playwright/test';
import {SUMMARY_FIXTURE, routeSummary} from './summary-fixture';

const date = '2026-08-31';
// Synthetic tie/large-hour fixture; separate real-record capture verifies 577/147.
const flights = Array.from({length: 67}, (_, index) => ({
  physicalFlightId: `reading-${index}`, flightNumber: `READ${index}`,
  terminal: 'CONCOURSE', gate: index % 2 ? '111' : '113', airportCode: 'NRT',
  scheduledAt: `${date}T10:${String(index%60).padStart(2,'0')}:00+09:00`,
  direction: 'departure', status: 'scheduled', retrievedAt: `${date}T03:00:00Z`,
}));

for (const lang of ['ko','en','zh','ja'] as const) for (const width of [360,390,430,1280]) {
  test(`connected dates and complete grouped flight reading ${lang} ${width}`, async ({page}) => {
    const errors: string[]=[]; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
    await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights,truncated:false,retrievedAt:`${date}T03:00:00Z`}}));
    await page.goto(`/${lang}/airport`);
    const dates=page.locator('.date-nav-shortcuts').first();
    await expect(dates.locator('button')).toHaveCount(3);
    for(const button of await dates.locator('button').all()) {
      const box=(await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(button.locator('time')).toHaveAttribute('datetime',/\d{4}-\d{2}-\d{2}/);
    }
    const boxes=await dates.locator('button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
    expect(Math.abs(boxes[0].right-boxes[1].left)).toBeLessThan(2);
    await dates.locator('button').nth(2).focus(); await page.keyboard.press('Enter');
    await expect(dates.locator('button').nth(2)).toHaveAttribute('aria-pressed','true');
    await dates.locator('button').nth(1).click();
    await expect(dates.locator('button').nth(1)).toHaveAttribute('aria-pressed','true');
    const input=page.locator('.date-nav-picker input').first();
    await input.fill('2026-09-10'); await input.dispatchEvent('change');
    await expect(page).toHaveURL(/date=2026-09-10/);
    await dates.locator('button').nth(1).click();
    await page.locator('.airport-view>.terminal-selector button').nth(3).click();
    const list=page.getByTestId('concourse-flight-list');
    await expect(list).not.toHaveAttribute('open','');
    await expect(list.locator('input')).toHaveCount(0);
    await list.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
    const hour=list.locator('.airport-flight-hour');
    await expect(hour).toHaveCount(1);
    await hour.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
    await expect(hour.locator('li')).toHaveCount(20);
    const more={ko:'더 보기',en:'Show more',zh:'查看更多',ja:'さらに表示'}[lang]!;
    while(await hour.getByRole('button',{name:new RegExp(more)}).count()) await hour.getByRole('button',{name:new RegExp(more)}).click();
    await expect(hour.locator('li')).toHaveCount(67);
    const less={ko:'접기',en:'Collapse',zh:'收起',ja:'折りたたむ'}[lang]!;
    await hour.getByRole('button',{name:less,exact:true}).focus(); await page.keyboard.press('Enter');
    await expect(hour.locator('li')).toHaveCount(20);
    await expect(hour.locator(':scope > summary')).toBeFocused();
    await list.locator('input[type=search]').fill('READ66');
    await list.locator('.airport-flight-hour > summary').click();
    await expect(list.locator('li')).toHaveCount(1);
    await expect(list.locator('li')).toContainText('READ66');
    await list.locator('input[type=search]').fill('missing-flight');
    await expect(list.locator('.airport-flight-hour')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
