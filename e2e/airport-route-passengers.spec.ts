import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
// Test fixture values only; the page shows whatever the stored official month holds.
const summary={...SUMMARY_FIXTURE,todayKst:'2026-10-10',serviceDateKst:'2026-10-10',generatedAt:'2026-10-10T01:00:00Z',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:'2026-10-10'}};
const row=(label:string,departures:number|null)=>({label,region:null,arrivals:1,departures,total:null,aggregate:false,startHour:null,endHour:null});
const month=(value:string,rows:ReturnType<typeof row>[])=>({ROUTE_COUNTRY_PASSENGERS:{operationId:'ROUTE_COUNTRY_PASSENGERS',month:value,rows,retrievedAt:'2026-10-09T21:07:00Z'}});
const stats={status:'READY',requestedMonth:'2026-10',month:'2026-08',previousMonth:'2026-07',
 current:month('2026-08',[row('중국',500),row('일본',900),row('Synthetic Country Z',40),row('미국',null),...Array.from({length:9},(_,index)=>row(`Synthetic Country ${index}`,10-index))]),
 previous:month('2026-07',[row('일본',1000),row('중국',400)])};
for(const [lang,japan,heading] of [['ko','일본','노선 국가별 출발 여객'],['en','Japan','Departing passengers by route country']] as const)
 test(`route-country departures are the official month, ranked, with no zero for a missing count ${lang}`,async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await page.route('**/api/live/summary*',routeSummary(summary));
  await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'MISSING',month:'2026-10',months:[],calculatedAt:null,data:null}}));
  const asked=new Set<string>();
  await page.route('**/api/live/airport-passenger-stats*',route=>{asked.add(new URL(route.request().url()).searchParams.get('month')??'');return route.fulfill({json:stats});});
  await page.goto(`/${lang}/airport-countries`);
  const block=page.getByTestId('airport-route-passengers');
  await block.scrollIntoViewIfNeeded();
  await expect(block.getByRole('heading',{level:4})).toContainText(heading);
  expect(asked.has('2026-10')).toBe(true);
  await expect(block).toContainText('2026-08');
  const first=block.locator('tbody tr').first();
  await expect(first.locator('th')).toHaveText(japan);
  await expect(first.locator('td').nth(0)).toHaveText(/1,000/);
  await expect(first.locator('td').nth(1)).toHaveText(/900/);
  await expect(first.locator('td').nth(2)).toContainText('10');
  // A provider name no locale reads back is kept as published, and a missing count is left out, never shown as 0.
  await expect(block).toContainText('Synthetic Country Z');
  await expect(block.locator('tbody th',{hasText:/^(미국|United States)$/})).toHaveCount(0);
  await expect(block.locator('table').first().locator('tbody tr')).toHaveCount(8);
  const remaining=block.locator(':scope > details:not(.concise-explainer)');
  await expect(remaining).toHaveCount(1);
  await remaining.locator(':scope > summary').click();
  await expect(remaining.locator('table')).toBeVisible();
  await expect(block.locator('table').nth(1).locator('tbody tr')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
test('no published month says so instead of showing zeros',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(summary));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'MISSING',month:'2026-10',months:[],calculatedAt:null,data:null}}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'MISSING',requestedMonth:'2026-10',month:null,previousMonth:null,current:{},previous:{}}}));
 await page.goto('/ko/airport-countries');
 const block=page.getByTestId('airport-route-passengers');
 await expect(block).toContainText('공개된 공식 여객 통계가 아직 없습니다');
 await expect(block.locator('table')).toHaveCount(0);
});
