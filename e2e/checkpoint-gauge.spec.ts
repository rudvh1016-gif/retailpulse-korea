import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

for(const terminal of ['T1','T2'] as const)for(const width of [390,1440])for(const reduced of [false,true])test(`checkpoint gauge ${terminal} ${width} reduced=${reduced}`,async({page},info)=>{
 const summary=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal===terminal)!;
 const zones=terminal==='T1'?['DG2_E','DG2_W','DG3_E','DG3_W','DG4_E','DG4_W']:['DG1_A','DG1_B','DG1_C','DG1_D','DG2_A','DG2_B'];
 const keys=terminal==='T1'?['2E','2W','3E','3W','4E','4W','5E','5W']:['1A','1B','1C','1D','2A','2B','2C','2D'];
 summary.airport.congestion=zones.map((zone,i)=>({...base,terminal,zone,waitTimeMinutes:[30,45,0,20,60,15][i],waitTimeRaw:['30','45','0','운영 종료','60+','15'][i],freshness:i===1?'STALE':'LIVE',...(i===5?{collectionStatus:'FAILED' as const}:{})}));
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 // Hold only the real gauge animation so its start/middle/end can be sampled
 // deterministically, without racing a 560ms animation on slow CI machines.
 await page.addInitScript(()=>{
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   const animation=animate.call(this,frames,options);
   if(this.classList.contains('checkpoint-gauge-fill')){animation.pause();animation.currentTime=0;}
   return animation;
  };
 });
 await page.route('**/api/live/summary*',routeSummary(summary));
 await page.goto(`/ko/airport?terminal=${terminal}`);
 const model=page.getByTestId('checkpoint-schematic');await model.scrollIntoViewIfNeeded();
 const lane=(i:number)=>model.locator(`[data-checkpoint="${keys[i]}"]`);
 const fill=(i:number)=>lane(i).locator('.checkpoint-gauge-fill');
 await lane(0).scrollIntoViewIfNeeded();
 await expect(model.locator('.checkpoint-gauge')).toHaveCount(8);
 await expect(model.locator('.checkpoint-gauge').first()).toHaveAttribute('aria-hidden','true');
 await expect(lane(0).locator('strong')).toHaveText('30분');
 const scale=()=>fill(0).evaluate(node=>new DOMMatrixReadOnly(getComputedStyle(node).transform).a);
 if(reduced){
  await expect.poll(scale).toBeCloseTo(.5,3);
  expect(await fill(0).evaluate(node=>node.getAnimations().length)).toBe(0);
 }else{
  await expect.poll(()=>fill(0).evaluate(node=>node.getAnimations().length)).toBe(1);
  expect(await scale()).toBe(0);
  await fill(0).evaluate(node=>{node.getAnimations()[0].currentTime=280;});
  const middle=await scale();expect(middle).toBeGreaterThan(0);expect(middle).toBeLessThan(.5);
  await expect(lane(0).locator('strong')).toHaveText('30분');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(scale).toBeCloseTo(.5,3);
  expect(await fill(0).evaluate(node=>node.getAnimations().length)).toBe(0);
 }
 await expect(lane(1)).toHaveAttribute('data-state','stale');
 await expect(fill(1)).toHaveCSS('background-color','rgb(146, 154, 163)');
 await expect(fill(1)).toHaveCSS('transform','matrix(0.75, 0, 0, 1, 0, 0)');
 await expect(lane(2)).toHaveAttribute('data-state','zero');
 await expect(lane(3)).toHaveAttribute('data-state','closed');
 for(const i of [2,3,6,7])await expect(fill(i)).toHaveCSS('transform','matrix(0, 0, 0, 1, 0, 0)');
 await expect(lane(4).locator('strong')).toHaveText('60+분');
 await expect(fill(4)).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
 for(const i of [1,2,3,5,6,7])expect(await fill(i).evaluate(node=>node.getAnimations().length)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await model.screenshot({path:info.outputPath(`gauge-${terminal}-${width}-${reduced}.png`)});
});
