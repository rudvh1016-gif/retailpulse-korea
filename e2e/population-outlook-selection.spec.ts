import {test,expect,type Browser,type Locator,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';

// Owner request 2026-10-14: "해당시간대를 누르면 그 시간대의 선에 딱 보이게" and the green marker was too small.
// Pins the selected hour's full-height guide, min–max capsule and end dots at the pressed hour, their
// visible size, the move to another hour, tap selection on the drawing, and that the band is drawn
// through the published minimum and maximum only (no midline, no bridged gap).
const generatedAt='2026-08-31T08:10:00Z',issuedAt='2026-08-31T17:00:00+09:00';
const hours=[18,19,20,21,22,23,0,1,2];
const forecast=hours.map((hour,index)=>({targetAt:hour>=18?`2026-08-31T${hour}:00:00+09:00`:`2026-09-01T0${hour}:00:00+09:00`,issuedAt,populationMin:70_000-index*7_000,populationMax:80_000-index*7_000,congestionLevel:3,congestionLabel:'fixture'}));
const left=10,top=32,bottom=184;

async function open(page:Page,rows=forecast){
 const data=structuredClone(SUMMARY_FIXTURE) as unknown as LiveSummary;
 (data as {generatedAt:string}).generatedAt=generatedAt;
 const area=data.areas.myeongdong!;
 area.realtime={...area.realtime!,observedAt:'2026-08-31T17:05:00+09:00',populationMin:86_000,populationMax:88_000};
 area.realtimeForecast=rows;
 await page.clock.setFixedTime(new Date(generatedAt));
 await page.route('**/api/live/summary*',routeSummary(data));
 await page.goto('/ko/myeongdong');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const outlook=page.getByTestId('population-outlook').first();
 await expect(outlook.locator('.outlook-times button')).toHaveCount(rows.length);await outlook.scrollIntoViewIfNeeded();
 return outlook;
}
const settled=(outlook:Locator)=>expect.poll(()=>outlook.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
function selection(outlook:Locator){
 return outlook.locator('svg.outlook-trend').evaluate(el=>{
  const svg=el as SVGSVGElement,box=svg.getBoundingClientRect(),scale=box.width/svg.viewBox.baseVal.width;
  const capsule=svg.querySelector('[data-selected-range]')!,guide=svg.querySelector('[data-selected-guide]')!,guideBox=guide.getBoundingClientRect();
  return {width:svg.viewBox.baseVal.width,scale,start:Number(svg.dataset.domainStart),end:Number(svg.dataset.domainEnd),ceiling:Number(svg.dataset.ceiling),
   at:capsule.getAttribute('data-selected-at'),x1:Number(capsule.getAttribute('x1')),x2:Number(capsule.getAttribute('x2')),y1:Number(capsule.getAttribute('y1')),y2:Number(capsule.getAttribute('y2')),
   capsuleWidth:parseFloat(getComputedStyle(capsule).strokeWidth)*scale,cap:getComputedStyle(capsule).strokeLinecap,
   guide:{at:guide.getAttribute('data-selected-guide'),x1:Number(guide.getAttribute('x1')),x2:Number(guide.getAttribute('x2')),y1:Number(guide.getAttribute('y1')),y2:Number(guide.getAttribute('y2')),painted:(guideBox.left+guideBox.width/2-box.left)/scale},
   ends:[...svg.querySelectorAll('[data-selected-end]')].map(end=>{const b=end.getBoundingClientRect();return {end:end.getAttribute('data-selected-end'),cy:Number(end.getAttribute('cy')),width:b.width,height:b.height};}),
   pill:svg.querySelector('.outlook-pill text')?.textContent};
 });
}
type Reading=Awaited<ReturnType<typeof selection>>;
const xOf=(g:Reading,at:string)=>left+(Date.parse(at)-g.start)/(g.end-g.start)*(g.width-50);
const yOf=(g:Reading,value:number)=>bottom-value/g.ceiling*(bottom-top);

async function pinned(outlook:Locator,index:number){
 const button=outlook.locator('.outlook-times button').nth(index),row=forecast[index];
 await expect(button).toHaveAttribute('aria-pressed','true');await expect(button).toHaveAttribute('data-at',row.targetAt);
 const g=await selection(outlook);
 expect(g.at).toBe(row.targetAt);expect(g.guide.at).toBe(row.targetAt);
 // At the button's hour: capsule and guide share that hour's x; capsule spans exactly max -> min.
 expect(g.x1).toBeCloseTo(xOf(g,row.targetAt),3);expect(g.x2).toBe(g.x1);expect(g.guide.x1).toBe(g.x1);expect(g.guide.x2).toBe(g.x1);
 expect(g.y1).toBeCloseTo(yOf(g,row.populationMax),3);expect(g.y2).toBeCloseTo(yOf(g,row.populationMin),3);
 // Visible: a full-height guide from under the time pill to the zero line, a >= 8px rounded capsule, >= 9px end dots.
 expect(g.guide.y1).toBeLessThanOrEqual(top);expect(g.guide.y2).toBe(bottom);
 expect(g.capsuleWidth).toBeGreaterThanOrEqual(8);expect(g.cap).toBe('round');
 expect(g.ends.map(end=>end.end)).toEqual(['max','min']);
 for(const end of g.ends){expect(end.width).toBeGreaterThanOrEqual(9);expect(end.height).toBeGreaterThanOrEqual(9);}
 expect(g.ends[0].cy).toBeCloseTo(g.y1,3);expect(g.ends[1].cy).toBeCloseTo(g.y2,3);
 expect(g.pill).toBe(row.targetAt.slice(11,16));
 return g;
}

async function bandHasNoMidline(outlook:Locator){
 const drawn=await outlook.locator('.outlook-band path').evaluateAll(nodes=>nodes.map(node=>({kind:node.getAttribute('class'),d:node.getAttribute('d')!})));
 expect(drawn.filter(path=>path.kind==='outlook-edge outlook-max')).toHaveLength(1);expect(drawn.filter(path=>path.kind==='outlook-edge outlook-min')).toHaveLength(1);
 const g=await selection(outlook);
 for(const {kind,d} of drawn){
  // Every anchor (path start, line and curve end points) sits on a published bound of its hour.
  const anchors=[...d.matchAll(/([MLC])([^MLCZ]*)/g)].map(([,,body])=>body.trim().split(/[\s,]+/).map(Number).slice(-2));
  for(const [x,y] of anchors){
   const row=forecast.find(r=>Math.abs(xOf(g,r.targetAt)-x)<.01);expect(row,`${kind} anchor at x=${x} is an hour`).toBeTruthy();
   const high=yOf(g,row!.populationMax),low=yOf(g,row!.populationMin),mid=(high+low)/2;
   expect(Math.abs(y-mid)).toBeGreaterThan(1);
   if(kind==='outlook-edge outlook-max')expect(y).toBeCloseTo(high,3);
   else if(kind==='outlook-edge outlook-min')expect(y).toBeCloseTo(low,3);
   else if(kind==='outlook-fade')expect([low,bottom].some(v=>Math.abs(v-y)<.001)).toBe(true);
   else expect([high,low].some(v=>Math.abs(v-y)<.001)).toBe(true);
  }
 }
}

for(const width of [320,1280])test(`selected hour is unmistakable and moves with the pressed hour ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const outlook=await open(page);const buttons=outlook.locator('.outlook-times button');
 for(const button of await buttons.all()){const box=(await button.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
 await pinned(outlook,0);
 await buttons.nth(4).click();await settled(outlook);const at22=await pinned(outlook,4);
 expect(at22.guide.painted).toBeCloseTo(at22.x1,0);
 await buttons.nth(7).click();await settled(outlook);const at01=await pinned(outlook,7);
 expect(at01.x1).toBeGreaterThan(at22.x1);expect(at01.guide.painted).toBeCloseTo(at01.x1,0);
 await expect(outlook.locator('.outlook-selection-range')).toContainText('21,000–31,000');
 await bandHasNoMidline(outlook);
 // A click on the drawing picks the nearest published hour; the reading follows.
 const svg=outlook.locator('svg.outlook-trend'),box=(await svg.boundingBox())!;
 await page.mouse.click(box.x+(xOf(at01,forecast[2].targetAt)+6)*at01.scale,box.y+100*at01.scale);await settled(outlook);
 await pinned(outlook,2);await expect(outlook.locator('.outlook-selection-range')).toContainText('56,000–66,000');
 // A sideways drag follows the pointer hour by hour without a glide, and ends on the hour under it.
 await page.mouse.move(box.x+xOf(at01,forecast[2].targetAt)*at01.scale,box.y+100*at01.scale);await page.mouse.down();
 await page.mouse.move(box.x+xOf(at01,forecast[6].targetAt)*at01.scale,box.y+104*at01.scale,{steps:10});await page.mouse.up();
 await pinned(outlook,6);expect(await outlook.locator('.outlook-active-range').evaluate(el=>el.getAnimations().length)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 // Reduced motion: the selection jumps, nothing animates.
 await page.emulateMedia({reducedMotion:'reduce'});await buttons.nth(5).click();await pinned(outlook,5);
 expect(await outlook.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
});

async function phone(browser:Browser){
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 return {context,page:await context.newPage()};
}
test('phone: a tap on the line selects that hour, a narrow range keeps visible end dots, gaps stay open',async({browser})=>{
 const {context,page}=await phone(browser);
 // Seoul's usual ~2,000-person range, with 00:00 missing.
 const narrow=forecast.map(row=>({...row,populationMin:row.populationMax-2_000})).filter((_,index)=>index!==6);
 const outlook=await open(page,narrow);const svg=outlook.locator('svg.outlook-trend');
 await expect(outlook.locator('.outlook-band > g')).toHaveCount(2);
 await expect(outlook.locator('.outlook-band > g').first()).toHaveAttribute('data-to',narrow[5].targetAt);
 await expect(outlook.locator('.outlook-band > g').last()).toHaveAttribute('data-from',narrow[6].targetAt);
 const g=await selection(outlook);
 await svg.tap({position:{x:xOf(g,narrow[3].targetAt)*g.scale,y:120}});await settled(outlook);
 await expect(outlook.locator('.outlook-times button').nth(3)).toHaveAttribute('aria-pressed','true');
 const picked=await selection(outlook);expect(picked.at).toBe(narrow[3].targetAt);expect(picked.x1).toBeCloseTo(xOf(picked,narrow[3].targetAt),3);
 expect(picked.y2-picked.y1).toBeLessThan(5);
 for(const end of picked.ends){expect(end.width).toBeGreaterThanOrEqual(9);expect(end.height).toBeGreaterThanOrEqual(9);}
 expect(picked.capsuleWidth).toBeGreaterThanOrEqual(8);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await context.close();
});
