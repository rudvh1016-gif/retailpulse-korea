import {noticeDismissedState} from '../scripts/update-notice-test-state.mjs';
import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';
const categories=['여행','한식','화장품','편의점','약국'];
const rows=(month:string)=>[{observed_at:`${month}-01T10:10:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-01T10:10:00+09:00`,categories:categories.map((category,i)=>({category,group:'fixture',payments:i===0?null:i===1?0:i===4?20:30,amountMin:100,amountMax:200}))})}];
const month=publicCommercialMonth(compareCommercialMonths(buildCommercialMonth(rows('2026-08'),'2026-08','2026-08-30'),buildCommercialMonth(rows('2026-07'),'2026-07','2026-07-31')));
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`sharp icons and standalone airport news entry ${lang} ${width}`,async({browser})=>{
 const context=await browser.newContext({storageState:noticeDismissedState(test.info().project.use.baseURL),viewport:{width,height:900},deviceScaleFactor:3,reducedMotion:'reduce'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
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
 const travel=page.getByTestId('airport-customs-news-entry');await travel.scrollIntoViewIfNeeded();
 await expect(page.getByTestId('departure-guide-entry')).toHaveCount(0);expect((await travel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await travel.focus();await expect(travel).toBeFocused();await expect(travel).toHaveAttribute('href',`/${lang}/airport-news`);
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
 const periodDetails=page.locator('.consumption-comparison > .comparison-details');await expect(periodDetails).not.toHaveAttribute('open','');
 await periodDetails.locator(':scope > summary').click();await expect(periodDetails).toHaveAttribute('open','');await expect(page.getByTestId('consumption-period')).toBeVisible();
 for(const date of ['2026-07-01','2026-07-30','2026-08-01','2026-08-30'])await expect(page.getByTestId('consumption-period')).toContainText(date);
 await periodDetails.locator(':scope > summary').click();
 const card=page.locator('.consumption-category[data-category="한식"]');
 await expect(card.locator('.consumption-mean-label').first()).toHaveText('10분 관측값 평균 · 일평균 아님');
 await expect(card.locator('.consumption-mean-label').nth(1)).toContainText('최근 관측시각');
 await expect(card.locator('.consumption-mean-label').nth(1)).toContainText('단일 10분 구간 아님');
 await expect(card.locator('.consumption-mean')).toHaveText('7월 0건 → 8월 0건');
 const details=card.locator('details');await expect(details).toHaveCount(1);await expect(details).not.toHaveAttribute('open','');
 await card.getByText('날짜·시간대와 계산 기준',{exact:true}).click();await expect(details).toHaveAttribute('open','');
 await expect(details).toContainText('공통 날짜 1 · 날짜×시간대 1');
 await expect(card).toContainText('2026-07-01');await expect(card).toContainText('2026-08-01');
 await expect(details).toContainText('2026-07-01 / 2026-08-01: 10시대');
 await expect(details).toContainText('평균에 포함한 결제값 관측 수: 2026-07 1 → 2026-08 1');
 await expect(details).toContainText('시간대 안의 10분 결제값을 먼저 평균낸 뒤, 양월 공통 날짜×시간대의 평균을 같은 비중으로 비교합니다.');
 await page.getByRole('tab',{name:'홍대',exact:true}).click();
 await expect(card).toBeVisible();if(await details.getAttribute('open')===null)await card.getByText('날짜·시간대와 계산 기준',{exact:true}).click();
 await expect(details).toContainText('보존된 집계에서 정확한 포함 날짜·시간대 목록은 확인되지 않습니다.');
 await expect(details).toContainText('공통 날짜 1 · 날짜×시간대 1');
});
