import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
for(const width of [320,1440])for(const reduced of [false,true])test(`checkpoint people and longest ${width} reduce=${reduced}`,async({page})=>{
 const summary=structuredClone(SUMMARY_FIXTURE),base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
 summary.airport.congestion=[{...base,terminal:'T1',zone:'DG2_E',waitTimeMinutes:25,waitTimeRaw:'25',freshness:'LIVE'},{...base,terminal:'T2',zone:'DG1_A',waitTimeMinutes:60,waitTimeRaw:'60+',freshness:'LIVE'},{...base,terminal:'T2',zone:'DG1_B',waitTimeMinutes:90,waitTimeRaw:'90',freshness:'STALE'}];
 await page.clock.setFixedTime(new Date(summary.generatedAt));await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 const calls:string[]=[];page.on('request',r=>{if(r.url().includes('/api/'))calls.push(new URL(r.url()).pathname);});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));await page.goto('/ko');
 const section=page.locator('.home-checkpoint-waits');await section.scrollIntoViewIfNeeded();
 const t2=section.locator('figure[data-terminal=T2]');await t2.scrollIntoViewIfNeeded();await expect(t2.locator('.checkpoint-longest')).toContainText('60+');
 await expect(t2.locator('figcaption strong')).toHaveCSS('color','rgb(36, 91, 146)');await expect(section.locator('figure[data-terminal=T1] figcaption strong')).toHaveCSS('color','rgb(161, 45, 63)');
 await expect(t2.locator('.checkpoint-schematic-reading[data-longest]')).toHaveCount(1);await expect(t2.locator('[data-checkpoint="1A"]')).toHaveAttribute('data-longest','true');
 await expect(t2.locator('[data-checkpoint="1B"]')).not.toHaveAttribute('data-longest','true');await expect(t2.locator('.checkpoint-walkers')).toHaveAttribute('aria-hidden','true');
 if(reduced){await expect(t2).toHaveAttribute('data-motion','paused');expect(await t2.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);}
 else {await expect(t2).toHaveAttribute('data-motion','running');const person=t2.locator('.checkpoint-walker').first(),initial=await person.evaluate(el=>getComputedStyle(el).transform);await expect.poll(()=>person.evaluate(el=>getComputedStyle(el).transform)).not.toBe(initial);
  const wash=await t2.locator('[data-checkpoint="1A"]').evaluate(el=>getComputedStyle(el,'::before').animationDuration);expect(wash).toBe('1.8s');
  await page.evaluate(()=>window.scrollTo(0,0));await expect(t2).toHaveAttribute('data-motion','paused');await t2.scrollIntoViewIfNeeded();await page.emulateMedia({reducedMotion:'reduce'});await expect(t2).toHaveAttribute('data-motion','paused');expect(await t2.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'});await expect(t2).toHaveAttribute('data-motion','running');await expect.poll(()=>t2.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),{timeout:6500}).toBe(0);
 }
 expect(calls.filter(p=>p==='/api/live/summary').length).toBeLessThanOrEqual(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await section.screenshot({path:`test-results/checkpoint-people-${width}-${reduced}.png`,animations:'disabled'});
});
test('old observations never animate or supply a longest wait',async({page})=>{
 const summary=structuredClone(SUMMARY_FIXTURE);summary.airport.congestion=summary.airport.congestion.map(row=>({...row,freshness:'STALE'}));
 await page.clock.setFixedTime(new Date(summary.generatedAt));await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));await page.goto('/ko');
 const section=page.locator('.home-checkpoint-waits');await section.scrollIntoViewIfNeeded();await expect(section.locator('figure[data-enhanced]')).toHaveCount(2);
 await expect(section.locator('.checkpoint-schematic-reading[data-longest]')).toHaveCount(0);for(const figure of await section.locator('figure').all()){await figure.scrollIntoViewIfNeeded();await expect(figure).toHaveAttribute('data-motion','paused');expect(await figure.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);}
});
