import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
for(const width of [320,390,1440])for(const reduced of [false,true])test(`home checkpoint observations preserve meaning ${width} reduced=${reduced}`,async({page})=>{
 const summary=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 summary.airport.congestion=[{...base,terminal:'T2',zone:'DG1_A',waitTimeMinutes:60,waitTimeRaw:'60+',freshness:'LIVE'},
  {...base,terminal:'T2',zone:'DG1_B',waitTimeMinutes:45,waitTimeRaw:'45',freshness:'STALE'},
  {...base,terminal:'T2',zone:'DG1_C',waitTimeMinutes:0,waitTimeRaw:'0',freshness:'LIVE'},
  {...base,terminal:'T1',zone:'DG2_E',waitTimeMinutes:60,waitTimeRaw:'60+',freshness:'LIVE'}];
 await page.clock.setFixedTime(new Date(summary.generatedAt));await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 const calls:string[]=[];page.on('request',r=>{if(r.url().includes('/api/'))calls.push(new URL(r.url()).pathname);});
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.goto('/ko',{waitUntil:'domcontentloaded'});
 const section=page.locator('.home-checkpoint-waits');await section.scrollIntoViewIfNeeded();
 await expect(section.getByRole('heading',{name:'현재 출국장',exact:true})).toBeVisible();
 await expect(section.locator('figure[data-testid=checkpoint-schematic]')).toHaveCount(2);
 await expect(page.locator('#focus-country-trends')).toHaveCount(0);
 const t2=section.locator('figure[data-terminal=T2]');
 await expect(t2.locator('[data-checkpoint="1A"]')).toHaveAttribute('data-wait-level','very-busy');
 await expect(t2.locator('[data-checkpoint="1A"]')).toContainText('매우 혼잡');
 await expect(t2.locator('[data-checkpoint="1A"]')).toHaveCSS('color','rgb(161, 45, 63)');
 await expect(t2.locator('[data-checkpoint="1B"]')).toHaveAttribute('data-state','stale');
 await expect(t2.locator('[data-checkpoint="1C"]')).toHaveAttribute('data-state','zero');
 await expect(t2.locator('[data-checkpoint="2D"]')).toHaveAttribute('data-state','missing');
 await expect(section.locator('figure[data-terminal=T1] .checkpoint-schematic-basis').last()).toContainText('공식 혼잡 등급 아님');
 expect(calls.filter(path=>path==='/api/live/summary').length).toBeLessThanOrEqual(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(reduced)expect(await section.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
 await section.screenshot({path:`test-results/home-checkpoint-${width}-${reduced}.png`});
});
