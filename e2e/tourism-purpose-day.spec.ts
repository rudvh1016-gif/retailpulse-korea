import { test, expect } from '@playwright/test';
import { AREA_BLOCK, SUMMARY_FIXTURE, routeSummary } from './summary-fixture';

function payload(shopping: number | null = 125.2, tourism: number | null = 346.5) {
  return {
    ...SUMMARY_FIXTURE,
    generatedAt: '2026-10-08T15:14:00Z', todayKst: '2026-10-09', serviceDateKst: '2026-10-09',
    sources: [{ sourceId: 'SEOUL_FOREIGN_PURPOSE_MOBILITY', retrievedAt: '2026-10-08T13:50:00Z' }],
    areas: {
      ...SUMMARY_FIXTURE.areas,
      myeongdong: {
        ...AREA_BLOCK(),
        foreignPurposeMobility: {
          referenceDate: '2026-09-30', retrievedAt: '2026-10-08T13:50:00Z',
          datasetId: 'OA-22378', mappingVersion: 'fixture', shopping, tourism,
        },
      },
    },
    airport: {
      ...SUMMARY_FIXTURE.airport,
      arrivalForecast: {
        forecastCoverage: { all: 'COMPLETE', byTerminal: { T1: 'COMPLETE', T2: 'COMPLETE' } },
        todayExpectedPassengersTotal: 1000,
        nextExpectedTimeBand: {
          targetStartAt: '2026-10-09T00:00:00+09:00', targetEndAt: '2026-10-09T01:00:00+09:00',
          expectedPassengers: 360,
        },
        passengerForecastRetrievedAt: '2026-10-08T13:43:00Z',
      },
    },
  };
}

const labels = {
  ko: { title: '외국인 목적별 이동', shopping: '쇼핑 목적', tourism: '관광 목적', volume: '추정 이동 규모', period: '월별 공개 · 2026년 9월 30일', unit: '공식 원문의 단위 확인 전까지 인원으로 표시하지 않습니다', day: '기준일 하루', arrival: '인천공항 입국 예보', people: '명' },
  en: { title: 'Foreign mobility by purpose', shopping: 'Shopping purpose', tourism: 'Tourism purpose', volume: 'estimated movement volume', period: 'Released monthly · 2026-09-30', unit: 'The official unit has not been verified', day: 'displayed single day', arrival: 'Incheon Airport arrival forecast', people: 'people' },
  zh: { title: '外国人分目的移动', shopping: '购物目的', tourism: '观光目的', volume: '推算移动规模', period: '每月发布 · 2026年9月30日', unit: '官方原文单位尚未确认', day: '基准日一天', arrival: '仁川机场入境预测', people: '人' },
  ja: { title: '外国人の目的別移動', shopping: '買い物目的', tourism: '観光目的', volume: '推定移動規模', period: '月ごとに公開 · 2026年9月30日', unit: '公式原文の単位を確認できていない', day: '基準日一日', arrival: '仁川空港の入国予測', people: '人' },
} as const;

for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
  for (const width of [360, 390, 430, 1280]) {
    test(lang + ' ' + width + 'px mobility preserves fractions, the full reference day and honest units', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      await page.route('**/api/live/summary*', routeSummary(payload()));
      await page.goto('/' + lang + '/tourism-desk/myeongdong');
      const desk = page.locator('.tourism-desk');
      const copy = labels[lang];
      const mobility = desk.locator('.tourism-background-item').filter({ has: page.getByRole('heading', { name: copy.title, exact: true }) });
      await expect(mobility).toBeVisible();
      await expect(mobility.locator('dl > div').nth(0)).toHaveText(copy.shopping + '125.2 ' + copy.volume);
      await expect(mobility.locator('dl > div').nth(1)).toHaveText(copy.tourism + '346.5 ' + copy.volume);
      await expect(mobility).toContainText(copy.period);
      await expect(mobility).toContainText(copy.day);
      await expect(mobility).toContainText(copy.unit);
      for (const value of await mobility.locator('dd').all()) await expect(value).not.toContainText(copy.people);
      await expect(desk.locator('#tourism-visitor-title, .tourism-visitor-launches, dialog.tourism-visitor-show')).toHaveCount(0);
      const arrival = desk.locator('.tourism-background-item').filter({ has: page.getByRole('heading', { name: copy.arrival, exact: true }) });
      await expect(arrival).toContainText('360 ' + copy.people);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
      if (width === 390) await page.screenshot({ path: 'docs/reviews/today-schedule-tourism-copy-20261009/tourism-' + lang + '-390.png', fullPage: true });
    });
  }
}

test('zero remains zero, missing purposes stay absent, and a new reference day is not cached as a month total', async ({ page }) => {
  let response = payload(0, null);
  await page.route('**/api/live/summary*', async route => routeSummary(response)(route));
  await page.goto('/ko/tourism-desk/myeongdong');
  const mobility = page.locator('.tourism-background-item').filter({ has: page.getByRole('heading', { name: labels.ko.title, exact: true }) });
  await expect(mobility.locator('dd')).toHaveText('0 추정 이동 규모');
  await expect(mobility).not.toContainText('관광 목적');

  response = payload(null, 782.3);
  const movement = response.areas.myeongdong.foreignPurposeMobility;
  movement.referenceDate = '2026-09-29';
  await page.reload();
  await expect(mobility.locator('dd')).toHaveText('782.3 추정 이동 규모');
  await expect(mobility).toContainText('2026년 9월 29일');
  await expect(mobility).not.toContainText('쇼핑 목적');

  response = payload(null, null);
  await page.reload();
  await expect(mobility).toHaveCount(0);
  await expect(page.locator('.tourism-background-list')).toContainText('360 명');
});

test('summary failure shows the existing load message without invented purpose values', async ({ page }) => {
  await page.route('**/api/live/summary*', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/ko/tourism-desk/myeongdong');
  await expect(page.locator('.tourism-desk')).toBeVisible();
  await expect(page.locator('.tourism-background-values')).toHaveCount(0);
  await expect(page.locator('#tourism-visitor-title, dialog.tourism-visitor-show')).toHaveCount(0);
});
