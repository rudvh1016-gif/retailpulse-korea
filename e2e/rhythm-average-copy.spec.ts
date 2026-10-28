import {test,expect} from '@playwright/test';
for(const width of [320,390,430,1440])test(`selected full-day departure averages state dates and included denominator ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const dates=['2026-09-01','2026-09-03','2026-10-01'];
 await page.route('**/api/airport/calendar',r=>r.fulfill({json:{events:[]}}));
 await page.route('**/api/live/airport-days*',r=>r.fulfill({json:{mode:'airport-days',date:'2026-10-19',history:dates.map((day,i)=>({T1:{day,total:i?300:100,hours:Array.from({length:24},(_,h)=>h===8?(i?300:100):0),complete:true},T2:{day,total:50,hours:Array.from({length:24},(_,h)=>h===8?50:0),complete:true}})),countryDays:[]}}));
 await page.goto('/airport-period/frame.html?date=2026-10-19&aStart=2026-09-01&aEnd=2026-09-30&bStart=2026-10-01&bEnd=2026-10-27');
 const cards=page.locator('.rhythm-average');await expect(cards).toHaveCount(2);
 await expect(cards.first().locator(':scope > span')).toHaveText('9월 하루 평균 출발편');await expect(cards.last().locator(':scope > span')).toHaveText('10/1–10/27 하루 평균 출발편');
 await expect(cards.first().locator('strong')).toHaveText('250편/일');await expect(cards.last().locator('strong')).toHaveText('350편/일');
 await expect(cards.first().locator('.metric-period')).toHaveText('기준 · 2026-09-01–2026-09-30 · 포함 2/30일');await expect(cards.first().locator('.metric-basis')).toHaveText('공항 전체 · 24시간 출발편 합계 ÷ 포함 2일');
 await page.getByRole('button',{name:'T2',exact:true}).click();await expect(cards.first().locator('strong')).toHaveText('50편/일');await expect(cards.first().locator('.metric-basis')).toHaveText('T2 · 24시간 출발편 합계 ÷ 포함 2일');
 await page.getByLabel('기준 기간 시작일').fill('2026-09-03');await page.getByLabel('기준 기간 종료일').fill('2026-09-03');await page.getByRole('button',{name:'기간 적용',exact:true}).click();await expect(cards.first().locator(':scope > span')).toHaveText('9/3 하루 평균 출발편');await expect(cards.first().locator('.metric-period')).toContainText('포함 1/1일');
 for(const card of await cards.all())await expect(card).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
