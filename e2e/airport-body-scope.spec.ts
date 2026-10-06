import {expect,test} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {airportSides} from '../lib/airport-sides-summary';

const date='2026-08-31';
const flights=[['215','09:10'],['252','14:30'],['291','15:00']].map(([gate,time],index)=>({
 physicalFlightId:`BODY${index}`,flightNumber:`KE${index+1}`,terminal:'T2',gate,airportCode:'NRT',airlineCode:'대한항공',
 direction:'departure',status:'scheduled',scheduledAt:`${date}T${time}:00+09:00`,retrievedAt:'2026-08-31T05:00:00Z',
}));
test.use({hasTouch:true});
test.beforeEach(async({page})=>{
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,airport:{...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],flights,[],false,false)}}));
 await page.route('**/api/live/flights*',routeSummary({mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',serviceDateKst:date,todayKst:date,flights,truncated:false,retrievedAt:'2026-08-31T05:00:00Z'}));
 await page.route('**/api/live/airport-days*',routeSummary({mode:'airport-days',date,history:[]}));
 await page.route('**/api/live/usual*',route=>route.fulfill({status:503,json:{}}));
});

for(const lang of ['ko','en','zh','ja'])test(`airport body stays airport-only and Seoul navigation is preserved ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:900});
 for(const path of [`/${lang}`,`/${lang}/airport`]){
  await page.goto(path);
  await expect(page.locator('.airport-view')).toBeVisible();
  await expect(page.locator('.home-seoul-secondary')).toHaveCount(0);
  await expect(page.getByTestId('population-outlook')).toHaveCount(0);
  const seoul=page.locator(`.bottom-nav a[href="/${lang}/myeongdong"]`);
  await expect(seoul).toBeVisible();
  await seoul.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/myeongdong$`));
  await expect(page.getByTestId('population-outlook')).toBeVisible();
  await expect(page.locator('.area-tabs [role=tab]')).toHaveCount(4);
  await page.locator(`.bottom-nav a[href="/${lang}/airport"]`).click();
  await expect(page.locator('.airport-view')).toBeVisible();
  await expect(page.getByTestId('population-outlook')).toHaveCount(0);
 }
});

for(const width of [320,390,430,1280])test(`one zone summary survives closed map details and selected hours ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});
 let reads=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/live/flights')reads++;});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/ko/airport?terminal=T2');
 const overview=page.getByTestId('airport-departure-overview');
 const details=overview.getByTestId('departure-map-section'),summary=details.locator(':scope > summary');
 const model=page.getByTestId('airport-concept-model'),map=overview.getByTestId('departure-map');
 await expect(model).toHaveAttribute('data-denominator','3');
 await expect(model).toBeVisible();
 await expect(overview.getByTestId('flight-split')).toHaveCount(0);
 await expect(details).not.toHaveAttribute('open','');
 await expect(summary.locator('[aria-hidden=true]')).toHaveText('+');
 await expect(map).not.toBeVisible();
 await summary.scrollIntoViewIfNeeded();
 expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`airport-details-closed-${width}.png`)});
 await summary.focus();await page.keyboard.press('Enter');
 await expect(map).toBeVisible();
 await expect(summary.locator('[aria-hidden=true]')).toHaveText('−');
 await expect(summary).toBeFocused();
 expect(await summary.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await map.locator('[data-preset="NEXT3"]').click();
 await expect(model).toHaveAttribute('data-denominator','2');
 await expect(map.getByTestId('map-counts')).toContainText('서편 0편');
 await expect(map.getByTestId('map-counts')).toContainText('동편 1편');
 await expect(map.getByTestId('map-counts')).toContainText('중앙 1편');
 await map.getByTestId('map-destinations').locator('summary').click();
 await expect(map.getByTestId('map-groups')).toBeVisible();
 await expect(map.getByTestId('map-flights')).toBeVisible();
 await page.screenshot({path:info.outputPath(`airport-details-open-${width}.png`)});
 await summary.focus();await page.keyboard.press('Space');
 await expect(map).not.toBeVisible();
 await expect(model).toHaveAttribute('data-denominator','2');
 await expect(model).toBeVisible();
 await summary.tap();
 await expect(map.locator('[data-preset="NEXT3"]')).toHaveAttribute('aria-pressed','true');
 expect(reads).toBe(1);
 expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
