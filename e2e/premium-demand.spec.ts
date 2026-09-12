import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import type { LiveSummary } from '../app/live-signals';
import { rangeChange } from '../lib/period-comparison';

const baseline = process.env.KORETAIL_DESIGN_BASELINE === 'true';
const recorded = process.env.KORETAIL_RECORDED_SUMMARY;
const payload = recorded ? JSON.parse(readFileSync(recorded, 'utf8')) : SUMMARY_FIXTURE;

for (const width of [390, 1440]) {
  for (const route of ['', '/hongdae', '/airport']) {
    test(`premium screen ${route || 'home'} at ${width}`, async ({ page }, info) => {
      const requests: string[] = [];
      page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
      await page.clock.install({ time: new Date(payload.generatedAt) });
      await page.route('**/api/live/summary*', routeSummary(payload));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/ko${route}`);
      await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
      if (!route) await page.locator('.personal-existing > summary').click();
      await expect(page.locator(route === '/airport' ? '.airport-current-brief' : '.area-current-brief').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({ path: info.outputPath(`${baseline ? 'before' : 'after'}-${route.slice(1) || 'home'}-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(requests.filter(url => new URL(url).pathname === '/api/live/summary').length).toBeLessThanOrEqual(1);
      if (!baseline && route !== '/airport') {
        await expect(page.getByTestId('area-demand-card').first()).toBeVisible();
        await expect(page.locator('.population-chart').first()).toBeVisible();
        if (route) {
          const y = await page.locator('.demand-number').first().evaluate(el => el.getBoundingClientRect().bottom);
          expect(y).toBeLessThan(700);
        }
        const slider = page.getByRole('slider').first();
        await slider.focus();
        await slider.press('ArrowRight');
        await expect(slider).toHaveAttribute('aria-valuetext', /KST/);
      }
      console.log('DESIGN_SCREEN', JSON.stringify({ width, route, recorded: !!recorded, requests }));
    });
  }
}

for (const lang of ['ko', 'en', 'zh', 'ja']) {
  test(`compact public overview and navigation in ${lang}`, async ({ page }) => {
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto(`/${lang}`);
    await expect(page.getByTestId('personal-onboarding')).toBeVisible();
    await expect(page.getByTestId('area-demand-card')).toHaveCount(0);
    await page.locator('.personal-existing > summary').click();
    const card = page.getByTestId('area-demand-card').first();
    await expect(card).toBeVisible();

    await page.locator('.home-area-briefs button').nth(1).click();
    await expect(card.locator('h2')).toHaveText({ko:'홍대',en:'Hongdae',zh:'弘大',ja:'弘大'}[lang]!);
    await page.locator('.demand-card-footer > a').first().click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/hongdae`));
    await page.goBack();
    await expect(page.getByTestId('personal-onboarding')).toBeVisible();
    await expect(page.locator('.demand-home')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.personal-existing > summary').click();
    await expect(page.locator('.demand-home')).toBeVisible();
  });
}

for (const state of ['forecast-only', 'missing', 'stale', 'comparison-overlap', 'partial-airport']) {
  test(`truthful local state: ${state}`, async ({ page }) => {
    const data = structuredClone(SUMMARY_FIXTURE) as unknown as LiveSummary;
    const area = data.areas.myeongdong!;
    if (state === 'forecast-only' || state === 'missing') area.realtime = null;
    if (state === 'missing') area.realtimeForecast = [];
    if (state === 'stale') area.realtime = { ...area.realtime!, observedAt: '2026-08-31T10:00:00+09:00', freshness: 'STALE' };
    if (state === 'comparison-overlap') Object.assign(area.realtime!, { comparisons: { 7: rangeChange(23000,25000,24000,26000,'2026-08-24T14:07:00+09:00') } });
    if (state === 'partial-airport') {
      data.airport.forecastCoverage.all = 'PARTIAL';
      data.airport.todayExpectedPassengersTotal = null;
      data.airport.peakExpectedTimeBand = null;
      data.airport.remainingExpectedPassengers = null;
      data.airport.passengerForecastTimeline = [data.airport.passengerForecastTimeline[0], data.airport.passengerForecastTimeline.at(-1)!];
    }
    await page.route('**/api/live/summary*', routeSummary(data));
    await page.goto(state === 'partial-airport' ? '/ko/airport' : '/ko/myeongdong');
    if (state === 'partial-airport') {
      await expect(page.locator('.airport-timeline')).toBeVisible();
      await expect(page.locator('.airport-brief-total')).toHaveCount(0);
      await expect(page.locator('.airport-current-brief')).toContainText('이후 확인된 시간대 중 최대');
      await expect(page.locator('.airport-current-brief')).not.toContainText("오늘 피크");
    } else {
      const card = page.getByTestId('area-demand-card');
      await expect(card).toBeVisible();
      if (state === 'missing') { await expect(card.locator('.demand-number')).toHaveText('—'); await expect(card.locator('svg')).toHaveCount(0); }
      if (state === 'forecast-only') { await expect(card.locator('.flow-forecast')).not.toHaveCount(0); await expect(card.locator('.flow-observed')).toHaveCount(0); }
      if (state === 'stale') await expect(card).toContainText('이전 자료');
      if (state === 'comparison-overlap') await expect(card).toContainText('증가·감소를 확정할 수 없습니다');
      await expect(card).not.toContainText('서울 1위');
    }
  });
}


test('selected dates and terminal scopes survive links, reload and back', async ({ page }) => {
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/predictions*', routeSummary({targetDate:'2026-09-01',run:null,coverage:null,records:[]}));
  await page.goto('/ko?date=2026-09-01');
  await page.locator('.personal-existing > summary').click();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await expect(page.locator('.demand-card-footer > a').first()).toHaveAttribute('href','/ko/myeongdong?date=2026-09-01');
  await page.goto('/ko/airport?terminal=T1&date=2026-09-01');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.getByRole('tab',{name:'T2',exact:true}).click();
  await expect(page).toHaveURL(/terminal=T2/);
  await page.reload();
  await expect(page.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'전체',exact:true}).click();
  await expect(page).not.toHaveURL(/terminal=/);
  await page.goBack();
  await expect(page.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');
  await page.goto('/ko/predictions?area=hongdae');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.locator('.prediction-view .segmented').getByRole('button',{name:'성수',exact:true}).click();
  await expect(page).toHaveURL(/area=seongsu/);
  await page.reload();
  await expect(page.locator('.prediction-view .segmented').getByRole('button',{name:'성수',exact:true})).toHaveAttribute('aria-pressed','true');
});
