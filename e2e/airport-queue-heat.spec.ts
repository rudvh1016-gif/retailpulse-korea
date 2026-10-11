import {test,expect,type Page} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';

function heatFixture() {
 const summary=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 const samples=[['DG1_A',6,'6',52,'LIVE'],['DG1_B',20,'20',45,'LIVE'],['DG1_C',45,'45',44,'LIVE'],['DG1_D',null,'60+',40,'LIVE'],['DG2_A',80,'80',41,'STALE'],['DG2_B',null,null,null,'LIVE'],['DG2_C',null,'운영 안 함',null,'LIVE'],['DG2_D',0,'0',0,'LIVE']];
 const rows=samples.map(([zone,waitTimeMinutes,waitTimeRaw,waitingCount,freshness])=>Object.assign({...base},{zone,waitTimeMinutes,waitTimeRaw,waitingCount,freshness}));
 summary.airport.congestion=[...summary.airport.congestion.filter(row=>row.terminal==='T1'),...rows];summary.airport.currentBusiestDepartureHallByTerminal.T2=rows[3];return summary;
}
async function open(page:Page,width=1280,lang='ko',reducedMotion:'reduce'|'no-preference'='reduce') {
 await page.setViewportSize({width,height:1000});await page.clock.setFixedTime(new Date('2026-08-31T14:10:00+09:00'));await page.emulateMedia({reducedMotion});
 await page.route('**/api/live/summary**',routeSummary(heatFixture()));await page.goto(`/${lang}/airport?terminal=T2`);
 const model=page.getByTestId('checkpoint-schematic');await model.scrollIntoViewIfNeeded();await expect(model.locator('[data-checkpoint]')).toHaveCount(8);await model.locator('summary').click();return model;
}
for(const width of [320,390,430,1280])test(`consolidated heat categories preserve source values at ${width}px`,async({page},info)=>{
 const model=await open(page,width),slot=(zone:string)=>model.locator(`[data-checkpoint="${zone}"]`),row=(zone:string)=>model.locator(`[data-observation="DG${zone[0]}_${zone[1]}"]`);
 for(const [zone,level] of [['1A','clear'],['1B','normal'],['1C','busy'],['1D','very-busy'],['2A','neutral'],['2B','neutral'],['2C','neutral'],['2D','neutral']])await expect(slot(zone)).toHaveAttribute('data-wait-level',level);
 await expect(row('1A')).toContainText('6분');await expect(row('1A')).toContainText('52명');await expect(row('1D')).toContainText('60+분');await expect(row('1D')).toContainText('14:06');
 await expect(row('2A')).toContainText('오래된 관측');await expect(row('2B')).toContainText('대기시간 미확인');await expect(row('2C')).toContainText('운영 안 함');await expect(row('2C')).not.toContainText('운영 안 함분');
 await expect(slot('2D')).toHaveAttribute('data-state','zero');await expect(row('2D')).toContainText('0명');await expect(row('2D')).toContainText('0분 표시 · 운영 여부 확인');
 expect(await model.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(await model.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 await model.screenshot({path:info.outputPath(`checkpoint-state-${width}.png`)});
 await page.locator('#airport-data-flow').getByRole('tab',{name:'T1',exact:true}).click();await expect(model).toHaveAttribute('data-terminal','T1');await model.scrollIntoViewIfNeeded();await model.locator('summary').click();
 await expect(model.locator('[data-observation]')).toHaveCount(2);await expect(model.locator('[data-observation]').first()).toHaveAttribute('data-state','unverified');await expect(model.locator('[data-observation]').first()).toContainText('24분');await expect(model.locator('[data-observation]').first()).toContainText('81명');
});
for(const [lang,label] of [['en','Very busy'],['zh','非常拥挤'],['ja','非常に混雑']])test(`checkpoint state text ${lang}`,async({page})=>{
 const model=await open(page,390,lang);await expect(model.locator('[data-observation="DG1_D"] small')).toHaveText(label);
});
test('decorative scene stays static with normal motion and runtime reduced-motion changes',async({page})=>{
 const model=await open(page,1280,'ko','no-preference');expect(await model.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 await page.emulateMedia({reducedMotion:'reduce'});expect(await model.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 await page.evaluate(()=>window.scrollTo(0,0));await model.scrollIntoViewIfNeeded();expect(await model.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
});
test('aging keeps every source observation while changing colors to neutral',async({page})=>{
 await open(page);const aged=heatFixture();aged.generatedAt='2026-08-31T14:27:00+09:00';await page.clock.setFixedTime(new Date(aged.generatedAt));
 await page.unroute('**/api/live/summary**');await page.route('**/api/live/summary**',routeSummary(aged));await page.reload();
 const model=page.getByTestId('checkpoint-schematic');await model.scrollIntoViewIfNeeded();await expect(model.locator('[data-checkpoint][data-state="stale"]')).toHaveCount(8);await expect(model.locator('[data-checkpoint][data-wait-level="very-busy"]')).toHaveCount(0);
 await model.locator('summary').click();await expect(model.locator('[data-observation][data-state="stale"]')).toHaveCount(8);await expect(model.locator('[data-observation="DG2_C"]')).toContainText('운영 안 함');await expect(model).toContainText('14:06');await expect(model).toContainText('60+분');
});
