import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

for(const width of [360,390,430,1440])for(const lang of ['ko','en','zh','ja']){
 test(`passenger explanation stays reserved through data and font changes ${lang} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.setFixedTime(new Date('2026-08-31T14:15:00+09:00'));
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let releaseSummary!:()=>void,releaseFonts!:()=>void;
  const summaryGate=new Promise<void>(resolve=>{releaseSummary=resolve;}),fontGate=new Promise<void>(resolve=>{releaseFonts=resolve;});
  await page.route('**/fonts/**',async route=>{await fontGate;await route.continue();});
  await page.route('**/api/live/summary*',async route=>{
   await summaryGate;
   const day=new URL(route.request().url()).searchParams.get('date')??'2026-08-31',missing=day==='2026-08-30',partial=day==='2026-08-29';
   await routeSummary({...SUMMARY_FIXTURE,serviceDateKst:day,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:day,
    passengerForecastRetrievedAt:missing?null:'2026-08-31T23:59:00+09:00',
    passengerForecastRetrievedAtByTerminal:missing?{}:{T1:'2026-08-31T23:59:00+09:00',T2:'2026-08-31T23:59:00+09:00'},
    todayExpectedPassengersTotal:missing?null:47320,todayExpectedPassengersByTerminal:missing?{T1:null,T2:null}:{T1:30100,T2:17220},
    forecastCoverage:missing?{all:'MISSING',byTerminal:{T1:'MISSING',T2:'MISSING'}}:partial?{all:'PARTIAL',byTerminal:{T1:'PARTIAL',T2:'PARTIAL'}}:SUMMARY_FIXTURE.airport.forecastCoverage,
    transferForecast:missing?[]:[{serviceDate:day,terminal:'T1',expectedTransferPassengers:178,retrievedAt:`${day}T00:00:00Z`},{serviceDate:day,terminal:'T2',expectedTransferPassengers:8528,retrievedAt:`${day}T00:00:00Z`}],
   }})(route);
  });
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:'2026-08-31',flights:[],retrievedAt:'2026-08-31T00:00:00Z',truncated:false}}));
  await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'UNAVAILABLE',data:null,calculatedAt:null}}));
  await page.route('**/api/live/duty-free-exchange*',route=>route.fulfill({status:503,json:{}}));
  try{
   await page.goto(`/${lang}`,{waitUntil:'domcontentloaded'});await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
   const pair=page.locator('.glance-passenger-pair'),row=page.getByTestId('glance-key-passengers');
   const initial=(await pair.boundingBox())!;
   const stable=async()=>{
    await expect.poll(async()=>Math.abs((await pair.boundingBox())!.height-initial.height)).toBeLessThanOrEqual(.5);
    expect(await pair.evaluate(el=>[...el.querySelectorAll('small')].every(note=>note.scrollHeight<=note.clientHeight+1))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   };
   releaseSummary();await expect(row.locator('strong')).toContainText('47,320');await stable();
   await page.getByRole('button',{name:'T1',exact:true}).click();await expect(row.locator('strong')).toContainText('30,100');await stable();
   releaseFonts();await page.evaluate(()=>document.fonts.ready);await stable();
   for(const day of ['2026-08-30','2026-08-29','2026-08-28']){
    await page.locator('.glance-controls input').fill(day);await expect(row.locator('small')).toContainText(day);
    await expect.poll(()=>row.locator('strong').textContent()).not.toMatch(/Checking|확인 중|確認中|确认中/);
    await stable();
   }
   await expect(row.locator('small')).toContainText('23:59');
   await row.focus();await expect(row).toBeFocused();expect(errors).toEqual([]);
  }finally{releaseSummary();releaseFonts();}
 });
}
