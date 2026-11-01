import {expect,test,type Locator,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {AIRPORT_MONTH_VERSION,buildAirportFlightMonth,type AirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';

type Lang='ko'|'en'|'zh'|'ja';
const serviceDay='2026-10-11';
const longAirlineName='Pakistan International Airlines';
const summary={...SUMMARY_FIXTURE,todayKst:serviceDay,serviceDateKst:serviceDay,generatedAt:serviceDay+'T01:00:00Z',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:serviceDay}};
const row=(day:string,id:string,operatingFlight:string,airportCode='NRT',gate='274'):MonthFlightRow=>({physicalFlightId:id,terminal:'T2',gate,operatingFlight,airportCode,status:'scheduled',scheduledAt:day+'T09:00:00+09:00',retrievedAt:day+'T01:00:00Z'});

function preparedMonth(month:string,count:number,includeRareAirline=false){
 const dates=Array.from({length:count},(_,index)=>`${month}-${String(index+1).padStart(2,'0')}`);
 const rows:MonthFlightRow[]=[];
 for(const [index,day] of dates.entries()){
  const gate=['274','249','231'][index%3];
  rows.push(row(day,day+'-jp','KE703','NRT',gate),row(day,day+'-cn','CA123','PEK',gate),row(day,day+'-us','AA123','LAX',gate));
  if(month==='2026-09'){
   if(index%2===0)rows.push(row(day,day+'-jp-extra','KE705','NRT',gate));
   rows.push(row(day,day+'-cn-extra','CA125','PEK',gate));
   if(index%3===0)rows.push(row(day,day+'-us-extra','AA125','LAX',gate));
  }else{
   rows.push(row(day,day+'-jp-extra','KE705','NRT',gate));
   if(index===0)rows.push(row(day,day+'-jp-extra-2','KE707','NRT',gate));
   if(index%2===0)rows.push(row(day,day+'-cn-extra','CA125','PEK',gate));
  }
 }
 rows.push(row(dates[0],month+'-long-name','PK101'));
 if(includeRareAirline)rows.push(row(dates[0],month+'-rare-airline','LX123'));
 const result=buildAirportFlightMonth(month,serviceDay,rows,new Set(dates));
 result.airlineNames.PK=longAirlineName;
 return result;
}

const previous=preparedMonth('2026-09',30),current=preparedMonth('2026-10',10);
const reply=(now:AirportFlightMonth=current,before:AirportFlightMonth=previous)=>({status:'READY',month:now.month,months:['2026-10','2026-09'],calculatedAt:serviceDay+'T01:00:00Z',data:{version:AIRPORT_MONTH_VERSION,asOf:serviceDay,sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,months:[now,before]}});

async function openMonthly(page:Page,lang:Lang,width:number,payload=reply()){
 await page.setViewportSize({width,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',routeSummary(summary));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:payload}));
 await page.goto((lang==='ko'||lang==='zh'||lang==='en')?`/${lang}/airport-countries?mode=zones&date=${serviceDay}&building=T2`:`/${lang}/airport`,{waitUntil:'domcontentloaded'});
 const section=page.getByTestId('airport-month-flights');
 await section.scrollIntoViewIfNeeded();
 await expect(section.getByTestId('airport-month-basis')).toContainText('2026');
 await page.evaluate(()=>document.fonts.ready);
 return section;
}

/** Text must fit its own column; checking page width alone misses text painted over a neighbour. */
async function expectContainedNumbers(table:Locator){
 const cells=await table.locator('thead th:not(:first-child),tbody td').evaluateAll(nodes=>nodes.map(cell=>{
  const range=document.createRange();range.selectNodeContents(cell);
  const box=cell.getBoundingClientRect(),text=range.getBoundingClientRect(),style=getComputedStyle(cell);
  const lines=new Set(Array.from(range.getClientRects(),rect=>Math.round(rect.top)));
  return {compact:innerWidth<=600,zone:!!cell.closest('[data-testid="airport-month-zones"]'),header:cell.tagName==='TH',column:(cell as HTMLTableCellElement).cellIndex,value:cell.textContent,whiteSpace:style.whiteSpace,fontSize:Number.parseFloat(style.fontSize),left:text.left-box.left,right:box.right-text.right,lines:lines.size};
 }));
 for(const cell of cells){
  expect(cell.whiteSpace,JSON.stringify(cell)).toBe('nowrap');
  expect(cell.lines,JSON.stringify(cell)).toBe(1);
  expect(cell.left,JSON.stringify(cell)).toBeGreaterThanOrEqual(-1);
  expect(cell.right,JSON.stringify(cell)).toBeGreaterThanOrEqual(-1);
  // Owner-approved phone hierarchy: quiet month headers, baseline, then current/rate.
  if(cell.compact)expect(cell.fontSize,JSON.stringify(cell)).toBe(cell.zone?(cell.header?11:cell.column===1?12:13):12);
  else expect(cell.fontSize,JSON.stringify(cell)).toBeGreaterThanOrEqual(13);
 }
 expect(await table.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
}

const cases:Array<{lang:Lang;width:number}>=[
 ...(['ko','en','zh','ja'] as const).flatMap(lang=>[320,390].map(width=>({lang,width}))),
 ...[360,430,1280].map(width=>({lang:'ko' as const,width})),
];
for(const {lang,width} of cases)test(`compact monthly country cards and airline columns ${lang} ${width}`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const section=await openMonthly(page,lang,width);
 const monthLabels=lang==='ko'?['9월','10월']:lang==='en'?['Sep','Oct']:['9月','10月'];
 const basis=section.getByTestId('airport-month-basis');
 if(lang==='ko')await expect(basis).toHaveText('2026-09월 전체 수집분 일평균 / 2026-10월-10일 MTD 일평균');

 const zones=section.getByTestId('airport-month-zones');
 await expect(zones.locator('h4')).toBeVisible();
 await expect(zones.locator('caption')).toContainText('2026');
 await expect(zones.locator('tbody tr')).toHaveCount(4);
 await expectContainedNumbers(zones.locator('table'));
 expect(await zones.locator('h4').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(34, 35, 38)');
 for(const disclosure of await section.locator(':scope > details').all()) {
  const label=disclosure.locator(':scope > summary');
  expect(await label.evaluate(el=>Number(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);
  expect(await label.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(34, 35, 38)');
  await label.focus();await page.keyboard.press('Enter');await expect(disclosure).toHaveAttribute('open','');
  expect(await label.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(34, 35, 38)');
  await page.keyboard.press('Space');await expect(disclosure).not.toHaveAttribute('open','');
 }
 if(width===1280)expect(await zones.locator('table').evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(832);

 const countries=section.getByTestId('destination-daily-changes');
 const cards=countries.locator('li[data-country]');
 await expect(cards).toHaveCount(3);
 await expect(countries.locator('svg.airport-country-bars')).toHaveCount(0);
 const japan=countries.locator('[data-country="JP"]');
 // 46/30 and 22/10 are different denominators, not an equal-length month comparison.
 await expect(japan.locator('.airport-country-bar-row strong')).toHaveText(['1.5','2.2']);
 for(const card of await cards.all()){
  await expect(card.locator('.airport-country-bar-month')).toHaveText(monthLabels);
  await expect(card.locator('.airport-country-heading h5')).not.toBeEmpty();
  const flag=card.locator('.airport-country-heading img');
  await expect(flag).toHaveAttribute('alt','');
  await expect(flag).toHaveAttribute('width','24');
  await expect(flag).toHaveAttribute('height','24');
  await expect(card.locator('details')).not.toHaveAttribute('open','');
  const layout=await card.evaluate(element=>{
   const heading=element.querySelector('.airport-country-heading')!,name=heading.querySelector('h5')!.getBoundingClientRect(),rate=heading.querySelector(':scope > span')!.getBoundingClientRect();
   const zones=Array.from(element.querySelectorAll('.airport-country-side-rates > span'),node=>node.getBoundingClientRect().top);
   const bars=Array.from(element.querySelectorAll('.airport-country-bar-row'),bar=>{
    const label=bar.querySelector('.airport-country-bar-month')!.getBoundingClientRect(),track=bar.querySelector('.airport-country-bar-track')!.getBoundingClientRect(),value=bar.querySelector('strong')!.getBoundingClientRect();
    return {labelRight:label.right,trackLeft:track.left,trackRight:track.right,valueLeft:value.left,fontSize:Number.parseFloat(getComputedStyle(bar).fontSize)};
   });
   return {nameRight:name.right,rateLeft:rate.left,zones,bars};
  });
  expect(layout.nameRight).toBeLessThanOrEqual(layout.rateLeft+1);
  expect(Math.max(...layout.zones)-Math.min(...layout.zones)).toBeLessThanOrEqual(1);
  for(const bar of layout.bars){
   expect(bar.labelRight).toBeLessThanOrEqual(bar.trackLeft+1);
   expect(bar.trackRight).toBeLessThanOrEqual(bar.valueLeft+1);
   expect(bar.fontSize).toBeGreaterThanOrEqual(13);
  }
 }
 if(lang==='ko'&&width===360){
  const essentialSpan=await cards.evaluateAll(elements=>{
   const first=elements[0].querySelector('.airport-country-heading')!.getBoundingClientRect();
   const third=elements[2].querySelector('.airport-country-side-rates')!.getBoundingClientRect();
   return third.bottom-first.top;
  });
  // Three countries' headline, both months and zone changes fit one mobile reading area.
  expect(essentialSpan).toBeLessThanOrEqual(500);
  await countries.screenshot({path:info.outputPath('country-month-comparison-360.png')});
 }

 const airlines=section.getByTestId('month-list-airlines');
 await airlines.locator('summary').focus();await page.keyboard.press('Enter');
 await expect(airlines).toHaveAttribute('open','');
 const table=airlines.locator('table');
 await expect(table.locator('thead th').nth(1)).toHaveText(monthLabels[0]);
 await expect(table.locator('thead th').nth(2)).toHaveText(monthLabels[1]);
 await expect(table.locator('caption')).toContainText('2026');
 const longNameRow=table.locator('tbody tr').filter({hasText:longAirlineName});
 await expect(longNameRow).toHaveCount(1);
 await expect(longNameRow.locator('.airport-month-airline-code')).toHaveText('PK');
 const nameFits=await longNameRow.locator('th').evaluate(cell=>{
  const box=cell.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(cell);
  return Array.from(range.getClientRects()).every(rect=>rect.left>=box.left-1&&rect.right<=box.right+1);
 });
 expect(nameFits).toBe(true);
 await expectContainedNumbers(table);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});

test('a small previous daily mean keeps the full large growth rate inside the 320px airline table',async({page})=>{
 const before=preparedMonth('2026-09',30,true);
 // Both months use the real aggregator. The earlier month's LX category has one
 // retained flight across 30 included dates: 100 / (1/30) - 1.
 const day='2026-10-01';
 const now=buildAirportFlightMonth('2026-10',serviceDay,Array.from({length:100},(_,index)=>row(day,'rare-'+index,'LX123')),new Set([day]));
 const section=await openMonthly(page,'ko',320,reply(now,before));
 await expect(section.getByTestId('airport-month-basis')).toContainText('(1/10일)');
 const airlines=section.getByTestId('month-list-airlines');
 await airlines.locator('summary').click();
 const table=airlines.locator('table');
 const rareRow=table.locator('tbody tr').filter({has:page.locator('.airport-month-airline-code',{hasText:/^LX$/})});
 await expect(rareRow.locator('td').last()).toHaveText('+299900%');
 await expectContainedNumbers(table);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

