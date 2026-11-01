import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import sides from '../config/airport-sides.v1.json' with {type:'json'};
const day='2026-10-10',at=day+'T01:00:00Z';
async function fixture(page:Page){
 const summary=structuredClone(SUMMARY_FIXTURE);Object.assign(summary,{generatedAt:at,todayKst:day,serviceDateKst:day});summary.airport.serviceDateKst=day;
 await page.clock.setFixedTime(new Date(at));await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 const flights=['WEST','CENTER','EAST'].flatMap(side=>{const gate=sides.gates.find(g=>g.area==='T2'&&g.side===side)?.gate;if(!gate)throw Error('Missing official gate fixture');return ['NRT','NRT','NRT','NRT','PVG','PVG','PVG','SFO','SFO','HAN'].map((airportCode,i)=>({physicalFlightId:`${side}-${i}`,flightNumber:'KE100',airlineCode:'KE',airportCode,direction:'departure',terminal:'T2',gate,scheduledAt:day+'T12:00:00+09:00',retrievedAt:at,status:'scheduled'}));});
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:day,basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:at,truncated:false,flights}}));
}
for(const lang of ['ko','en'])for(const width of [390,999,1000,1440]){
 test(`airport controls compact only on desktop ${lang} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await fixture(page);await page.goto(`/${lang}/airport?date=${day}`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const terminals=page.locator('.airport-view > .terminal-selector'),sections=page.locator('.airport-view > .airport-context-nav');await expect(terminals.locator('button')).toHaveCount(4);await expect(sections.locator('button')).toHaveCount(5);
  if(width>=1000){const boxes=await terminals.locator('button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,width:b.width,height:b.height,background:getComputedStyle(n).backgroundColor};}));for(const b of boxes){expect(b.width).toBe(96);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.background).toBe('rgba(0, 0, 0, 0)');}expect(boxes[1].x-boxes[0].x).toBe(116);const a=await terminals.boundingBox(),b=await sections.boundingBox();expect(a!.x).toBe(b!.x);expect(b!.width).toBeLessThanOrEqual(560.5);}
  await terminals.getByRole('tab',{name:'T2',exact:true}).click();await expect(terminals.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');await sections.locator('button').nth(2).click();await expect(sections.locator('button').nth(2)).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`work/airport-menu-${lang}-${width}.png`});
 });
 test(`country columns retain data and disclosure at desktop density ${lang} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await fixture(page);await page.goto(`/${lang}/airport-countries?mode=zones&date=${day}&building=T2`);
  const grid=page.locator('.airport-zone-country-grid');await expect(grid.locator(':scope > div')).toHaveCount(3);const jp=grid.locator('li[data-country=JP]').first();await expect(jp).toHaveAttribute('data-value','4');await expect(jp).toHaveAttribute('data-share','40');
  await expect(jp.locator(':scope > span').nth(0)).toHaveCSS('width',width>=1000?'28px':'36px');await expect(jp.locator('strong')).toHaveCSS('font-size',width>=1000?'14px':'16px');
  if(width>=1000){const box=await grid.boundingBox();expect(box!.width).toBeLessThanOrEqual(784.5);const columns=await grid.locator(':scope > div').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,width:b.width};}));expect(columns[1].x-columns[0].x-columns[0].width).toBeCloseTo(32,0);}
  const more=grid.locator('details').first();await more.locator('summary').click();await expect(more).toHaveAttribute('open','');await expect(more.locator('li[data-country=VN]')).toBeVisible();await more.locator('summary').click();await expect(more).not.toHaveAttribute('open','');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await grid.screenshot({path:`work/country-density-${lang}-${width}.png`});
 });
}
