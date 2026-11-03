import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';

const samples=[
 ['Japan',886924,911297],['China',761678,601273],['Vietnam',311508,275406],
 ['United States',295731,263371],['Taiwan',130636,121778],['Thailand',123456,130000],
 ['Singapore',100000,110000],['Hong Kong',90000,95000],['United Arab Emirates',80000,81000],
] as const;
const data=(month:string)=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month,
 rows:samples.map(([label,baseline,selected])=>({label,region:null,arrivals:null,
  departures:month==='2026-08'?baseline:selected,total:null,aggregate:false,startHour:null,endHour:null})),
 retrievedAt:'2026-11-03T00:00:00Z',completeness:'TOTAL_NOT_PROVIDED'});

for(const lang of ['ko','en','zh','ja'])for(const width of (lang==='en'?[320,360,361,375,390,414,429,430,431,440,700,701,1440]:[320,390,700,701,1440]))
test(`route passenger daily means stay on one line ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'READY',month:'2026-09',previousMonth:'2026-08',current:{ROUTE_COUNTRY_PASSENGERS:data('2026-09')},previous:{ROUTE_COUNTRY_PASSENGERS:data('2026-08')}}}));
 await page.route('**/api/live/airport-passenger-comparison*',route=>route.fulfill({json:{status:'READY',selectedMonth:'2026-09',baselineMonth:'2026-08',selected:data('2026-09'),baseline:data('2026-08'),availableMonths:['2026-08','2026-09']}}));
 await page.goto(`/${lang}/airport-countries?mode=passengers`);
 const block=page.getByTestId('airport-route-passengers');await block.scrollIntoViewIfNeeded();
 await page.evaluate(()=>document.fonts.ready);
 const japan=block.locator('tbody tr').first();
 await expect(japan.locator('.route-month-total')).toHaveText(['886,924','911,297']);
 await expect(japan.locator('td .route-month-mean')).toHaveText([/28,610$/,/30,377$/]);
 await block.locator('details').filter({has:page.locator('table')}).locator(':scope > summary').click();
 const means=block.locator('td .route-month-mean');await expect(means).toHaveCount(samples.length*2);
 if(width<=700){
  for(const mean of await means.all())await expect(mean).toHaveCSS('white-space','nowrap');
  const lines=await means.evaluateAll(nodes=>nodes.map(node=>{
   const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),rects:DOMRect[]=[];
   for(let text=walker.nextNode();text;text=walker.nextNode()){
    const parent=text.parentElement!,style=getComputedStyle(parent),box=parent.getBoundingClientRect();
    if(!text.textContent?.trim()||style.display==='none'||box.width<=1&&box.height<=1)continue;
    const range=document.createRange();range.selectNodeContents(text);rects.push(...range.getClientRects());
   }
   const cell=node.closest('td')!.getBoundingClientRect();
   return {lines:new Set(rects.map(rect=>Math.round(rect.top))).size,
    left:Math.min(...rects.map(rect=>rect.left)),right:Math.max(...rects.map(rect=>rect.right)),cellLeft:cell.left,cellRight:cell.right};
  }));
  for(const line of lines){expect(line.lines).toBe(1);expect(line.left).toBeGreaterThanOrEqual(line.cellLeft-1);expect(line.right).toBeLessThanOrEqual(line.cellRight+1);}
 }else await expect(block.locator('table').first()).toHaveCSS('table-layout','fixed');
 if(lang==='en'){
  const compact=means.first().locator('.route-month-mean-compact');
  await expect(compact).toHaveAttribute('aria-hidden','true');
  await expect(compact).toHaveCSS('display',width<=430?'inline':'none');
  await expect(means.first()).toHaveCSS('font-size','12px');
 }
 const countryNames=await block.locator('.route-country-name').evaluateAll(nodes=>nodes.map(node=>{
  const style=getComputedStyle(node),lineHeight=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.6;
  return {height:node.getBoundingClientRect().height,lineHeight};
 }));
 for(const name of countryNames)expect(name.height).toBeLessThanOrEqual(name.lineHeight*3+1);
 const tables=await block.locator('table').evaluateAll(nodes=>nodes.map(node=>{
  const table=node.getBoundingClientRect(),wrapper=node.parentElement!.getBoundingClientRect();
  return {left:table.left,right:table.right,wrapperLeft:wrapper.left,wrapperRight:wrapper.right};
 }));
 for(const table of tables){
  expect(table.left).toBeGreaterThanOrEqual(Math.max(-1,table.wrapperLeft-1));
  expect(table.right).toBeLessThanOrEqual(Math.min(width+1,table.wrapperRight+1));
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await block.screenshot({path:info.outputPath(`route-passenger-number-lines-${lang}-${width}.png`)});
});
