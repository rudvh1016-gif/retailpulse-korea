import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {NOTICE_WEEK_MS,UPDATE_NOTICE_SESSION_KEY,UPDATE_NOTICE_UNTIL_KEY} from '../lib/update-notice-preference';
test.use({storageState:{cookies:[],origins:[]}});
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('koretail-analytics-consent-v1','false');});
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,r=>r.abort());
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'test unavailable'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 const base={operationId:'',month:'2026-07',retrievedAt:SUMMARY_FIXTURE.generatedAt};
 await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:{status:'READY',month:'2026-07',previousMonth:null,current:{ROUTE_COUNTRY_PASSENGERS:{...base,operationId:'ROUTE_COUNTRY_PASSENGERS',rows:[{label:'일본',region:'일본',departures:31000,arrivals:0,total:null,aggregate:false,startHour:null,endHour:null}]},TIME_BAND_PASSENGERS:{...base,operationId:'TIME_BAND_PASSENGERS',rows:Array.from({length:24},(_,h)=>({label:String(h),region:null,departures:31000,arrivals:0,total:null,aggregate:false,startHour:h,endHour:h+1}))}},previous:{}}}));
});
for(const [width,height]of [[1440,1000],[360,568],[390,844],[430,700],[390,500]])test(`first entry is immediate, compact and keyboard safe ${width}x${height}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});await page.goto('/ko');
 const dialog=page.getByRole('dialog',{name:'새로운 정보가 추가되었어요'});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button',{name:'공지 닫기'})).toBeFocused();await expect(dialog.locator('section')).toHaveCount(2);
 await expect(dialog.locator('img,svg,canvas')).toHaveCount(0);await expect(dialog.getByRole('link')).toHaveCount(2);
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow)).toBe('hidden');
 const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.width).toBeLessThanOrEqual(width);expect(box!.height).toBeLessThanOrEqual(height);
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'공지 닫기'})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.style.overflow)).not.toBe('hidden');
 await page.reload();await expect(dialog).not.toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),UPDATE_NOTICE_SESSION_KEY)).toBe('1');expect(errors).toEqual([]);
});
test('week hiding lasts exactly seven days across reload and another tab',async({page,context})=>{
 const now=new Date('2026-10-19T03:04:05.123+09:00');await page.clock.install({time:now});await page.clock.pauseAt(new Date(now.getTime()+1000));await page.goto('/ko');
 const clicked=await page.evaluate(()=>Date.now());
 await page.getByRole('button',{name:'일주일 동안 안 보기'}).click();
 const until=await page.evaluate(key=>localStorage.getItem(key),UPDATE_NOTICE_UNTIL_KEY);expect(Number(until)).toBe(clicked+NOTICE_WEEK_MS);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),UPDATE_NOTICE_SESSION_KEY)).toBeNull();await page.reload();await expect(page.getByRole('dialog')).not.toBeVisible();
 const other=await context.newPage();await other.goto('/ko');await expect(other.getByRole('dialog')).not.toBeVisible();await other.close();
 await page.clock.fastForward(NOTICE_WEEK_MS-1);await expect(page.getByRole('dialog')).not.toBeVisible();await page.clock.fastForward(1);await expect(page.getByRole('dialog')).toBeVisible();
});
for(const [link,id]of [['시간대별 비교 보기','airport-forecast-title'],['국가별 여객 보기','airport-route-passengers']])test(`shortcut closes and lands on the real section: ${id}`,async({page})=>{
 await page.goto('/ko');await page.getByRole('dialog').getByRole('link',{name:link}).click();await expect(page).toHaveURL(new RegExp('#'+id+'$'));await expect(page.getByRole('dialog')).not.toBeVisible();
 const target=page.locator('#'+id);await expect(target).toBeInViewport();await expect.poll(async()=>target.evaluate(e=>{const y=e.getBoundingClientRect().top;return y>=0&&y<innerHeight;})).toBe(true);
});
test('blocked storage still permits close without errors or new permissions',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('blocked','SecurityError');}});});
 await page.goto('/ko');await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'닫기',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.style.overflow)).not.toBe('hidden');expect(errors).toEqual([]);
});
