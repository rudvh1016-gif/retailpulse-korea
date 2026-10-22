import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
// Test fixture values only. 31,000 departures in a 31-day month draws a daily mean of 1,000 per hour.
const bands=Array.from({length:24},(_,hour)=>({label:`${String(hour).padStart(2,'0')}~${String(hour+1).padStart(2,'0')}`,region:null,arrivals:1,departures:31000,total:null,aggregate:false,startHour:hour,endHour:hour+1}));
const stats={status:'READY',requestedMonth:'2026-08',month:'2026-07',previousMonth:null,
 current:{TIME_BAND_PASSENGERS:{operationId:'TIME_BAND_PASSENGERS',month:'2026-07',rows:bands,retrievedAt:'2026-08-30T21:07:00Z'}},previous:{}};
for(const width of [320,390,430,1280])test(`the grey reference disclosure aligns with airport body at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:stats}));
 await page.goto('/ko/airport');
 const figure=page.locator('.airport-hero .airport-flow');
 await figure.scrollIntoViewIfNeeded();
 const lines=figure.locator('.airport-flow-reference path');
 await expect(lines).toHaveCount(1);
 await expect(figure.locator('.airport-flow-reference line')).toHaveCount(0);
 expect((await lines.getAttribute('d'))?.match(/L/g)).toHaveLength(23);
 await expect(lines).toHaveAttribute('stroke-dasharray','5 3');
 await expect(figure.getByTestId('airport-flow-reference-legend')).toContainText('2026년 7월 공식 실적 · 시간대별 하루 평균');
 const note=figure.locator('.airport-flow-reference-note');
 const disclosure=figure.locator('.airport-flow-reference-details');
 const summary=disclosure.locator('summary');
 await expect(disclosure).not.toHaveAttribute('open','');
 await expect(note).not.toBeVisible();
 await expect(summary).toHaveText('회색선 기준 보기');
 await expect(summary).toHaveCSS('font-size','12px');
 expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 const body=page.locator('#airport-forecast-title');
 expect((await summary.boundingBox())!.x).toBeCloseTo((await body.boundingBox())!.x,0);
 expect((await summary.boundingBox())!.x).toBeGreaterThanOrEqual(14);
 await summary.focus();await expect(summary).toBeFocused();
 await summary.press('Enter');await expect(note).toBeVisible();
 await expect(note).toHaveCSS('font-size','12px');
 await expect(note.locator('a')).toHaveCSS('font-size','12px');
 await expect(note).toHaveCSS('line-height','19.2px');
 await summary.press('Space');await expect(note).not.toBeVisible();
 await expect(summary).toBeFocused();
 await summary.press('Enter');await expect(note).toBeVisible();
 await expect(note).toContainText('2026년 7월의 시간대별 하루 평균 출발 여객');
 await expect(note).toContainText('31일로 나눈 값');
 await expect(note).toContainText('집계 기준이 달라');
 await expect(note).not.toContainText('15095070');
 await expect(note.getByRole('link',{name:'출처: 인천국제공항공사'})).toHaveAttribute('href','https://www.data.go.kr/data/15095070/openapi.do');
 // The scale makes room for the reference: no line sits above the plot.
 const tops=await lines.evaluateAll(items=>items.flatMap(item=>(item.getAttribute('d')??'').match(/[ML][^ML]+/g)?.map(point=>Number(point.split(',')[1]))??[]));
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

test('the monthly reference leaves a missing hour disconnected',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{...stats,current:{TIME_BAND_PASSENGERS:{...stats.current.TIME_BAND_PASSENGERS,rows:bands.filter(row=>row.startHour!==12)}}}}));
 await page.goto('/ko/airport');
 const reference=page.locator('.airport-hero .airport-flow-reference path');
 await expect(reference).toHaveCount(1);
 const d=await reference.getAttribute('d');
 expect(d?.match(/M/g)).toHaveLength(2);
 expect(d?.match(/L/g)).toHaveLength(21);
});
