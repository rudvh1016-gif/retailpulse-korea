import {test,expect,type Locator,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import {SUMMARY_FIXTURE} from './summary-fixture';
import {recordsFixture} from './monthly-records-fixture';
import type {RecordArea} from '../lib/monthly-records';

// CI-only browser coverage. Inputs are fixtures; no provider traffic or writes.
async function blockOtherApis(page:Page){
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.emulateMedia({reducedMotion:'reduce'});
}
async function boundary(node:Locator,margin:number,padding:number){
 await expect(node).toBeVisible();
 const style=await node.evaluate(element=>{
  const css=getComputedStyle(element);
  return {margin:parseFloat(css.marginTop),padding:parseFloat(css.paddingTop),width:css.borderTopWidth,color:css.borderTopColor,style:css.borderTopStyle};
 });
 expect(style).toEqual({margin,padding,width:'1px',color:'rgb(213, 217, 222)',style:'solid'});
}
async function noOverflow(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

for(const lang of ['ko','en','zh','ja'])for(const width of [360,390,1280]){
 test(`airport content boundaries stay thin and compact ${lang} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await blockOtherApis(page);
  await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
  for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
  await page.goto(lang==='ko'?'/ko/airport-countries?mode=zones&date=2026-10-19&building=all':`/${lang}/airport?date=2026-10-19`);
  const month=page.getByTestId('airport-month-flights');
  await month.scrollIntoViewIfNeeded();await boundary(month,12,12);
  const countries=month.getByTestId('destination-daily-changes');
  await boundary(countries,12,12);
  await boundary(month.locator(':scope > .airport-country-changes + .airport-month-table'),0,8);
  const count=await countries.locator(':scope > ul > li').count();expect(count).toBeGreaterThan(0);
  expect(await countries.evaluate(element=>getComputedStyle(element).marginBottom)).toBe('16px');
  // Per-country rows retain their previous rule, rather than inheriting another new line.
  await expect(countries.locator(':scope > ul > li').first()).toHaveCSS('border-top-color','rgb(221, 221, 221)');
  await noOverflow(page);
 });

 test(`Seoul and More preserve layout and disclosure boundaries ${lang} ${width}`,async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width,height:1000});await blockOtherApis(page);
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00Z'));
  await page.route('**/api/live/summary*',route=>{
   const url=new URL(route.request().url());
   const json=url.searchParams.get('view')==='records'
    ?recordsFixture((url.searchParams.get('area')??'myeongdong') as RecordArea,url.searchParams.get('month')??'2026-10')
    :{...SUMMARY_FIXTURE,generatedAt:'2026-10-06T10:00:00Z',todayKst:'2026-10-06',serviceDateKst:'2026-10-06'};
   return route.fulfill({json});
  });
  await page.goto(`/${lang}/where-to`);
  await expect(page.locator('.district-choice')).toHaveCount(4);
  await expect(page.locator('.district-glance-section')).toHaveCount(12);
  for(const section of await page.locator('.district-glance-section').all())await boundary(section,12,8);
  const columns=await page.locator('.district-choice-grid').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(width<=960?2:4);await noOverflow(page);

  await page.goto(`/${lang}/forecast`);
  await expect(page.getByTestId('monthly-records-result')).toBeVisible();
  await boundary(page.locator('.records-chart'),12,12);
  await expect(page.getByTestId('record-month-2026-10')).toContainText('27,000–29,000');
  await noOverflow(page);

  await page.goto(`/${lang}/more`);
  const guide=page.locator('.site-usage-guide'),method=guide.locator(':scope > h3');
  await boundary(guide,14,13);
  const examples=guide.getByTestId('usage-examples');
  if(width>=1000){await expect(examples).toHaveAttribute('open','');await expect(method).toHaveCSS('border-top-width','0px');await expect(method).toHaveCSS('padding-top','0px');await expect(method).toHaveCSS('margin-top','26px');await examples.locator('summary').click();}
  else await expect(examples).not.toHaveAttribute('open','');
  await boundary(method,13,12);
  await examples.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(examples).toHaveAttribute('open','');
  await expect(examples.locator('dl')).toHaveCSS('border-bottom-width','1px');
  await expect(method).toHaveCSS('border-top-width','0px');
  await expect(method).toHaveCSS('padding-top','0px');
  await expect(method).toHaveCSS('margin-top','26px');
  await examples.locator('summary').click();await boundary(method,13,12);
  const methodology=guide.getByTestId('usage-method');
  if(width>=1000){await expect(methodology).toHaveAttribute('open','');await methodology.locator('summary').click();}
  await methodology.locator('summary').click();await expect(methodology).toHaveAttribute('open','');
  await methodology.locator('summary').click();await expect(methodology).not.toHaveAttribute('open','');
  await expect(guide.locator('.site-usage-limit')).toBeVisible();await noOverflow(page);
 });
}
