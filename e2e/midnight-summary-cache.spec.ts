import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';
test('default summary URL separates KST days without overriding the server day',async({page})=>{
 await page.clock.install({time:new Date('2026-10-09T14:59:00Z')});let currentDay='2026-10-09';const urls:string[]=[];
 await page.route('**/api/live/summary*',route=>{const url=new URL(route.request().url());urls.push(url.searchParams.has('date')?'explicit:'+url.searchParams.get('date'):url.searchParams.get('_day')??'default');const d=structuredClone(SUMMARY_FIXTURE) as LiveSummary;d.todayKst=d.serviceDateKst=currentDay;d.generatedAt=currentDay==='2026-10-09'?'2026-10-09T14:59:00Z':'2026-10-09T15:00:01Z';return route.fulfill({json:d});});
 await page.goto('/ko/airport');await expect.poll(()=>urls.includes('default')).toBe(true);expect(urls[0]).toBe('default');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.clock.pauseAt(new Date('2026-10-09T14:59:59Z'));currentDay='2026-10-10';await page.clock.runFor(2100);await expect.poll(()=>urls.includes('2026-10-10')).toBe(true);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
