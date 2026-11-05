import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import stats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import {glanceFlights,type GlanceScope} from '../lib/airport-glance';
import {kstDayOf} from '../lib/kst';

const day='2026-10-19';
const totals=Object.fromEntries((['all','T1','CONCOURSE','T2'] as GlanceScope[]).map(scope=>[scope,glanceFlights(day,flights.flights,scope).total]));
const reference={status:'READY',month:'2026-10',data:{day,previousDay:'2026-10-12',passengers:{all:null,T1:null,T2:null},flights:totals,selectedFlights:totals}};
async function fixtures(page:Page){
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:stats}));
 await page.route('**/api/live/glance-week-reference*',route=>route.fulfill({json:reference}));
}

test('home HTML hints preserve first date, leap validity and locale without widening the shared key',async({request})=>{
 const today=kstDayOf(new Date().toISOString());
 const selections=[['',today],['?date=2026-10-19',day],['?date=invalid',today],['?date=2026-02-30',today],['?date=2028-02-29','2028-02-29'],['?date=2027-02-29',today],['?date=2026-12-31','2026-12-31'],['?date=2027-01-01','2027-01-01'],['?date=2026-10-19&date=2026-10-20',day],['?date=&date=2026-10-19',today]];
 for(const lang of ['ko','en','zh','ja'])for(const[query,date]of selections){
  const response=await request.get(`/${lang}${query}`);expect(response.ok()).toBe(true);
  const links=(await response.text()).match(/<link\b[^>]*>/g)??[];
  const link=links.filter(link=>link.includes('/api/live/flights?'));expect(link).toHaveLength(1);
  expect(link[0]).toContain('as="fetch"');expect(link[0]).toMatch(/crossorigin="(?:anonymous)?"/);
  const href=link[0].match(/href="([^"]+)"/)![1].replaceAll('&amp;','&'),url=new URL(href,'https://example.org');
  expect([...url.searchParams]).toEqual([['date',date],['_day',today]]);
 }
});

test('comparison starts while flight body is held; terminal switches share that one flight read',async({page})=>{
 await fixtures(page);let reads=0,weeks=0,release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/flights*',async route=>{reads++;await held;await route.fulfill({json:flights});});
 await page.route('**/api/live/glance-week-reference*',route=>{weeks++;return route.fulfill({json:reference});});
 try{
  await page.goto(`/ko?date=${day}`,{waitUntil:'domcontentloaded'});
  await expect.poll(()=>weeks).toBe(1);expect(reads).toBe(1);
 }finally{release();}
 const metric=page.locator('.focus-flight-metric');await expect(metric).toHaveAttribute('data-metric-state','available');
 for(const [label,scope]of [['T2','T2'],['T1','T1'],['T2','T2']] as const){
  await page.getByRole('button',{name:label,exact:true}).first().click();
  await expect(metric.locator('.focus-metric-total')).toHaveText(`${totals[scope]}편`);
 }
 expect(reads).toBe(1);expect(weeks).toBe(1);
});

for(const failure of ['http','degraded','wrong-date','json'] as const)test(`${failure} preload never confirms zero and a shared focus refresh recovers`,async({page})=>{
 await fixtures(page);let recover=false,reads=0;
 await page.route('**/api/live/flights*',route=>{
  reads++;if(recover)return route.fulfill({json:flights});
  if(failure==='http')return route.fulfill({status:503,json:{mode:'degraded',flights:[]}});
  if(failure==='json')return route.fulfill({status:200,contentType:'application/json',body:'invalid'});
  return route.fulfill({json:failure==='degraded'?{mode:'degraded',serviceDateKst:day,flights:[]}:{...flights,serviceDateKst:'2026-10-18'}});
 });
 await page.goto(`/ko?date=${day}`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.waitForTimeout(250);
 const metric=page.locator('.focus-flight-metric');await expect(metric).not.toHaveAttribute('data-metric-state','available');
 await expect(metric.locator('.focus-metric-total')).not.toHaveText('0편');
 const before=reads;recover=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(metric).toHaveAttribute('data-metric-state','available');
 await expect(metric.locator('.focus-metric-total')).toHaveText(`${totals.all}편`);
 expect(reads).toBe(before+1);
});

test('a late previous-date preload cannot replace the newly selected date',async({page})=>{
 await fixtures(page);let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/summary*',route=>{
  const date=new URL(route.request().url()).searchParams.get('date')??day;
  return route.fulfill({json:{...summary,serviceDateKst:date}});
 });
 await page.route('**/api/live/flights*',async route=>{
  const date=new URL(route.request().url()).searchParams.get('date');
  if(date==='2026-10-18'){await held;await route.fulfill({json:{...flights,serviceDateKst:date,flights:[]}});}
  else await route.fulfill({json:flights});
 });
 try{
  await page.goto('/ko?date=2026-10-18',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.evaluate(()=>{history.pushState(null,'','/ko?date=2026-10-19');window.dispatchEvent(new PopStateEvent('popstate'));});
  const metric=page.locator('.focus-flight-metric .focus-metric-total');
  await expect(metric).toHaveText(`${totals.all}편`);
  release();await page.waitForTimeout(250);
  await expect(metric).toHaveText(`${totals.all}편`);
  await expect(page.locator('.focus-report-date')).toContainText(day);
 }finally{release();}
});
