import { expect, test } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { airportSides } from '../lib/airport-sides-summary';
import { compareCopy } from '../lib/compare-copy';

test.use({hasTouch:true});

const date='2026-08-31';
const base={terminal:'T2',direction:'departure',scheduledAt:`${date}T09:00:00+09:00`,retrievedAt:`${date}T03:00:00Z`,status:'scheduled',airportCode:'NRT'};
const known=['208','252','279'].map((gate,i)=>({...base,gate,physicalFlightId:`known-${i}`,flightNumber:`TEST${i}`}));
const unknown=Array.from({length:3},(_,i)=>({...base,gate:null,physicalFlightId:`unknown-${i}`,flightNumber:`UNKNOWN${i}`}));

for(const width of [320,390,430,1280]) {
 test(`compact comparison and device notes ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/usual*',route=>route.fulfill({status:503,json:{error:'usual_comparison_unavailable'}}));
  await page.goto('/ko/business');
  const comparison=page.getByTestId('usual-comparison'),last=page.getByTestId('last-check');
  await expect(comparison.locator('summary')).toContainText(compareCopy.loadFailed.ko);
  await expect(comparison.getByText(compareCopy.unavailable.ko,{exact:true})).not.toBeVisible();
  await expect(last.getByText(compareCopy.deviceOnly.ko,{exact:true})).not.toBeVisible();
  const trigger=comparison.locator(':scope > summary');
  await expect(trigger.locator('[aria-hidden]')).toHaveCSS('margin-left','8px');
  expect(await trigger.locator('[aria-hidden]').evaluate(el=>getComputedStyle(el,'::after').content)).toBe('"+"');
  await trigger.focus();await page.keyboard.press('Enter');
  await expect(trigger).toHaveCSS('outline-style','solid');
  expect(await trigger.locator('[aria-hidden]').evaluate(el=>getComputedStyle(el,'::after').content)).toBe('"−"');
  await expect(comparison.getByText(compareCopy.unavailable.ko,{exact:true})).toBeVisible();
  await page.keyboard.press('Space');await expect(comparison).not.toHaveAttribute('open','');
  await expect(trigger).toBeFocused();
  expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.reload();
  await expect(last.getByTestId('last-check-headline')).toContainText('달라진 공식 값은 없습니다');
  await expect(last.getByTestId('last-check-headline')).not.toBeVisible();
  await last.locator('summary').tap();
  await expect(last.getByText(compareCopy.deviceOnly.ko,{exact:true})).toBeVisible();
  await last.locator('summary').click();
  await last.scrollIntoViewIfNeeded();
  await page.screenshot({path:`../ui-headings-evidence-20261006/status-closed-${width}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
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
  const countries=page.getByTestId('map-zone-countries');
  await countries.scrollIntoViewIfNeeded();
  await expect(countries.locator('h5')).toHaveCount(3);
  for(const heading of await countries.locator('h5').all()) {
   await expect(heading).toHaveCSS('font-weight','600');
   await expect(heading).toHaveCSS('color','rgb(0, 0, 0)');
  }
  await expect(countries.getByTestId('country-unverified-details')).toHaveCount(0);
  records=[...known,...unknown];await page.reload();
  await model.scrollIntoViewIfNeeded();
  const note=model.getByTestId('gate-unverified-details');
  await expect(note.locator('summary')).toHaveText('※ 위치 미확인 3편');
  await expect(note.locator('li').first()).not.toBeVisible();
  await note.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(note.locator('li')).toHaveCount(3);
  await expect(note.locator('li').first()).toContainText('UNKNOWN0');
  await page.keyboard.press('Space');await expect(note).not.toHaveAttribute('open','');
  await model.screenshot({path:`../ui-headings-evidence-20261006/gate-note-${width}.png`});
  await countries.scrollIntoViewIfNeeded();
  const countryNote=countries.getByTestId('country-unverified-details');
  await expect(countryNote).toHaveAttribute('data-total','3');
  const total=await countries.locator('[data-total]').evaluateAll(nodes=>nodes.reduce((sum,node)=>sum+Number(node.getAttribute('data-total')),0));
  expect(total).toBe(6);
  await expect(countries.locator('.airport-zone-country-grid h5').first()).toContainText('16.7%');
  await countryNote.locator('summary').click();
  await expect(countryNote.locator('li')).toContainText('3편 · 100.0%');
  await countryNote.locator('summary').click();
  await countries.screenshot({path:`../ui-headings-evidence-20261006/country-headings-${width}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });

 test(`forecast plot size and exact source bounds ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.clock.install({time:new Date('2026-08-31T05:10:00Z')});
  const observation=(time:string,min=23_000,max=25_000)=>({observedAt:`${date}T${time}:00+09:00`,populationMin:min,populationMax:max,congestionLevel:3});
  const series=['12:10','12:25','13:07','13:22','13:37','13:52'].map(time=>observation(time));
  const forecasts=[17,18,19].map((hour,i)=>({targetAt:`${date}T${hour}:00:00+09:00`,issuedAt:`${date}T14:00:00+09:00`,populationMin:27_000+i*2_000,populationMax:29_000+i*2_000,congestionLevel:3}));
  const area={...SUMMARY_FIXTURE.areas.myeongdong,observedSeries:series,realtime:{...observation('14:07'),freshness:'LIVE'},realtimeForecast:forecasts};
  const summary={...SUMMARY_FIXTURE,areas:{...SUMMARY_FIXTURE.areas,myeongdong:area,itaewon:area}};
  await page.route('**/api/live/summary*',routeSummary(summary));
  await page.route('**/api/live/predictions*',route=>route.fulfill({json:{targetDate:date,run:null,coverage:{days:0,firstAt:null,latestAt:null,missingDays:[],dailyHours:[]},records:[]}}));
  await page.goto('/ko/itaewon');
  const outlook=page.getByTestId('population-outlook'),plot=outlook.locator('svg');
  await outlook.scrollIntoViewIfNeeded();
  await expect(outlook).toBeVisible();
  await expect.poll(()=>plot.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(280);
  const geometry=await plot.evaluate(el=>{
   const svg=el as SVGSVGElement,line=el.querySelector('[data-selected-range]')!;
   return {width:svg.viewBox.baseVal.width,height:svg.viewBox.baseVal.height,renderedWidth:el.getBoundingClientRect().width,ceiling:Number(el.getAttribute('data-ceiling')),y1:Number(line.getAttribute('y1')),y2:Number(line.getAttribute('y2'))};
  });
  expect(geometry.height).toBe(292);expect(Math.abs(geometry.width-geometry.renderedWidth)).toBeLessThan(2);
  expect(geometry.y1).toBeCloseTo(244-29_000/geometry.ceiling*212,3);
  expect(geometry.y2).toBeCloseTo(244-27_000/geometry.ceiling*212,3);
  await outlook.getByRole('button').nth(1).click();await expect(outlook.locator('.outlook-selection')).toContainText('29,000–31,000');
  await outlook.screenshot({path:`../ui-headings-evidence-20261006/outlook-large-${width}.png`});
  await page.locator('.population-history-disclosure > summary').click();
  const history=page.locator('.population-history-disclosure .population-chart');
  await expect.poll(()=>history.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(280);
  const fullWidth=await history.evaluate(el=>el.getBoundingClientRect().width);
  expect(Math.abs(fullWidth-geometry.renderedWidth)).toBeLessThan(35);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
