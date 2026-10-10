import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';
const categories=['여행','한식','화장품','편의점','약국'];
const rows=(month:string)=>[{observed_at:`${month}-01T10:10:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-01T10:10:00+09:00`,categories:categories.map((category,i)=>({category,group:'fixture',payments:i===0?null:i===1?0:i===4?20:30,amountMin:100,amountMax:200}))})}];
const month=publicCommercialMonth(compareCommercialMonths(buildCommercialMonth(rows('2026-08'),'2026-08','2026-08-30'),buildCommercialMonth(rows('2026-07'),'2026-07','2026-07-31')));
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`sharp icons and equal airport entries ${lang} ${width}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:3,reducedMotion:'reduce'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/commercial-months*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{status:'READY',area:url.searchParams.get('area'),month:url.searchParams.get('month'),months:['2026-08','2026-07'],data:month}});});
 await page.goto('/'+lang+'/consumption');
 for(const name of ['명동','성수','홍대','이태원'].map((ko,i)=>({ko,en:['Myeongdong','Seongsu','Hongdae','Itaewon'][i],zh:['明洞','圣水','弘大','梨泰院'][i],ja:['明洞','聖水','弘大','梨泰院'][i]})[lang])){
  await page.getByRole('tab',{name,exact:true}).click();await expect(page.locator('.consumption-category')).toHaveCount(5);
  await expect.poll(()=>page.locator('.consumption-category').evaluateAll(els=>els.map(el=>el.getAttribute('data-category')))).toEqual(['편의점','화장품','약국','한식','여행']);
 }
 const image=page.locator('.consumption-category>img').first();await image.scrollIntoViewIfNeeded();
 await expect.poll(()=>image.evaluate(im=>(im as HTMLImageElement).currentSrc)).toContain('/sharp-v1/');
 const resolution=await image.evaluate(async element=>{const im=element as HTMLImageElement,source=new Image();source.src=im.currentSrc;await source.decode();const css=getComputedStyle(im);return {pixels:source.naturalWidth,required:im.getBoundingClientRect().width*devicePixelRatio,filter:css.filter,opacity:css.opacity,transform:css.transform};});
 expect(resolution.pixels).toBeGreaterThanOrEqual(resolution.required);expect(resolution).toMatchObject({filter:'none',opacity:'1',transform:'none'});
 await page.goto('/'+lang+'/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const guide=page.getByTestId('departure-guide-entry'),travel=page.getByTestId('airport-customs-news-entry');await guide.scrollIntoViewIfNeeded();
 const a=await guide.boundingBox(),b=await travel.boundingBox();expect(Math.abs(a!.width-b!.width)).toBeLessThan(1);expect(a!.height).toBe(b!.height);expect(a!.y).toBe(b!.y);expect(a!.height).toBeGreaterThanOrEqual(44);
 expect(await guide.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await travel.evaluate(el=>getComputedStyle(el).backgroundColor));
 await guide.focus();await page.keyboard.press('Enter');await expect(page.locator('details').filter({has:guide})).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await context.close();
});
test('01xx current interval is shown separately from next, and published zero survives',async({page})=>{
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;data.generatedAt='2026-10-09T16:02:00Z';data.todayKst=data.serviceDateKst='2026-10-10';data.dayRelation='TODAY';
 data.airport.passengerForecastTimelineByTerminal={T2:[{targetStartAt:'2026-10-10T01:00:00+09:00',targetEndAt:'2026-10-10T02:00:00+09:00',expectedPassengers:0},{targetStartAt:'2026-10-10T02:00:00+09:00',targetEndAt:'2026-10-10T03:00:00+09:00',expectedPassengers:4}]};
 await page.clock.setFixedTime(new Date(data.generatedAt));await page.route('**/api/live/summary*',routeSummary(data));await page.goto('/ko/airport');const card=page.locator('.terminal-brief-card[data-terminal="T2"]');await expect(card.locator('[data-metric="current"]')).toContainText('01:00–02:00');await expect(card.locator('[data-metric="current"]')).toContainText('0명');await expect(card.locator('[data-metric="next"]')).toContainText('02:00–03:00');
});

test('consumption means name the observed window unit, common bins and retained dates',async({page})=>{
 const legacy=structuredClone(month);for(const row of legacy.categories)delete row.comparison.coverage;
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/commercial-months*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{status:'READY',area:url.searchParams.get('area'),month:url.searchParams.get('month'),months:['2026-08','2026-07'],data:url.searchParams.get('area')==='hongdae'?legacy:month}});});
 await page.goto('/ko/consumption');
 for(const date of ['2026-07-01','2026-07-30','2026-08-01','2026-08-30'])await expect(page.getByTestId('consumption-period')).toContainText(date);
 const card=page.locator('.consumption-category[data-category="한식"]');
 await expect(card).toContainText(/건\/관측\s*10분창/);
 await expect(card).toContainText(/1\s*개 날짜\s*·\s*1\s*개 시간 구간/);
 await card.getByText('포함 날짜·계산 기준',{exact:true}).click();
 await expect(card).toContainText('2026-07-01');await expect(card).toContainText('2026-08-01');
 await expect(card).toContainText('각 시간 안의 관측된 10분 결제값을 먼저 평균낸 뒤');
 await page.getByRole('tab',{name:'홍대',exact:true}).click();
 await expect(card).toBeVisible();if(await card.locator('details').getAttribute('open')===null)await card.getByText('포함 날짜·계산 기준',{exact:true}).click();
 await expect(card).toContainText('정확한 포함 날짜 목록은 보존된 집계에서 확인할 수 없습니다.');
});
