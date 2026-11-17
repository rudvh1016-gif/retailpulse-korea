import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';
const titles={ko:'시간대별 예상 입국객',en:'Expected arrivals by hour',zh:'分时段预计入境旅客',ja:'時間帯別の予想入国旅客'};
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`retired category entry redirects and airport arrival copy retains its basis ${lang}/${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;
 for(const area of Object.values(data.areas))if(area)area.context={commercialAt:'2026-08-30T14:05:00+09:00',retrievedAt:data.generatedAt,weather:null,categories:[
  {group:'Dining',category:'기타요식',level:null,payments:387,amountMin:0,amountMax:100},
  {group:'Dining',category:'제과/커피/패스트푸드',level:null,payments:323,amountMin:0,amountMax:100},
  {group:'Retail',category:'편의점',level:null,payments:290,amountMin:0,amountMax:100},
 ]};
 await page.route('**/api/live/summary*',routeSummary(data));await page.route('**/api/live/flights*',r=>r.fulfill({json:{flights:[],count:0,serviceDateKst:data.serviceDateKst}}));
 await page.goto(`/${lang}/myeongdong`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page).toHaveURL(new RegExp(`/${lang}$`));
 await expect(page.getByTestId('commercial-composition')).toHaveCount(0);
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.getByRole('button',{name:lang==='ko'?'입국':lang==='en'?'ARRIVALS':lang==='zh'?'入境':'入国',exact:true}).click();
 await expect(page.locator('#airport-arrival-flow-title')).toHaveText(titles[lang]);
 await expect(page.locator('.airport-arrival-lines')).not.toContainText('서울로 이동하는 인원 수가 아닙니다');
 await expect(page.locator('.airport-arrival-lines')).toContainText('09:05');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});