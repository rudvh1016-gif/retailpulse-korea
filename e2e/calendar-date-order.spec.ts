import {test,expect} from '@playwright/test';
import calendar from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
const event=(country:string,start:string)=>({id:`order-${country}-${start}`,country,start,end:start,name:`Order fixture ${start}`,kind:'public_holiday',scope:'national',status:'verified',verifiedAt:'2026-10-01',sourceURL:'https://example.test/order'});
for(const lang of ['ko','en','zh','ja'])for(const width of [320,1440])test(`${lang} ${width}: calendars and brief groups remain chronological with mixed unsorted inputs`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 const extras=[{...event('JP','2026-10-21'),end:'2026-10-26'},{...event('CN','2026-10-23'),end:'2026-10-26'},event('JP','2026-10-27'),event('CN','2026-10-29'),event('JP','2026-11-15'),event('CN','2026-11-03')];
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.clock.setFixedTime(new Date('2026-10-25T01:00:00Z'));
 await page.route('**/api/live/summary*',route=>{
  const serviceDate=new URL(route.request().url()).searchParams.get('date')??'2026-10-25';
  return route.fulfill({json:{...summary,todayKst:'2026-10-25',serviceDateKst:serviceDate,generatedAt:'2026-10-25T01:00:00Z',airport:{...summary.airport,serviceDateKst:serviceDate}}});
 });
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/airport/calendar*',route=>route.fulfill({json:{status:'PARTIAL',events:[...calendar.events,...extras].reverse(),calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 const stats=(month:string)=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows:['일본','중국','베트남','미국'].map((label,index)=>({label,region:null,departures:1000-index*100,arrivals:900,total:1900-index*100,aggregate:false,startHour:null,endHour:null})),retrievedAt:'2026-10-25T01:00:00Z'});
 await page.route('**/api/live/airport-passenger-stats*',route=>{
  const month=new URL(route.request().url()).searchParams.get('month')??'2026-09',date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1);const previousMonth=date.toISOString().slice(0,7);
  return route.fulfill({json:{status:'READY',month,previousMonth,current:{ROUTE_COUNTRY_PASSENGERS:stats(month)},previous:{ROUTE_COUNTRY_PASSENGERS:stats(previousMonth)}}});
 });
 await page.goto(`/${lang}/airport-countries?mode=passengers&date=2026-09-19`);
 const contexts=page.locator('.focus-calendar-context');await expect(contexts.first()).toBeVisible();
 for(const context of await contexts.all()){
  const countries=context.locator(':scope > [data-calendar-country]');
  expect(await countries.count()).toBeGreaterThan(0);
  const codes=await countries.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-calendar-country')));if(codes.includes('KR'))expect(codes[0]).toBe('KR');
  for(const section of await countries.all()){
  const items=section.locator(':scope > [data-calendar-role]');expect(await items.count()).toBeGreaterThan(0);
  const dates=await items.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-calendar-start')!));
  expect(dates).toEqual([...dates].sort());
  const tops=await items.evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().top));expect(tops).toEqual([...tops].sort((a,b)=>a-b));
  }
  for(const group of await context.locator('[data-vacation-group]').all()){
   const starts=await group.locator('.focus-vacation-period').evaluateAll(rows=>rows.map(row=>row.textContent!.match(/\d{4}-\d{2}-\d{2}/)![0]));expect(starts).toEqual([...starts].sort());
  }
 }
 const china=page.locator('.focus-trend-context[data-country="CN"]');
 await expect(china.locator('.focus-vacation-period')).toHaveCount(2);
 await expect(china.locator('.focus-vacation-period').nth(0)).toContainText('2026-07-01');
 await expect(china.locator('.focus-vacation-period').nth(1)).toContainText('2026-07-08');
 for(const details of await contexts.locator('details').all())await expect(details).not.toHaveAttribute('open','');
 await page.goto(`/${lang}?date=2026-10-25`);
 const today=page.locator('.focus-selected-country-changes[aria-label]');
 await expect(today.locator('.focus-preparation-event')).toHaveCount(2);
 const todayStarts=await today.locator('.focus-preparation-event').evaluateAll(rows=>rows.map(row=>row.querySelector('time')!.getAttribute('datetime')!));expect(todayStarts).toEqual([...todayStarts].sort());
 const lists=page.locator('.focus-preparation-brief .focus-preparation-events');await expect(lists).toHaveCount(1);
 for(const list of await lists.all()){
  await expect(list.locator('.focus-preparation-event')).toHaveCount(2);
  const starts=await list.locator('.focus-preparation-event').evaluateAll(rows=>rows.map(row=>row.querySelector('time')!.getAttribute('datetime')!));expect(starts).toEqual([...starts].sort());
  for(const detail of await list.locator('details').all())await expect(detail).not.toHaveAttribute('open','');
 }
 await expect(page.locator('.focus-preparation-brief [data-line-icon=month]')).toHaveCount(0);
 await page.goto(`/${lang}/airport-prepare?date=2026-10-25`);
 const upcoming=page.locator('.focus-holiday-list > li');await expect(upcoming.first()).toBeVisible();
 await expect(page.locator('.focus-holiday-list > li[data-calendar-start="2026-11-15"]')).toHaveCount(1);
 const dates=await upcoming.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-calendar-start')!));expect(dates).toEqual([...dates].sort());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
