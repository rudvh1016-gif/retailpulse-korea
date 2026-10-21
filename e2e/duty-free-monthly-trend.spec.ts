import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {dutyFreeSources} from '../lib/duty-free-exchange';
const asOf='2026-10-21',at='2026-10-21T05:00:00Z';
const observation={vendor:'shilla',serviceDateKst:asOf,currency:'USD',krwPerUnit:1332.1,verifiedAt:at,sourceUrl:dutyFreeSources.shilla,scope:'INTERNET_SHOP',verified:true,dateEvidence:'CURRENT_WIDGET'};
const monthly={vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,asOfDateKst:asOf,generatedAt:at,
 months:['05','06','07','08','09','10'].map((month,index)=>({month:`2026-${month}`,averageKrwPerUsd:index===5?1332.1:null,observedDays:index===5?1:0,calendarDays:[31,30,31,31,30,31][index],inProgress:index===5}))};
for(const lang of ['ko','en','zh','ja'])for(const width of [360,1280])test(`FX monthly explicit-open sparse history and accessible readout ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date(at));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:asOf,flights:[],truncated:false,retrievedAt:null}}));
 await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:{mode:'duty-free-exchange',collectionMode:'AUTOMATED',generatedAt:at,todayKst:asOf,sources:[{vendor:'shilla',observation,lastAttemptAt:at,lastAttemptStatus:'SUCCESS',errorCode:null,nextAttemptAt:null}]}}));
 let reads=0;await page.route('**/api/live/duty-free-exchange/monthly',r=>{reads++;return r.fulfill({json:monthly});});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/${lang}/airport`);const strip=page.getByTestId('airport-duty-free-exchange');
 await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');expect(reads).toBe(0);
 await strip.locator('summary').click();expect(reads).toBe(0);
 const toggle=strip.locator('.duty-free-monthly-toggle');await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
 const chart=strip.locator('.duty-free-monthly-chart');await expect(chart.locator('li')).toHaveCount(6);
 await expect(chart.locator('circle')).toHaveCount(1); // A lone real point, never a fabricated six-month line.
 await expect(chart.locator('.duty-free-month-readout')).toContainText('1,332.10');
 const targets=chart.locator('.duty-free-month-target');await targets.first().focus();await expect(targets.first()).toBeFocused();
 await page.keyboard.press('End');await expect(targets.last()).toBeFocused();await expect(chart.locator('.duty-free-month-readout')).toContainText('2026-10');
 await page.keyboard.press('ArrowLeft');await expect(targets.nth(4)).toBeFocused();await expect(chart.locator('.duty-free-month-readout')).toContainText('2026-09');
 await targets.last().click();await expect(chart.locator('.duty-free-month-readout')).toContainText('1,332.10');
 await toggle.click();await toggle.click();await expect(chart).toBeVisible();expect(reads).toBe(1);
 expect(await chart.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(errors).toEqual([]);
 await expect(strip.getByTestId('duty-free-rate')).toContainText('1,332.10');
});
