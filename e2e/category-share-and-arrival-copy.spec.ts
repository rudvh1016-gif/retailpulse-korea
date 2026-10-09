import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';
const titles={ko:'시간대별 예상 입국객',en:'Expected arrivals by hour',zh:'分时段预计入境旅客',ja:'時間帯別の予想入国旅客'};
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`category share stays adjacent and arrival copy retains its basis ${lang}/${width}`,async({page})=>{
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
 const panel=page.getByTestId('commercial-composition'),odd=panel.locator('.commercial-miniature-card[data-category="편의점"]');
 await expect(odd.locator('.commercial-share')).toHaveText('29%');
 const positions=await odd.evaluate(el=>{const name=el.querySelector('.commercial-short-name')!.getBoundingClientRect(),share=el.querySelector('.commercial-share')!.getBoundingClientRect();return {gap:share.left-name.right,dy:Math.abs(share.top-name.top)}});
 expect(positions.gap).toBeGreaterThanOrEqual(0);expect(positions.gap).toBeLessThanOrEqual(9);expect(positions.dy).toBeLessThan(5);
 const half=panel.locator('.commercial-miniature-card[data-category="기타요식"]');expect((await half.locator('.commercial-share').boundingBox())!.y).toBeGreaterThan((await half.locator('.commercial-short-name').boundingBox())!.y);
 await odd.focus();await page.keyboard.press('Enter');await expect(odd).toHaveAttribute('aria-pressed','true');await expect(panel.locator('.commercial-selected')).toContainText('290');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(lang==='ko'&&width===390)await panel.screenshot({path:'../outputs/seoul-flow-blender-20261009/category-share-adjacent-390.png'});
 await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.getByRole('button',{name:lang==='ko'?'입국':lang==='en'?'ARRIVALS':lang==='zh'?'入境':'入国',exact:true}).click();
 await expect(page.locator('#airport-arrival-flow-title')).toHaveText(titles[lang]);
 await expect(page.locator('.airport-arrival-lines')).not.toContainText('서울로 이동하는 인원 수가 아닙니다');
 await expect(page.locator('.airport-arrival-lines')).toContainText('09:05');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});