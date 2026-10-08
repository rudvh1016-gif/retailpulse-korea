import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
const text={ko:'공급자 자료 없음이 아닙니다',en:"not a gap in the provider's data",zh:'并非供应方无数据',ja:'提供元にデータが無いわけではありません'};
for(const lang of ['ko','en','zh','ja'] as const)test(`collection failure survives summary deletion; a fresh gap does not become a failure ${lang}`,async({page})=>{
 const summary={...SUMMARY_FIXTURE,sources:[{sourceId:'INCHEON_PASSENGER_FORECAST',status:'STALE',retrievedAt:'2026-08-29T00:00:00Z'}],airport:{...SUMMARY_FIXTURE.airport,forecastCoverage:{all:'UNAVAILABLE',byTerminal:{T1:'UNAVAILABLE',T2:'UNAVAILABLE'}},passengerForecastTimeline:[],passengerForecastTimelineByTerminal:{},peakExpectedTimeBand:null,peakExpectedTimeBandByTerminal:{}}};
 await page.route('**/api/live/summary*',routeSummary(summary));await page.route('**/api/live/flights*',r=>r.fulfill({status:503,json:{}}));await page.goto(`/${lang}/airport`);
 const status=page.getByTestId('airport-forecast-collection-failure');await expect(status).toContainText(text[lang]);await expect(status).toHaveAttribute('role','status');await expect(page.locator('.airport-glance-strip,.airport-near-term,.airport-upcoming-peak')).toHaveCount(0);
 await page.unroute('**/api/live/summary*');await page.route('**/api/live/summary*',routeSummary({...summary,sources:[{sourceId:'INCHEON_PASSENGER_FORECAST',status:'LIVE',retrievedAt:SUMMARY_FIXTURE.generatedAt}]}));await page.reload();await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(status).toHaveCount(0);
});
