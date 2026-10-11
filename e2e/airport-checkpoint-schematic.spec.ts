import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

for(const [lang,width] of [['ko',360],['ko',390],['ko',430],['ko',1280],['en',390],['zh',390],['ja',390]] as const)test(`source-position checkpoint schematic ${lang} ${width}`,async({page},info)=>{
 const summary=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 const keys=['1A','1B','1C','1D','2A','2B','2C','2D'];
 const values=[60,45,0,20,6,6,6,6];
 summary.airport.congestion=keys.map((key,index)=>({...base,zone:`DG${key[0]}_${key[1]}`,waitTimeMinutes:values[index],waitTimeRaw:index===0?'60+':index===3?'운영 종료':String(values[index]),freshness:index===1?'STALE':'LIVE'}));
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(summary));await page.goto(`/${lang}/airport?terminal=T2`);
 const model=page.getByTestId('checkpoint-schematic');await expect(model).toHaveAttribute('data-terminal','T2');await model.scrollIntoViewIfNeeded();
 await expect(model.locator('[data-checkpoint]')).toHaveCount(8);
 expect(await model.locator('[data-checkpoint]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-checkpoint')))).toEqual(['2D','2C','2B','2A','1D','1C','1B','1A']);
 await expect(model.locator('[data-checkpoint="1A"] strong')).toContainText('60+');
 await expect(model.locator('[data-checkpoint="1B"]')).toHaveAttribute('data-state','stale');
 await expect(model.locator('[data-checkpoint="1C"]')).toHaveAttribute('data-state','zero');
 await expect(model.locator('[data-checkpoint="1C"]')).toHaveAttribute('data-wait-level','neutral');
 await expect(model.locator('[data-checkpoint="1D"]')).toHaveAttribute('data-state','closed');
 await expect(model.locator('img')).toHaveJSProperty('complete',true);expect(await model.locator('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await model.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 await model.screenshot({path:info.outputPath(`checkpoint-${lang}-${width}.png`)});
 const full=page.locator('.airport-checkpoints');await full.getByRole('button').focus();await page.keyboard.press('Enter');await expect(full.locator('article')).toHaveCount(8);
 expect(errors).toEqual([]);
});
