import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

function sample(values:Array<number|string>=["60+",50,45,40,30,20,10,6]) {
 const cloned=structuredClone(SUMMARY_FIXTURE);
 type QueueRow=Omit<typeof cloned.airport.congestion[number],'waitTimeMinutes'|'waitTimeRaw'|'waitingCount'>&{waitTimeMinutes:number|null;waitTimeRaw:string|null;waitingCount:number|null};
 const summary={...cloned,airport:{...cloned.airport,congestion:cloned.airport.congestion as QueueRow[]}},base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 const rows=values.map((value,index)=>({...base,zone:`DG${index<4?1:2}_${'ABCD'[index%4]}`,waitTimeRaw:String(value),waitTimeMinutes:typeof value==='number'?value:null,waitingCount:100-index}));
 summary.airport.congestion=[...summary.airport.congestion.filter(row=>row.terminal==='T1'),...rows];return summary;
}
async function open(page:Page,summary=sample(),lang='ko',width=390) {
 await page.clock.setFixedTime(new Date(summary.generatedAt));await page.setViewportSize({width,height:950});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary**',routeSummary(summary));await page.goto(`/${lang}/airport?terminal=T2`);
 const model=page.getByTestId('checkpoint-schematic');await model.scrollIntoViewIfNeeded();await expect(model.locator('[data-checkpoint]')).toHaveCount(8);return model;
}
for(const width of [320,390,430,1280])for(const lang of ['ko','en','zh','ja'])test(`all eight waits replace the duplicate representative cards: ${lang} ${width}`,async({page})=>{
 const model=await open(page,sample(),lang,width),section=page.locator('.airport-checkpoints');await expect(section.locator('.airport-queue-cards')).toHaveCount(0);
 await expect(model.locator('[data-checkpoint="1A"] strong')).toContainText('60+');await expect(model.locator('[data-checkpoint="1D"] strong')).toContainText('40');await expect(model.locator('[data-checkpoint="2D"] strong')).toContainText('6');
 await expect(model.locator('[data-checkpoint="1A"]')).toHaveAttribute('data-wait-level','very-busy');await expect(model.locator('[data-checkpoint="1D"]')).toHaveAttribute('data-wait-level','busy');await expect(model.locator('[data-checkpoint="2D"]')).toHaveAttribute('data-wait-level','clear');
 await expect(model.locator('.checkpoint-schematic-time')).toContainText('14:06');
 const imageBottom=await model.locator('img').evaluate(el=>el.getBoundingClientRect().bottom),labelsTop=await model.locator('.checkpoint-schematic-groups').evaluate(el=>el.getBoundingClientRect().top);expect(labelsTop).toBeGreaterThanOrEqual(imageBottom-1);
 expect(await model.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 const toggle=model.locator('summary');await toggle.focus();await page.keyboard.press('Enter');await expect(model.locator('[data-observation]')).toHaveCount(8);await expect(model.locator('[data-observation="DG1_D"]')).toContainText('97');
 await toggle.focus();await page.keyboard.press('Space');await expect(model.locator('[data-observation]').first()).toBeHidden();await expect(toggle).toBeFocused();
});
test('equal observations keep equal values without inventing rank differences',async({page})=>{
 const model=await open(page,sample([6,6,6,6,6,6,6,6]));await expect(model.locator('[data-checkpoint] strong')).toHaveText(Array(8).fill('6분'));await expect(model.locator('[data-checkpoint][data-wait-level="clear"]')).toHaveCount(8);
 await expect(page.locator('.checkpoint-role')).toHaveCount(0);
});
test('partial and contradictory source identifiers remain inspectable without fabricated waits',async({page})=>{
 const summary=sample([6,7]),base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 summary.airport.congestion.push({...base,waitTimeMinutes:40,waitTimeRaw:'40'});summary.airport.congestion.push({...base,zone:'UNVERIFIED_HALL',waitTimeMinutes:12,waitTimeRaw:'12'});
 const model=await open(page,summary);await expect(model.locator('[data-checkpoint="1A"]')).toHaveAttribute('data-state','missing');await expect(model.locator('[data-checkpoint="1A"] strong')).toHaveText('—');
 await expect(model.locator('[data-checkpoint="1B"] strong')).toHaveText('7분');await expect(model.locator('[data-checkpoint="2D"] strong')).toHaveText('—');
 await model.locator('summary').click();await expect(model.locator('[data-observation]')).toHaveCount(4);await expect(model.locator('[data-observation="DG1_A"]')).toHaveCount(2);await expect(model.locator('[data-observation="UNVERIFIED_HALL"]')).toContainText('12분');
});
test('all-terminal scope has exactly one drawing per terminal with independent details',async({page})=>{
 await open(page);await page.goto('/ko/airport?terminal=all');const models=page.getByTestId('checkpoint-schematic');await expect(models).toHaveCount(2);
 for(const terminal of ['T1','T2']){const model=page.locator(`[data-testid="checkpoint-schematic"][data-terminal="${terminal}"]`);await model.scrollIntoViewIfNeeded();await expect(model.locator('[data-checkpoint]')).toHaveCount(8);}
 await expect(page.locator('.airport-queue-cards')).toHaveCount(0);
});
test('all stale and empty observations preserve absence without inventing zero',async({page})=>{
 const summary=sample([60,0]);for(const row of summary.airport.congestion)row.freshness='STALE';
 const model=await open(page,summary);await expect(model.locator('[data-checkpoint][data-state="stale"]')).toHaveCount(2);await model.locator('summary').click();await expect(model.locator('[data-observation]')).toHaveCount(2);await expect(model).toContainText('60분');await expect(model).toContainText('0분');
 summary.airport.congestion=[];await page.unroute('**/api/live/summary**');await page.route('**/api/live/summary**',routeSummary(summary));await page.reload();await model.scrollIntoViewIfNeeded();await expect(model.locator('[data-checkpoint][data-state="missing"]')).toHaveCount(8);await expect(model.locator('[data-checkpoint] strong')).toHaveText(Array(8).fill('—'));await model.locator('summary').click();await expect(model.locator('[data-observation]')).toHaveCount(0);await expect(model).toContainText('확인된 관측이 없습니다.');
});
