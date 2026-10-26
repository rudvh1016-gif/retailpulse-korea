import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

// A Seoul visit never loads the airport screen on its own. Pointing at, or
// focusing, a way to the airport starts that load before the click, and the
// airport screen then opens as usual.
const isAirportView=(url:string)=>/\/airport-view[-.]/.test(new URL(url).pathname);
for(const [label,width,nav,reach] of [['mobile hover',390,'.bottom-nav','hover'],['desktop hover',1280,'.top-nav','hover'],['desktop keyboard',1280,'.top-nav','focus']] as const)test(`the airport screen loads only when reached for (${label})`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const requested:string[]=[],errors:string[]=[];
 page.on('request',request=>{if(isAirportView(request.url()))requested.push(request.url());});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/myeongdong');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.waitForTimeout(1000);
 expect(requested).toEqual([]);
 const airport=page.locator(`${nav} a[href="/ko/airport"]`);
 if(reach==='hover')await airport.hover();else await airport.focus();
 await expect.poll(()=>requested.length,{message:'reaching for the airport starts its load before the click'}).toBeGreaterThan(0);
 await airport.click();
 await expect(page.locator('.airport-context-nav')).toBeVisible();
 await expect(page).toHaveURL(/\/ko\/airport$/);
 expect(errors).toEqual([]);
});

// The airport glance tab works the same way.
// Only the screen's script counts: a dev server may already link its stylesheet on Seoul pages.
const isAirportGlance=(url:string)=>/\/airport-glance-preview[-.]/.test(new URL(url).pathname);
for(const [label,width,nav] of [['mobile',390,'.bottom-nav'],['desktop',1280,'.top-nav']] as const)test(`the airport glance loads only when reached for (${label})`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const requested:string[]=[],errors:string[]=[];
 page.on('request',request=>{if(request.resourceType()==='script'&&isAirportGlance(request.url()))requested.push(request.url());});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'MISSING',month:null,months:[],calculatedAt:null,data:null}}));
 await page.goto('/ko/myeongdong');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.waitForTimeout(1000);
 expect(requested).toEqual([]);
 const glance=page.locator(`${nav} a[href="/ko"]`);
 await glance.hover();
 await expect.poll(()=>requested.length,{message:'reaching for the airport glance starts its load before the click'}).toBeGreaterThan(0);
 await glance.click();
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page).toHaveURL(/\/ko$/);
 expect(errors).toEqual([]);
});

// The logo opens the airport glance home (PR #357), so it prepares that screen.
test('the logo prepares the airport glance home it opens',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 const glance:string[]=[],airport:string[]=[];
 page.on('request',request=>{if(request.resourceType()!=='script')return;if(isAirportGlance(request.url()))glance.push(request.url());if(isAirportView(request.url()))airport.push(request.url());});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'MISSING',month:null,months:[],calculatedAt:null,data:null}}));
 await page.goto('/ko/myeongdong');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.waitForTimeout(1000);
 expect(glance).toEqual([]);
 const logo=page.locator('.brand-button');
 await logo.hover();
 await expect.poll(()=>glance.length,{message:'pointing at the logo starts the glance load'}).toBeGreaterThan(0);
 expect(airport,'the logo no longer leads to the airport screen').toEqual([]);
 await logo.click();
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page).toHaveURL(/\/ko(\?|$)/);
});

test('the other tabs never load the airport screens',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 const requested:string[]=[];
 page.on('request',request=>{if(request.resourceType()==='script'&&(isAirportView(request.url())||isAirportGlance(request.url())))requested.push(request.url());});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/myeongdong');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 for(const [pathname,query] of [['/ko/where-to',''],['/ko/consumption','?area=myeongdong']]){
  await page.locator('.bottom-nav a[href="/ko/more"]').click();
  const tab=page.locator(`.more-section-links a[href="${pathname}"]`);
  await tab.hover();await tab.click();await expect(page).toHaveURL(url=>url.pathname===pathname&&url.search===query);
 }
 await page.waitForTimeout(500);
 expect(requested).toEqual([]);
});
