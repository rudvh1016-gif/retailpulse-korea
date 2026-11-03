import {test,expect} from '@playwright/test';
const ranges='view=weekday&date=2026-11-03&aStart=2026-10-01&aEnd=2026-10-31&bStart=2026-11-01&bEnd=2026-11-02';
const record=(day:string,total=24,complete=true)=>({T1:{day,total,complete,hours:Array.from({length:24},(_,i)=>i===0?total:0)},T2:{day,total,complete,hours:Array.from({length:24},(_,i)=>i===0?total:0)}});
for(const width of [390,1440])test(`weekday reasons and samples at month start ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});
 await page.route('**/api/live/airport-days*',r=>r.fulfill({json:{mode:'airport-days',date:'2026-11-03',history:[record('2026-10-05'),record('2026-11-01'),record('2026-11-02',0)]}}));
 await page.goto('/airport-period/frame.html?'+ranges);
 await expect(page.locator('#chart')).toContainText('일수는 날짜가 아닌 평균에 사용한 표본 수');
 const rows=page.locator('#chart tbody tr');
 await expect(rows.nth(0)).toContainText('0편/일');await expect(rows.nth(0)).toContainText('일부 날짜 자료 미수집');
 await expect(rows.nth(1)).toContainText('선택 기간에 해당 요일 없음');
 await expect(rows.nth(1)).toContainText('완료 수집 자료 없음');
 await expect(page.locator('.weekday-samples').first()).toContainText('기준 1일');
 await page.locator('[data-weekday="1"]').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#selection')).toContainText('선택 기간에 해당 요일 없음');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`../weekday-local-${width}.png`,fullPage:true});
});
test('empty and incomplete history explain missing records without zero filling',async({page})=>{
 await page.route('**/api/live/airport-days*',r=>r.fulfill({json:{mode:'airport-days',date:'2026-11-03',history:[record('2026-11-01',24,false)]}}));
 await page.goto('/airport-period/frame.html?'+ranges);
 await expect(page.locator('#chart')).toContainText('완료 수집 자료 없음');
 await expect(page.locator('#chart')).not.toContainText('0편/일');
});
test('history API failure offers retry without showing historical values as current',async({page})=>{
 await page.route('**/api/live/airport-days*',r=>r.fulfill({status:503,body:'unavailable'}));
 await page.goto('/airport-period/frame.html?'+ranges);
 await expect(page.getByRole('button',{name:'다시 불러오기'})).toBeVisible();
 await expect(page.locator('.weekday-chart')).toHaveCount(0);
});
