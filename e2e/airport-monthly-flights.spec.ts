import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {AIRPORT_MONTH_VERSION,buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const row=(day:string,id:string,terminal:string,gate:string):MonthFlightRow=>({physicalFlightId:id,terminal,gate,operatingFlight:'KE703',airportCode:'NRT',status:'scheduled',scheduledAt:day+'T09:00:00+09:00',retrievedAt:day+'T01:00:00Z'});
const summary={...SUMMARY_FIXTURE,todayKst:'2026-10-10',serviceDateKst:'2026-10-10',generatedAt:'2026-10-10T01:00:00Z',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:'2026-10-10'}};
const reply=(month='2026-10')=>({status:'READY',month,months:['2026-10','2026-09'],calculatedAt:'2026-10-10T01:00:00Z',data:{version:AIRPORT_MONTH_VERSION,asOf:'2026-10-10',sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,months:[
 buildAirportFlightMonth('2026-10','2026-10-10',[row('2026-10-01','a','T2','274'),row('2026-10-01','b','T2','274'),row('2026-10-01','c','CONCOURSE','110')],new Set(['2026-10-01'])),
 buildAirportFlightMonth('2026-09','2026-10-10',[row('2026-09-01','d','T2','231'),row('2026-09-02','e','T2','274')],new Set(['2026-09-01','2026-09-02']))]}});
for(const width of [360,390,430,1280])test(`monthly cards show top eight, expand in rank order and retain share bases ${width}`,async({page})=>{
 const payload=reply();
 payload.data.months[0]=buildAirportFlightMonth('2026-10','2026-10-10',['NRT','PEK','BKK','HAN','TPE','MNL','LAX','FRA','CDG'].map((airportCode,index)=>({...row('2026-10-01',String(index),'T2','274'),airportCode})),new Set(['2026-10-01']));
 await page.setViewportSize({width,height:900});
 await page.route('**/api/live/summary*',routeSummary(summary));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:payload}));
 await page.goto('/ko/airport');
 const section=page.getByTestId('airport-month-flights'),countries=section.getByTestId('destination-daily-changes');
 const cards=countries.locator(':scope > ul > li'),toggle=countries.getByRole('button',{name:'더 보기',exact:true});
 const order=['CN','DE','FR','JP','PH','TH','TW','US','VN'];
 await expect(countries.getByRole('heading',{name:'항공편 많은 국가 TOP8'})).toBeVisible();
 await expect(cards).toHaveCount(8);expect(await cards.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-country')))).toEqual(order.slice(0,8));
 await expect(toggle).toHaveAttribute('aria-expanded','false');await toggle.focus();await page.keyboard.press('Enter');
 await expect(cards).toHaveCount(9);expect(await cards.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-country')))).toEqual(order);
 await expect(countries.getByRole('button',{name:'접기',exact:true})).toHaveAttribute('aria-expanded','true');
 for(const country of ['US','DE','FR']){await expect(countries.locator(`li[data-country="${country}"]`)).toHaveCount(1);await expect(countries.locator(`li[data-country="${country}"] [data-period="current"] strong`)).toHaveText('1');}
 await countries.getByRole('button',{name:'접기',exact:true}).click();await expect(cards).toHaveCount(8);
 expect(await cards.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-country')))).toEqual(order.slice(0,8));
 const basis=section.locator('details').filter({has:page.getByText('동편·서편·중앙 항공편 비율',{exact:true})});
 await basis.locator(':scope > summary').click();
 await expect(basis).toContainText('선택 범위의 전체 항공편을 100%');
 await expect(basis).toContainText('동편+서편을 100%');
 await expect(basis.locator('tbody th')).toHaveText(['동편','서편','중앙','위치 미확인']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`daily-mean scope, complete lists and keyboard ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(summary));await page.route('**/api/live/airport-months*',route=>route.fulfill({json:reply()}));
 await page.goto(`/${lang}/airport`);const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();
 const includedDates=section.locator('details').filter({has:page.locator('.airport-month-period')}),includedSummary=includedDates.locator(':scope > summary');
 await includedSummary.click();await expect(includedDates).toHaveAttribute('open','');await expect(includedDates.locator('.airport-month-period').first()).toBeVisible();
 await expect(includedDates).toContainText('2026-09-01–2026-09-30');await expect(includedDates).toContainText('2/30');await expect(includedDates).toContainText('1/9');
 await includedSummary.click();
 await expect(section).toContainText('+200.0%');
 await expect(section.getByTestId('destination-daily-changes')).toBeVisible();
 await expect(section.getByTestId('country-side-rates')).toHaveCount(1);
 if(lang==='ko'&&width===390){await section.evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-180));await page.screenshot({path:info.outputPath('monthly-cross-fixture-390.png')});}
 const countries=section.getByTestId('month-list-destinationCountries');await countries.locator('summary').focus();await page.keyboard.press('Enter');await expect(countries).toHaveAttribute('open','');
 await expect(countries.locator('tbody tr')).toHaveCount(1);
 for(let repeat=0;repeat<2;repeat++){await page.getByRole('tab',{name:'T1',exact:true}).click();await page.getByRole('tab',{name:'T2',exact:true}).click();await expect(section).toContainText('+100.0%');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('a slower old month cannot replace a new selection; failures and zero baselines are explicit',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(summary));
 await page.route('**/api/live/airport-months*',async route=>{const month=new URL(route.request().url()).searchParams.get('month');if(month==='2026-09')await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({json:reply(month??undefined)});});
 await page.goto('/ko/airport');const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();await expect(section).toContainText('+200.0%');
 await section.locator('select').selectOption('2026-09');await section.locator('select').selectOption('2026-10');await page.waitForTimeout(400);await expect(section.locator('select')).toHaveValue('2026-10');await expect(section).toContainText('+200.0%');
 await page.route('**/api/live/airport-months*',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE',data:null}}));await section.locator('select').selectOption('2026-09');await expect(section).toContainText('집계');await expect(section).not.toContainText('+200.0%');
});

test('legacy update and missing months use three bounded checks; failed refresh keeps the exact last-good month',async({page})=>{
 await page.clock.install();await page.route('**/api/live/summary*',routeSummary(summary));
 let reads=0,ready=false;
 await page.route('**/api/live/airport-months*',route=>{reads++;const month=new URL(route.request().url()).searchParams.get('month')!;
  if(ready&&month==='2026-10')return route.fulfill({json:reply()});
  return route.fulfill({json:{status:month==='2026-10'?'PENDING_UPDATE':'MISSING',month,months:['2026-10','2026-09'],lastPreparedAt:`2026-10-10T00:00:${String(reads).padStart(2,'0')}Z`,data:null}});
 });
 await page.goto('/ko/airport');const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();
 await expect(section).toContainText('업데이트를 기다리고');await expect(section.getByRole('button',{name:'자료 다시 확인'})).toHaveCount(0);
 // Wait for each response's rendered state before advancing the fake clock again
 // Request entry alone does not prove response parsing and backoff registration completed
 await expect(section).toContainText('2026-10-10T00:00:01Z');
 await page.clock.runFor(2100);await expect.poll(()=>reads).toBe(2);await expect(section).toContainText('2026-10-10T00:00:02Z');
 await page.clock.runFor(10100);await expect.poll(()=>reads).toBe(3);await expect(section).toContainText('2026-10-10T00:00:03Z');
 await page.clock.runFor(30000);expect(reads).toBe(3);
 ready=true;await section.getByRole('button',{name:'자료 다시 확인'}).click();await expect(section).toContainText('+200.0%');
 await section.locator('select').selectOption('2026-09');await expect(section).toContainText('집계 자료가 아직 없습니다');await expect(section).not.toContainText('+200.0%');
 await page.route('**/api/live/airport-months*',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE',data:null}}));
 await section.locator('select').selectOption('2026-10');await expect(section).toContainText('마지막 확인 집계');await expect(section).toContainText('+200.0%');await expect(section).toContainText('2026-10-10');
});

// The map's loading slot and its loaded layout both show the monthly block. Whether the
// month reply lands before the flights (the usual case) or after, there is one read.
for(const [label,monthDelay,flightDelay] of [['month first',100,700],['flights first',900,250]] as const)test(`the monthly block keeps one read when the flight map finishes loading (${label})`,async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',routeSummary(summary));
 const sent:string[]=[];page.on('request',request=>{if(request.url().includes('/api/live/airport-months'))sent.push(new URL(request.url()).search);});
 await page.route('**/api/live/flights*',async route=>{await new Promise(resolve=>setTimeout(resolve,flightDelay));await route.fulfill({json:{mode:'live-flights',generatedAt:summary.generatedAt,serviceDateKst:'2026-10-10',flights:[],truncated:false,retrievedAt:summary.generatedAt}});});
 await page.route('**/api/live/airport-months*',async route=>{await new Promise(resolve=>setTimeout(resolve,monthDelay));await route.fulfill({json:reply()});});
 await page.goto('/ko/airport');const section=page.getByTestId('airport-month-flights');
 await expect(section).toContainText('+200.0%');await section.scrollIntoViewIfNeeded();await page.waitForTimeout(1000);
 expect(sent).toEqual(['?month=2026-10']);
});

// A chosen comparison month belongs to the date it was chosen on. Changing the date
// starts from the new date's month, whether or not that date's summary is cached.
test('a comparison month chosen for one date does not carry over to another date',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',async route=>{const date=new URL(route.request().url()).searchParams.get('date')??summary.todayKst;await route.fulfill({json:{...summary,serviceDateKst:date,airport:{...summary.airport,serviceDateKst:date}}});});
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:reply(new URL(route.request().url()).searchParams.get('month')??undefined)}));
 await page.route('**/api/live/flights*',route=>{const date=new URL(route.request().url()).searchParams.get('date')??summary.todayKst;return route.fulfill({json:{mode:'live-flights',generatedAt:summary.generatedAt,serviceDateKst:date,flights:[],truncated:false,retrievedAt:summary.generatedAt}});});
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');const section=page.getByTestId('airport-month-flights');await expect(section.locator('select')).toHaveValue('2026-10');await section.scrollIntoViewIfNeeded();
 const select=section.locator('select'),shortcuts=page.locator('.date-nav-shortcuts button');
 await expect(select).toHaveValue('2026-10');
 // Visit yesterday and come back, so both summaries are cached.
 await shortcuts.nth(0).click();await expect(select).toHaveValue('2026-10');await shortcuts.nth(1).click();await expect(select).toHaveValue('2026-10');
 await select.selectOption('2026-09');await expect(select).toHaveValue('2026-09');
 // A cached date keeps the block mounted; the choice still must not follow.
 await shortcuts.nth(0).click();await expect(select).toHaveValue('2026-10');
 // Coming back starts fresh too, as it always did.
 await shortcuts.nth(1).click();await expect(select).toHaveValue('2026-10');
 await select.selectOption('2026-09');await shortcuts.nth(2).click();await expect(select).toHaveValue('2026-10');
});
