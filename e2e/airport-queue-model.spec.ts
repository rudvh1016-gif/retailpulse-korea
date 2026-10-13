import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';

function queues() {
 const summary=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 const rows=['DG2_B','DG2_A','DG2_C','DG2_D','DG1_A','DG1_B','DG1_D','DG1_C'].map((zone,index)=>({...base,zone,waitTimeMinutes:index===0?11:index===1?9:6,waitTimeRaw:index===0?'11':index===1?'9':'6',waitingCount:[308,289,271,269,112,110,110,109][index]}));
 summary.airport.congestion=[...summary.airport.congestion.filter(row=>row.terminal==='T1'),...rows];
 summary.airport.currentBusiestDepartureHallByTerminal.T2=rows[0];return summary;
}

for(const lang of ['ko','en','zh','ja'])for(const width of [320,360,390,430,1280])test(`one checkpoint drawing preserves all observations and keyboard folding: ${lang} ${width}`,async({page},info)=>{
 const summary=queues();await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary**',routeSummary(summary));await page.goto(`/${lang}/airport?terminal=T2`);
 const section=page.locator('.airport-checkpoints'),model=section.getByTestId('checkpoint-schematic');await model.scrollIntoViewIfNeeded();
 await expect(section.locator('.airport-queue-cards')).toHaveCount(0);await expect(model.locator('[data-checkpoint]')).toHaveCount(8);
 const img=model.locator('img');await expect.poll(()=>img.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 const toggle=model.locator('summary'),details=model.locator('details'),rows=model.locator('[data-observation]');
 await expect(rows.first()).toBeHidden();await toggle.focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');
 await expect(rows).toHaveCount(8);await expect(rows.first()).toContainText('2B');await expect(rows.first()).toContainText('11');await expect(rows.first()).toContainText('308');await expect(rows.nth(1)).toContainText('289');await expect(rows.first()).toContainText('14:06');
 const geometry=await model.locator('[data-checkpoint]').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,right:r.right,overflow:el.scrollWidth>el.clientWidth+1};}));
 expect(geometry.every(r=>r.x>=0&&r.right<=width&&!r.overflow)).toBe(true);expect(await section.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 expect(await model.locator('[data-checkpoint] strong').first().evaluate(el=>getComputedStyle(el).fontSize)).toBe('12px');
 await toggle.click();await toggle.click();await expect(rows.first()).toBeVisible();await toggle.focus();await page.keyboard.press('Space');await expect(rows.first()).toBeHidden();await expect(toggle).toBeFocused();
 if(lang==='ko')await model.screenshot({path:info.outputPath(`checkpoint-compact-${width}.png`)});
 await page.locator('.airport-view > .terminal-selector').getByRole('tab',{name:'T1',exact:true}).click();await expect(model).toHaveAttribute('data-terminal','T1');await model.scrollIntoViewIfNeeded();
 await model.locator('summary').click();await expect(model.locator('[data-observation]')).toHaveCount(2);await expect(model.locator('[data-observation]').first()).toContainText('24');await expect(model).not.toContainText('308');
});

test('raw lower bounds, stale, missing and observed zero remain distinct in the detail',async({page})=>{
 const summary=queues();Object.assign(summary.airport.congestion.find(row=>row.zone==='DG2_A')!,{waitTimeMinutes:61,waitTimeRaw:'60+',waitingCount:null,freshness:'STALE'});
 Object.assign(summary.airport.congestion.find(row=>row.zone==='DG2_C')!,{waitTimeMinutes:null,waitTimeRaw:null,waitingCount:null});
 Object.assign(summary.airport.congestion.find(row=>row.zone==='DG2_D')!,{waitTimeMinutes:0,waitTimeRaw:'0',waitingCount:0});
 await page.clock.setFixedTime(new Date(summary.generatedAt));await page.route('**/api/live/summary**',routeSummary(summary));await page.goto('/ko/airport?terminal=T2');
 const model=page.getByTestId('checkpoint-schematic');await model.scrollIntoViewIfNeeded();await model.locator('summary').click();
 const row=(zone:string)=>model.locator(`[data-observation="DG${zone[0]}_${zone[1]}"]`);
 await expect(row('2A')).toContainText('60+분');await expect(row('2A')).toHaveAttribute('data-state','stale');
 await expect(row('2C')).toContainText('미확인');await expect(row('2C')).not.toContainText('0분');await expect(row('2C')).not.toContainText('0명');
 await expect(row('2D')).toContainText('0분');await expect(row('2D')).toContainText('0명');await expect(row('2D')).toHaveAttribute('data-state','zero');
});
