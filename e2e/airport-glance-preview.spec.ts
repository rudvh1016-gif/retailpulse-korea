import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildAirportFlightMonth,AIRPORT_MONTH_VERSION,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const date='2026-10-11';
const flight=(day:string,id:string,hour:number,airportCode='NRT',terminal='T1',gate='45'):MonthFlightRow=>({physicalFlightId:id,terminal,gate,operatingFlight:'TEST'+id,airportCode,scheduledAt:`${day}T${String(hour).padStart(2,'0')}:00:00+09:00`,retrievedAt:`${day}T00:00:00Z`,status:'scheduled'});
const flights=Array.from({length:24},(_,hour)=>Array.from({length:hour+1},(_,i)=>({...flight(date,`${hour}-${i}`,hour,'NRT',i%2?'T2':'T1',i%2?'274':'45'),direction:'departure'}))).flat();
const history=(day:string,current:boolean)=>['NRT','PEK','LAX','FRA','CDG','BKK','TPE'].flatMap((code,index)=>Array.from({length:current?index+2:1},(_,n)=>flight(day,code+n,10,code)));
const monthly={status:'READY',month:'2026-10',calculatedAt:'2026-10-11T01:00:00Z',data:{version:AIRPORT_MONTH_VERSION,asOf:date,sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,months:[buildAirportFlightMonth('2026-10',date,history('2026-10-01',true),new Set(['2026-10-01'])),buildAirportFlightMonth('2026-09',date,history('2026-09-01',false),new Set(['2026-09-01']))]}};
for(const width of [360,390,430,1440])test(`glance structure and controls ${width}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date(`${date}T10:15:00+09:00`));
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,todayKst:date,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date},generatedAt:`${date}T10:15:00+09:00`}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights,retrievedAt:`${date}T00:00:00Z`,truncated:false}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:monthly}));
 await page.goto('/ko/airport-glance-preview');
 const app=page.getByTestId('airport-glance-preview');await expect(app.locator('.glance-kpis strong').first()).toContainText('300');
 await expect(app.locator('.glance-ranking tbody tr')).toHaveCount(5);await expect(app.locator('.glance-ranking tbody tr').first()).toHaveAttribute('data-country','TW');
 await expect(app.locator('.glance-bars button[data-now=true]')).toHaveCount(1);
 const hour=app.getByRole('combobox',{name:'선택 시간'});await hour.selectOption('10');await expect(app.locator('.glance-hour-readout')).toContainText('11 편');
 expect((await hour.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await app.getByRole('button',{name:'T2',exact:true}).click();await expect(app.locator('.glance-kpis strong').first()).toContainText('144');
 await app.getByRole('button',{name:'전체',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await app.screenshot({path:`outputs/glance-structure-${width}.png`});expect(errors).toEqual([]);
});

test('past-date selection clears the current-hour marker and stale counts',async({page})=>{
 await page.clock.setFixedTime(new Date(`${date}T10:15:00+09:00`));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...SUMMARY_FIXTURE,todayKst:date,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date},generatedAt:`${date}T10:15:00+09:00`}}));
 await page.route('**/api/live/flights*',route=>{const day=new URL(route.request().url()).searchParams.get('date')!;return route.fulfill({json:{mode:'live-flights',serviceDateKst:day,flights:day===date?flights:[],retrievedAt:`${day}T00:00:00Z`,truncated:false}});});
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:monthly}));
 await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');
 await expect(app.locator('.glance-kpis strong').first()).toContainText('300');
 const input=app.locator('input[type=date]');await input.fill('2026-10-09');await input.fill('2026-10-10');
 await expect(app.locator('.glance-kpis strong').first()).toHaveText('0 편');
 await expect(app.locator('.glance-bars button[data-now=true]')).toHaveCount(0);
 await expect(app.locator('.glance-kpis strong').nth(1)).toContainText('—');
 await app.getByRole('button',{name:'오늘',exact:true}).click();
 await expect(app.locator('.glance-kpis strong').first()).toContainText('300');
 await expect(app.locator('.glance-bars button[data-now=true]')).toHaveCount(1);
});

test('failed data reads show unavailable rather than invented zero totals',async({page})=>{
 await page.route('**/api/live/summary*',route=>route.fulfill({status:503,json:{error:'unavailable'}}));
 await page.route('**/api/live/flights*',route=>route.fulfill({status:503,json:{error:'unavailable'}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({status:503,json:{error:'unavailable'}}));
 await page.goto('/en/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');
 await expect(app.locator('.glance-status')).toHaveText('No verified data available.');
 await expect(app.locator('.glance-kpis strong').first()).toContainText('—');
 await expect(app.locator('.glance-ranking tbody tr')).toHaveCount(0);
 await expect(app.locator('.glance-ranking thead th').nth(1)).toHaveText('—');
 await expect(app.locator('.glance-ranking [role=status]')).toHaveText('No verified data available.');
});

for(const [lang,title,terminal,country] of [['zh','机场一览','航站楼','国家'],['ja','空港ひと目で','ターミナル','国']] as const)for(const width of [360,1440])test(`localized glance ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.clock.setFixedTime(new Date(`${date}T10:15:00+09:00`));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...SUMMARY_FIXTURE,todayKst:date,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date},generatedAt:`${date}T10:15:00+09:00`}}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights,retrievedAt:`${date}T00:00:00Z`,truncated:false}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:monthly}));
 await page.goto(`/${lang}/airport-glance-preview`);const app=page.getByTestId('airport-glance-preview');
 await expect(app.getByRole('heading',{name:title,exact:true})).toBeVisible();
 await expect(app.getByRole('columnheader',{name:country,exact:true})).toBeVisible();
 await expect(app.locator('.glance-ranking tbody tr')).toHaveCount(5);
 await app.getByRole('group',{name:terminal,exact:true}).getByRole('button',{name:'T2',exact:true}).click();
 await expect(app.locator('.glance-kpis strong').first()).toContainText('144');
 expect(await app.textContent()).not.toMatch(/Airport at a glance|No verified data available|Approved airport artwork pending/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
