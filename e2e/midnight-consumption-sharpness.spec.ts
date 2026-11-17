import {noticeDismissedState} from '../scripts/update-notice-test-state.mjs';
import {holdPendingAirportStream} from './helpers/airport-stream-fixture';
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
 await expect(page).toHaveURL(url => url.pathname === '/'+lang);
 await expect(page.locator('.consumption-category')).toHaveCount(0);
 await page.goto('/'+lang+'/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 if(lang==='zh'&&width===390)await holdPendingAirportStream(page);
 const travel=page.locator('.app[data-hydrated="true"] main').getByTestId('airport-customs-news-entry');await expect(travel).toBeVisible();await travel.scrollIntoViewIfNeeded();
 await expect(page.getByTestId('departure-guide-entry')).toHaveCount(0);expect((await travel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await travel.focus();await expect(travel).toBeFocused();await expect(travel).toHaveAttribute('href',`/${lang}/airport-news`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await context.close();
});
test('01xx current interval is shown separately from next, and published zero survives',async({page})=>{
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;data.generatedAt='2026-10-09T16:02:00Z';data.todayKst=data.serviceDateKst='2026-10-10';data.dayRelation='TODAY';
 data.airport.passengerForecastTimelineByTerminal={T2:[{targetStartAt:'2026-10-10T01:00:00+09:00',targetEndAt:'2026-10-10T02:00:00+09:00',expectedPassengers:0},{targetStartAt:'2026-10-10T02:00:00+09:00',targetEndAt:'2026-10-10T03:00:00+09:00',expectedPassengers:4}]};
 await page.clock.setFixedTime(new Date(data.generatedAt));await page.route('**/api/live/summary*',routeSummary(data));await page.goto('/ko/airport');const card=page.locator('.terminal-brief-card[data-terminal="T2"]');await expect(card.locator('[data-metric="current"]')).toContainText('01:00 ~ 02:00');await expect(card.locator('[data-metric="current"]')).toContainText('0명');await expect(card.locator('[data-metric="next"]')).toContainText('02:00 ~ 03:00');
});

test('retired monthly consumption links cannot restore district controls', async ({page}) => {
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/consumption?area=hongdae&month=2026-08');
 await expect(page).toHaveURL(url => url.pathname === '/ko');
 await expect(page.locator('.consumption-comparison, .area-tabs')).toHaveCount(0);
});
