import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {checkpointMethodCopy,checkpointTimingCopy} from '../lib/checkpoint-method-copy';

for(const lang of ['ko','en','zh','ja'])for(const width of [390,1440])test(`failed and future checkpoint observations stay qualified ${lang} ${width}`,async({page})=>{
 const summary=structuredClone(SUMMARY_FIXTURE),now=Date.parse(summary.generatedAt),base=summary.airport.congestion[0];
 const prior=new Date(now-5*60_000).toISOString(),future=new Date(now+60_000).toISOString();
 summary.airport.congestion=[{...base,terminal:'T1',zone:'DG2_E',observedAt:prior,waitTimeMinutes:15,waitTimeRaw:'15',freshness:'STALE',collectionStatus:'FAILED'},
  {...base,terminal:'T2',zone:'DG1_A',observedAt:future,waitTimeMinutes:40,waitTimeRaw:'40',freshness:'LIVE'}] as typeof summary.airport.congestion;
 await page.clock.setFixedTime(new Date(now));await page.setViewportSize({width,height:1000});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));await page.goto(`/${lang}`);
 const section=page.locator('.home-checkpoint-waits');await section.scrollIntoViewIfNeeded();
 await expect(section).toContainText(checkpointMethodCopy(lang));await expect(section).toContainText(checkpointTimingCopy(lang));
 const t1=section.locator('figure[data-terminal=T1]'),t2=section.locator('figure[data-terminal=T2]');
 await expect(t1.locator('[data-checkpoint="2E"]')).toHaveAttribute('data-state','failed');
 await expect(t1.locator('[data-checkpoint="2E"] strong')).toContainText('15');
 await expect(t1.locator('.checkpoint-observation-heading')).toContainText(({ko:'수집 실패',en:'Collection failed',zh:'采集失败',ja:'収集失敗'})[lang]!);
 await expect(t2.locator('[data-checkpoint="1A"]')).toHaveAttribute('data-state','unavailable');
 await expect(t2.locator('[data-checkpoint="1A"] strong')).toHaveText('—');
 await expect(section.locator('.checkpoint-schematic-reading[data-longest]')).toHaveCount(0);
 for(const figure of [t1,t2]){await figure.scrollIntoViewIfNeeded();await expect(figure).toHaveAttribute('data-motion','paused');}
 await t2.locator('summary').click();await expect(t2.locator('time')).toHaveAttribute('dateTime',future);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('an already-open checkpoint view ages out without fetching again',async({page})=>{
 const summary=structuredClone(SUMMARY_FIXTURE),now=Date.parse(summary.generatedAt),base=summary.airport.congestion[0];
 summary.airport.congestion=[{...base,terminal:'T1',zone:'DG2_E',observedAt:new Date(now-19*60_000-30_000).toISOString(),waitTimeMinutes:15,waitTimeRaw:'15',freshness:'LIVE'}];
 await page.clock.install({time:new Date(now)});let requests=0;
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));await page.route('**/api/live/summary*',r=>{requests++;return r.fulfill({json:summary});});
 await page.goto('/en');const section=page.locator('.home-checkpoint-waits');await section.scrollIntoViewIfNeeded();const figure=section.locator('figure[data-terminal=T1]');await figure.scrollIntoViewIfNeeded();
 await expect(figure.locator('[data-checkpoint="2E"]')).toHaveAttribute('data-state','current');
 const before=requests;await page.clock.fastForward(61_000);
 await expect(figure.locator('[data-checkpoint="2E"]')).toHaveAttribute('data-state','stale');
 await expect(figure.locator('[data-checkpoint="2E"] .checkpoint-reading-status')).toHaveText('Prior');
 await expect(figure).toHaveAttribute('data-motion','paused');expect(requests).toBe(before);
});
