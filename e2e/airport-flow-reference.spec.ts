import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
// Test fixture values only. 31,000 departures in a 31-day month draws a daily mean of 1,000 per hour.
const bands=Array.from({length:24},(_,hour)=>({label:`${String(hour).padStart(2,'0')}~${String(hour+1).padStart(2,'0')}`,region:null,arrivals:1,departures:31000,total:null,aggregate:false,startHour:hour,endHour:hour+1}));
const stats={status:'READY',requestedMonth:'2026-08',month:'2026-07',previousMonth:null,
 current:{TIME_BAND_PASSENGERS:{operationId:'TIME_BAND_PASSENGERS',month:'2026-07',rows:bands,retrievedAt:'2026-08-30T21:07:00Z'}},previous:{}};
test('the hourly forecast figure carries the published month as a grey whole-airport reference, only for the whole airport',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:stats}));
 await page.goto('/ko/airport');
 const figure=page.locator('.airport-hero .airport-flow');
 await figure.scrollIntoViewIfNeeded();
 const lines=figure.locator('.airport-flow-reference line');
 await expect(lines).toHaveCount(24);
 await expect(lines.first()).toHaveAttribute('data-value','1000');
 await expect(figure.getByTestId('airport-flow-reference-legend')).toContainText('2026-07 같은 시간 하루 평균 실제 출발 여객 · 공항 전체');
 await expect(figure.locator('.airport-flow-reference-note')).toContainText('차이를 오차로 보지 않습니다');
 // The scale makes room for the reference: no line sits above the plot.
 const tops=await lines.evaluateAll(items=>items.map(item=>Number(item.getAttribute('y1'))));
 expect(Math.min(...tops)).toBeGreaterThan(0);
 const band=figure.locator('.airport-flow-band').first();
 await expect(band).toHaveAttribute('aria-label',/2026-07 실적 평균 1,000/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('#airport-data-flow').getByRole('tab',{name:'T1',exact:true}).click();
 await expect(figure.locator('.airport-flow-reference')).toHaveCount(0);
 await expect(page.getByTestId('airport-flow-reference-legend')).toHaveCount(0);
});
test('no stored month draws no reference and keeps the figure as before',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'MISSING',requestedMonth:'2026-08',month:null,previousMonth:null,current:{},previous:{}}}));
 await page.goto('/ko/airport');
 const figure=page.locator('.airport-hero .airport-flow');
 await expect(figure.locator('.airport-flow-band').first()).toBeAttached();
 await expect(figure.locator('.airport-flow-reference')).toHaveCount(0);
 await expect(figure.locator('.airport-flow-reference-note')).toHaveCount(0);
});
