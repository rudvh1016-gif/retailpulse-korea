import {test,expect} from '@playwright/test';
import type {AirportCongestionSummaryRow} from '../lib/airport-today-summary';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

type CheckpointFixtureRow=Omit<(typeof SUMMARY_FIXTURE)['airport']['congestion'][number],'waitingCount'> & Pick<AirportCongestionSummaryRow,'waitingCount'>;
type CheckpointFixture=Omit<typeof SUMMARY_FIXTURE,'airport'> & {airport:Omit<(typeof SUMMARY_FIXTURE)['airport'],'congestion'> & {congestion:CheckpointFixtureRow[]}};

for(const [lang,width] of [['ko',360],['ko',390],['ko',430],['ko',1280],['en',390],['zh',390],['ja',390]] as const)test(`source-position checkpoint schematic ${lang} ${width}`,async({page},info)=>{
 const summary:CheckpointFixture=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 const keys=['1A','1B','1C','1D','2A','2B','2C','2D'];
 const values=[60,45,0,20,6,6,6,6];
 const counts=[128,34,0,null,7,8,9,10];
 summary.airport.congestion=keys.map((key,index)=>({...base,zone:`DG${key[0]}_${key[1]}`,waitingCount:counts[index],waitTimeMinutes:values[index],waitTimeRaw:index===0?'60+':index===3?'운영 종료':String(values[index]),freshness:index===1?'STALE':'LIVE'}));
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const loadedDrawings:string[]=[];page.on('request',request=>{if(/checkpoint-base-|assets\/airport-checkpoint-schematic-/.test(request.url()))loadedDrawings.push(request.url());});
 await page.route('**/api/live/summary*',routeSummary(summary));await page.goto(`/${lang}/airport?terminal=T2`);
 const model=page.getByTestId('checkpoint-schematic');await expect(model).toHaveAttribute('data-terminal','T2');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 expect(loadedDrawings).toEqual([]);await model.scrollIntoViewIfNeeded();
 await expect(model.locator('[data-checkpoint]')).toHaveCount(8);
 expect(await model.locator('[data-checkpoint]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-checkpoint')))).toEqual(['2D','2C','2B','2A','1D','1C','1B','1A']);
 // Floor order on screen: 2D at the far left, 1A at the far right, one row, each tied to its lane.
 const placed=await model.locator('[data-checkpoint]').evaluateAll(rows=>rows.map(row=>{const box=row.getBoundingClientRect();return {key:row.getAttribute('data-checkpoint'),left:box.left,top:box.top,right:box.right};}));
 expect([...placed].sort((a,b)=>a.left-b.left).map(row=>row.key)).toEqual(['2D','2C','2B','2A','1D','1C','1B','1A']);
 expect(new Set(placed.map(row=>Math.round(row.top))).size).toBe(1);
 expect(placed.every((row,index)=>index===0||row.left>=placed[index-1].right-1)).toBe(true);
 await expect(model.locator('.checkpoint-schematic-leaders path')).toHaveCount(8);
 await expect(model.locator('[data-checkpoint="1A"] strong')).toContainText('60+');
 await expect(model.locator('[data-checkpoint="1B"]')).toHaveAttribute('data-state','stale');
 await expect(model.locator('[data-checkpoint="1C"]')).toHaveAttribute('data-state','zero');
 await expect(model.locator('[data-checkpoint="1C"]')).toHaveAttribute('data-wait-level','neutral');
 await expect(model.locator('[data-checkpoint="1D"]')).toHaveAttribute('data-state','closed');
 const countCopy={ko:['대기 128명','대기 0명','인원 미제공'],en:['Waiting 128','Waiting 0','Count unavailable'],zh:['等候 128人','等候 0人','人数未提供'],ja:['待機 128人','待機 0人','人数未提供']}[lang];
 await expect(model.locator('[data-checkpoint="1A"] .checkpoint-schematic-people')).toHaveText(countCopy[0]);
 await expect(model.locator('[data-checkpoint="1C"] .checkpoint-schematic-people')).toHaveText(countCopy[1]);
 await expect(model.locator('[data-checkpoint="1D"] .checkpoint-schematic-people')).toHaveText(countCopy[2]);
 await expect(model.locator('.checkpoint-schematic-people')).toHaveCount(8);
 await expect(model.locator('details')).not.toHaveAttribute('open','');
 for(const key of keys)await expect(model.locator(`[data-checkpoint="${key}"] .checkpoint-schematic-people`)).toBeVisible();
 expect(await model.locator('[data-checkpoint]').evaluateAll(rows=>rows.every(row=>{
  const wait=row.querySelector('strong')!.getBoundingClientRect(),people=row.querySelector('.checkpoint-schematic-people')!.getBoundingClientRect();
  return people.top>=wait.bottom-1;
 }))).toBe(true);
 await expect(model.locator('img')).toHaveJSProperty('complete',true);expect(await model.locator('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await model.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 await model.screenshot({path:info.outputPath(`checkpoint-${lang}-${width}.png`)});
 const full=page.locator('.airport-checkpoints');await expect(full.locator('.airport-queue-cards')).toHaveCount(0);
 const toggle=model.locator('summary');await toggle.focus();await page.keyboard.press('Enter');await expect(model.locator('details')).toHaveAttribute('open','');
 await expect(model.locator('[data-observation]')).toHaveCount(8);await expect(model.locator('[data-observation]').first()).toBeVisible();
 await expect(model.locator('a')).toHaveAttribute('href','https://www.data.go.kr/data/15161098/openapi.do');
 expect(errors).toEqual([]);
});

for(const width of [320,390])test(`checkpoint waiting counts T1 ${width}`,async({page},info)=>{
 const summary:CheckpointFixture=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal==='T1')!;
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 summary.airport.congestion=[
  {...base,zone:'DG5_W',waitingCount:1234,waitTimeMinutes:15,waitTimeRaw:'15'},
  {...base,zone:'DG5_E',waitingCount:0,waitTimeMinutes:0,waitTimeRaw:'0'},
  {...base,zone:'DG4_W',waitingCount:null,waitTimeMinutes:4,waitTimeRaw:'4'},
 ];
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(summary));await page.goto('/ko/airport?terminal=T1');
 const model=page.getByTestId('checkpoint-schematic');await expect(model).toHaveAttribute('data-terminal','T1');await model.scrollIntoViewIfNeeded();
 await expect(model.locator('details')).not.toHaveAttribute('open','');
 for(const [key,label] of [['5W','대기 1,234명'],['5E','대기 0명'],['4W','인원 미제공'],['4E','인원 미제공']]){
  const count=model.locator(`[data-checkpoint="${key}"] .checkpoint-schematic-people`);
  await expect(count).toBeVisible();await expect(count).toHaveText(label);
  await expect(model.locator(`[data-checkpoint="${key}"]`)).toHaveAttribute('aria-label',new RegExp(label));
 }
 const order=await model.locator('[data-checkpoint]').evaluateAll(rows=>rows.map(row=>({key:row.getAttribute('data-checkpoint'),left:row.getBoundingClientRect().left})));
 expect(order.sort((a,b)=>a.left-b.left).map(row=>row.key)).toEqual(['5W','5E','4W','4E','3W','3E','2W','2E']);
 await expect(model.locator('[data-checkpoint="5W"] > span')).toHaveText('5 서');
 await expect(model.locator('.checkpoint-schematic-time')).toContainText('관측:');
 await expect(model.locator('.checkpoint-schematic-time')).toContainText('KST');
 await expect(page.locator('.airport-checkpoints .airport-queue-cards')).toHaveCount(0);
 expect(await model.locator('.checkpoint-schematic-people').evaluateAll(labels=>labels.every(label=>label.scrollWidth<=label.clientWidth+1))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await model.screenshot({path:info.outputPath(`checkpoint-counts-T1-${width}.png`)});
 expect(errors).toEqual([]);
});
