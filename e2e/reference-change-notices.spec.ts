import {test,expect} from '@playwright/test';
import {NOTICE_WEEK_MS,UPDATE_NOTICE_UNTIL_KEY} from '../lib/update-notice-preference';
// Synthetic collector outputs exercise notices only; never production date/allowance evidence.
const at='2026-10-20T00:00:00.000Z',hash='a'.repeat(64),baseline='b'.repeat(64);
const calendar={status:'VERIFIED',events:[],calendarReplacementScopes:[],checkedAt:at,changes:[{id:hash,country:'US',changedAt:at}],sources:[{country:'US',status:'VERIFIED',checkedAt:at,lastVerifiedAt:at}]};
const values={liquorBottles:3,liquorBottleMl:760,cigarettes:200,perfumeOunces:2};
const allowance={status:'STORED',countries:[{id:'JP',state:'NUMERIC_VERIFIED'}],japan:{previous:values,values:{...values,perfumeOunces:3},changedAt:at},reviewNotices:[{sourceId:'TW-01',country:'TW',sourceHash:hash,baselineHash:baseline,checkedAt:at}]};
test.use({storageState:{cookies:[],origins:[]}});
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('koretail-analytics-consent-v1','false'));
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,route=>route.abort());
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'unavailable test fixture'}}));
});
for(const width of [360,390,430,1440])test(`stored changes appear in the general notice without layout or focus regressions ${width}`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:width===360?568:844});
 let calendarReads=0,allowanceReads=0;
 await page.route('**/api/airport/calendar',route=>{calendarReads++;return route.fulfill({json:calendar});});
 await page.route('**/api/airport/allowance-status',route=>{allowanceReads++;return route.fulfill({json:allowance});});
 await page.goto('/ko/airport-focus-preview');const dialog=page.getByRole('dialog');
 await expect(dialog.locator('[data-change-id]')).toHaveCount(2);
 await expect(dialog).toContainText('미국 연방공무원');await expect(dialog).not.toContainText('검토 중');await expect(dialog).not.toContainText('대만 반입 면세');
 await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeInViewport({ratio:1});
 await expect(dialog.getByRole('button',{name:'일주일 동안 안 보기'})).toBeInViewport({ratio:1});
 await expect(dialog.locator('#update-notice-title')).toBeFocused();
 expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(dialog.locator('.reference-change-notices a').first()).toBeFocused();
 await page.screenshot({path:info.outputPath(`general-reference-notices-${width}.png`)});
 const ids=await dialog.locator('[data-change-id]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-change-id')));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(dialog.locator('[data-change-id]')).toHaveCount(2);
 expect(await dialog.locator('[data-change-id]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-change-id')))).toEqual(ids);
 expect(calendarReads).toBe(1);expect(allowanceReads).toBe(1);
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await page.reload();await expect(dialog).not.toBeVisible();
 expect(allowanceReads).toBe(1);expect(errors).toEqual([]);
});
test('new stored changes never bypass an existing one-week hide',async({page})=>{
 await page.clock.setFixedTime(new Date(at));let reads=0;
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:calendar}));
 await page.route('**/api/airport/allowance-status',route=>{reads++;return route.fulfill({json:allowance});});
 await page.goto('/ko/airport-focus-preview');await expect(page.locator('[data-change-id]')).toHaveCount(2);
 await page.getByRole('button',{name:'일주일 동안 안 보기'}).click();
 expect(Number(await page.evaluate(key=>localStorage.getItem(key),UPDATE_NOTICE_UNTIL_KEY))).toBe(Date.parse(at)+NOTICE_WEEK_MS);
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{...calendar,changes:[{country:'US',id:'c'.repeat(64),changedAt:at}]}}));
 await page.reload();await expect(page.getByRole('dialog')).not.toBeVisible();expect(reads).toBe(1);
});
test('missing and unchanged collector outputs do not create extra notice cards',async({page})=>{
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{...calendar,changes:[]}}));
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'STORED',countries:[],japan:{previous:values,values,changedAt:null},reviewNotices:[]}}));
 await page.goto('/ko/airport-focus-preview');await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.locator('[data-change-id]')).toHaveCount(0);await expect(page.getByRole('dialog').locator('.update-notice-items>section')).toHaveCount(2);
});
test('closing during an in-flight check does not reopen the dialog when data arrives',async({page})=>{
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/airport/calendar',async route=>{await gate;await route.fulfill({json:calendar});});
 await page.route('**/api/airport/allowance-status',async route=>{await gate;await route.fulfill({json:allowance});});
 await page.goto('/ko/airport-focus-preview');await page.getByRole('button',{name:'닫기',exact:true}).click();release();
 await expect(page.locator('[data-change-id]')).toHaveCount(2);await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('same-page week-hide expiry refreshes changes once without polling or a reload',async({page})=>{
 await page.clock.setFixedTime(new Date(at));let calendarReads=0,allowanceReads=0;
 let latest=calendar;
 await page.route('**/api/airport/calendar',route=>{calendarReads++;return route.fulfill({json:latest});});
 await page.route('**/api/airport/allowance-status',route=>{allowanceReads++;return route.fulfill({json:allowance});});
 await page.goto('/ko/airport-focus-preview');const dialog=page.getByRole('dialog');await expect(dialog.locator('[data-change-id]')).toHaveCount(2);
 await page.getByRole('button',{name:'일주일 동안 안 보기'}).click();await expect(dialog).not.toBeVisible();
 latest={...calendar,changes:[{country:'US',id:'c'.repeat(64),changedAt:new Date(Date.parse(at)+NOTICE_WEEK_MS).toISOString()}]};
 await page.clock.setFixedTime(new Date(Date.parse(at)+NOTICE_WEEK_MS-1));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(dialog).not.toBeVisible();expect(allowanceReads).toBe(1);
 await page.clock.setFixedTime(new Date(Date.parse(at)+NOTICE_WEEK_MS+1));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(dialog.locator(`[data-change-id="calendar:US:${'c'.repeat(64)}"]`)).toBeVisible();expect(calendarReads).toBe(2);expect(allowanceReads).toBe(2);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(dialog.locator('[data-change-id]')).toHaveCount(2);expect(calendarReads).toBe(2);expect(allowanceReads).toBe(2);
});

test('pending source reviews do not publish notice cards or resurrect older updates',async({page})=>{
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{...calendar,sources:[{...calendar.sources[0],status:'REVIEW_REQUIRED',reason:'CALENDAR_CANCELLATION_REVIEW'}]}}));
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{...allowance,countries:[{id:'JP',state:'REVIEW_REQUIRED'}],reviewNotices:[...allowance.reviewNotices,{sourceId:'SG-01',country:'SG',sourceHash:hash,baselineHash:baseline,checkedAt:at}]}}));
 await page.goto('/ko/airport-focus-preview');const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();await expect(dialog.locator('[data-change-id]')).toHaveCount(0);
 await expect(dialog).not.toContainText('검토 중');await expect(dialog).not.toContainText('최근 확인');
});
