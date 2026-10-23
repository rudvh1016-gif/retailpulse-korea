import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {chooseDate,expectDateSelection} from './date-selection';
import {tofuCharacters} from './font-glyphs';
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`zones and calendar after guide removal ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',r=>{const day=new URL(r.request().url()).searchParams.get('date')??SUMMARY_FIXTURE.todayKst;return r.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:day,dayRelation:day<SUMMARY_FIXTURE.todayKst?'PAST':'TODAY',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:day}}});});
 await page.route('**/api/live/flights*',r=>{const day=new URL(r.request().url()).searchParams.get('date')??SUMMARY_FIXTURE.todayKst;return r.fulfill({json:{mode:'live-flights',flights:['215','291'].map((gate,i)=>({physicalFlightId:`integrated-${i}`,flightNumber:`TEST${i}`,terminal:'T2',gate,direction:'departure',status:'scheduled',airportCode:'NRT',scheduledAt:`${day}T09:00:00+09:00`,retrievedAt:SUMMARY_FIXTURE.generatedAt})),truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}});});
 await page.goto(`/${lang}/airport?terminal=T2`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.getByTestId('departure-preparation')).toHaveCount(0);
 await chooseDate(page,'2026-08-30');await expectDateSelection(page,'2026-08-30');await expect(page).toHaveURL(/date=2026-08-30/);
 const model=page.getByTestId('airport-concept-model');await expect(model).toHaveCount(1);await expect(model).toHaveAttribute('data-denominator','2');await expect(model.locator('.airport-concept-counts [data-side=WEST] small')).toHaveText('50%');await expect(model.getByTestId('zone-range-EAST')).toHaveText('(253–270, 273–291)');
 expect(await tofuCharacters(page.locator('.date-nav'))).toEqual([]);
 if(width<821){
  const gap=()=>page.locator('.bottom-nav').evaluate(n=>Math.abs(visualViewport!.offsetTop+visualViewport!.height-n.getBoundingClientRect().bottom));
  for(const height of [840,900,840]){
   await page.setViewportSize({width,height});await page.locator('.stored-date-picker input[type=date]').focus();await page.keyboard.press('Escape');await page.locator('.stored-date-picker input[type=date]').blur();await expect(page.getByTestId('date-calendar-trigger')).toHaveCount(0);await expect.poll(gap).toBeLessThanOrEqual(1);
  }
  await page.locator('.airport-context-nav button').nth(2).click();const search=page.locator('.flight-search-field input');await expect(search).toBeVisible();
  for(const height of [420,840,420,900]){await page.setViewportSize({width,height});await search.scrollIntoViewIfNeeded();await search.focus();await search.fill('TEST');await expect.poll(gap).toBeLessThanOrEqual(1);const input=(await search.boundingBox())!,nav=(await page.locator('.bottom-nav').boundingBox())!;expect(input.y+input.height).toBeLessThanOrEqual(nav.y);await search.blur();}
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
