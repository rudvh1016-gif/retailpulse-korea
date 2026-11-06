import {test,expect} from '@playwright/test';
import {analyticsOptOutState} from '../scripts/analytics-opt-out.mjs';
import {UPDATE_NOTICE_OPEN_EVENT} from '../lib/update-notice-preference';
import {clickPassengerNotice,expectPassengerNoticeLanding} from '../e2e/helpers/notice-passenger-journey';

test.use({storageState:analyticsOptOutState(process.env.PLAYWRIGHT_BASE_URL??'https://koretaildata.com'),hasTouch:true});
for(const width of [390,1440])test(`notice passenger journey · real click and visible results ${width}`,async({page},info)=>{
 test.setTimeout(120_000);await page.setViewportSize({width,height:width<600?844:900});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/ko');await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.locator('#update-notice-title')).toHaveCSS('color','rgb(128, 0, 32)');
 await clickPassengerNotice(page,width);const target=await expectPassengerNoticeLanding(page,info);
 const reply=await page.request.get('/api/live/airport-passenger-stats');expect(reply.ok()).toBe(true);
 const stats=await reply.json(),month=stats.current?.ROUTE_COUNTRY_PASSENGERS;
 expect(stats.status).toBe('READY');expect(month?.month).toMatch(/^\d{4}-\d{2}$/);
 await expect(target.locator('[data-month-selection="selected"]')).toHaveValue(month.month);
 const japan=month.rows.find((row:{label:string;aggregate:boolean})=>row.label==='일본'&&!row.aggregate);
 expect(Number.isSafeInteger(japan?.departures)).toBe(true);
 await expect(target.locator('tbody tr').filter({hasText:'일본'})).toContainText(new Intl.NumberFormat('ko-KR').format(japan.departures));
 await page.goBack();await expect(page).toHaveURL(url=>url.pathname==='/ko');await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.goForward();await expectPassengerNoticeLanding(page);
 await page.evaluate(event=>window.dispatchEvent(new Event(event)),UPDATE_NOTICE_OPEN_EVENT);
 await clickPassengerNotice(page,width);await expectPassengerNoticeLanding(page);
 await page.goto('/ko/more');await page.locator('.more-section-links').getByRole('button',{name:'공지사항 보기 ›',exact:true}).click();
 await clickPassengerNotice(page,width);await expectPassengerNoticeLanding(page,info);
 await info.attach(`notice-passenger-production-${width}.png`,{body:await page.screenshot(),contentType:'image/png'});
 expect(errors).toEqual([]);
});
