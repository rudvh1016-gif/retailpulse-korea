import {test,expect,type Locator} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';

async function expectWhiteGround(target:Locator){
 const layers=await target.evaluate(element=>{
  const result:{background:string,image:string}[]=[];
  for(let node:Element|null=element;node;node=node.parentElement){const style=getComputedStyle(node);result.push({background:style.backgroundColor,image:style.backgroundImage});}
  return result;
 });
 expect(layers.every(layer=>['rgba(0, 0, 0, 0)','rgb(255, 255, 255)'].includes(layer.background))).toBe(true);
 expect(layers.every(layer=>layer.image==='none')).toBe(true);
 expect(layers.some(layer=>layer.background==='rgb(255, 255, 255)')).toBe(true);
}
for(const width of [390,1280])test(`white airport ground and restrained action surfaces ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights:[],truncated:false}}));
 await page.route('**/api/airport/facilities*',route=>route.fulfill({json:{mode:'airport-facilities',facilities:[],hasMore:false}}));
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const tabs=page.locator('#airport-data-flow button');
 for(const tab of await tabs.all())await expect(tab).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await tabs.nth(2).click();await expect(tabs.nth(2)).toHaveAttribute('aria-selected','true');
 await expect(tabs.nth(2)).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(tabs.nth(2)).toHaveCSS('border-bottom-width','1px');
 const guide=page.getByTestId('departure-preparation').locator(':scope > summary');
 await expect(guide).toHaveCSS('background-color','rgba(255, 255, 255, 0.72)');
 await expect(page.locator('.date-nav-shortcuts button[aria-pressed=true]')).toHaveCSS('background-color','rgba(255, 255, 255, 0.72)');
 await expect(page.getByTestId('date-calendar-trigger')).toHaveCount(0);
 await expectWhiteGround(page.locator('.airport-view .view-intro'));
 const sections=page.locator('.airport-context-nav button');
 for(const [index,selector] of [[1,'.airport-arrival-brief'],[2,'.flight-board'],[3,'.airport-facilities'],[4,'.airport-history']] as const){
  await sections.nth(index).click();await expect(page.locator(selector)).toBeVisible();await expectWhiteGround(page.locator(selector));
  if(index===3){await expectWhiteGround(page.locator('.facility-search input'));for(const filter of await page.locator('.facility-filter-row').all())await expectWhiteGround(filter);}
  await page.screenshot({path:info.outputPath(`airport-white-${index}-${width}.png`)});
 }
 await expect(page.locator('.airport-history .history-bars i').first()).not.toHaveCSS('background-image','none');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
