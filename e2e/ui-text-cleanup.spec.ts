import { expect, test } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { airportSides } from '../lib/airport-sides-summary';

test.use({hasTouch:true});

const date='2026-08-31';
const base={terminal:'T2',direction:'departure',scheduledAt:`${date}T09:00:00+09:00`,retrievedAt:`${date}T03:00:00Z`,status:'scheduled',airportCode:'NRT'};
const known=['208','252','279'].map((gate,i)=>({...base,gate,physicalFlightId:`known-${i}`,flightNumber:`TEST${i}`}));
const unknown=Array.from({length:3},(_,i)=>({...base,gate:null,physicalFlightId:`unknown-${i}`,flightNumber:`UNKNOWN${i}`}));

for(const width of [320,390,430,1280]) {
 test(`retired Seoul entry: compact comparison and device notes ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const langCode = 'ko';
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/myeongdong?date=2026-08-31`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});

 test(`zone headings and real unverified records ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  let records:Array<Record<string,unknown>>=known;
  await page.route('**/api/live/summary*',route=>route.fulfill({json:{...SUMMARY_FIXTURE,airport:{...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],records,[],false,false)}}}));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights:records,truncated:false,retrievedAt:base.retrievedAt}}));
  await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',history:[]}}));
  await page.goto('/ko/airport?terminal=T2');
  const model=page.getByTestId('gate-pillar-model');
  await model.scrollIntoViewIfNeeded();
  await expect(model.locator('.gate-leader-zones > section')).toHaveCount(3);
  await expect(model.getByTestId('gate-unverified-details')).toHaveCount(0);
  await page.goto(`/ko/airport-countries?mode=zones&date=${date}&building=T2`);
  const countries=page.getByTestId('map-zone-countries');
  await countries.scrollIntoViewIfNeeded();
  await expect(countries.locator('h5')).toHaveCount(3);
  for(const heading of await countries.locator('h5').all()) {
   await expect(heading).toHaveCSS('font-weight','600');
   await expect(heading).toHaveCSS('color','rgb(0, 0, 0)');
  }
  await expect(countries.getByTestId('country-unverified-details')).toHaveCount(0);
  records=[...known,...unknown];await page.goto('/ko/airport?terminal=T2');
  await model.scrollIntoViewIfNeeded();
  const note=model.getByTestId('gate-unverified-details');
  await expect(note.locator('summary')).toHaveText('※ 위치 미확인 3편');
  await expect(note.locator('li').first()).not.toBeVisible();
  await note.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(note.locator('li')).toHaveCount(3);
  await expect(note.locator('li').first()).toContainText('UNKNOWN0');
  await page.keyboard.press('Space');await expect(note).not.toHaveAttribute('open','');
  await model.screenshot({path:`../ui-headings-evidence-20261006/gate-note-${width}.png`});
  await page.goto(`/ko/airport-countries?mode=zones&date=${date}&building=T2`);
  await countries.scrollIntoViewIfNeeded();
  const countryNote=countries.getByTestId('country-unverified-details');
  await expect(countryNote).toHaveAttribute('data-total','3');
  const total=await countries.locator('[data-total]').evaluateAll(nodes=>nodes.reduce((sum,node)=>sum+Number(node.getAttribute('data-total')),0));
  expect(total).toBe(6);
  await expect(countries.locator('.airport-zone-country-grid h5').first()).toContainText('17%');
  await countryNote.locator('summary').click();
  const countryRow=countryNote.locator('li[data-country="JP"]');
  await expect(countryNote.locator('li')).toHaveCount(1);
  await expect(countryRow).toHaveAttribute('data-value','3');
  await expect(countryRow).toHaveAttribute('data-share','100');
  await expect(countryRow.locator(':scope > span').nth(1)).toHaveText('일본행');
  await expect(countryRow.locator('strong')).toHaveText('3편');
  await expect(countryRow.locator('small')).toHaveText('100%');
  expect(await countryRow.textContent()).toMatch(/일본행\s+3편\s+100%/);
  const alignment=await countryRow.evaluate(element=>{
   const name=element.children[1].getBoundingClientRect();
   const count=element.querySelector('strong')!.getBoundingClientRect();
   const share=element.querySelector('small')!.getBoundingClientRect();
   return {nameRight:name.right,countLeft:count.left,countRight:count.right,shareRight:share.right,countBottom:count.bottom,shareTop:share.top};
  });
  expect(alignment.nameRight).toBeLessThanOrEqual(alignment.countLeft+1);
  expect(Math.abs(alignment.countRight-alignment.shareRight)).toBeLessThanOrEqual(1);
  expect(alignment.shareTop).toBeGreaterThanOrEqual(alignment.countBottom);
  await countryNote.locator('summary').click();
  await countries.screenshot({path:`../ui-headings-evidence-20261006/country-headings-${width}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });

 test(`retired Seoul entry: forecast plot size and exact source bounds ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const langCode = 'ko';
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/myeongdong?date=2026-08-31`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});
}
