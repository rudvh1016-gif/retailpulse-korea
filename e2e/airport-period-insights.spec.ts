import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
const dates=Array.from({length:48},(_,i)=>new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10));
const hour=(n:number)=>Array.from({length:24},(_,h)=>h===8?n:0);
async function records(page:Page){
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 await page.route('**/api/live/airport-days*',r=>r.fulfill({json:{mode:'airport-days',date:new URL(r.request().url()).searchParams.get('date'),history:dates.map(day=>({T1:{day,total:300,hours:hour(300),complete:true},T2:{day,total:250,hours:hour(250),complete:true}})),countryDays:dates.flatMap(date=>['JP','CN'].map(country=>({country,scope:'ALL',date,complete:true,value:country==='JP'?(date>='2026-09-21'&&date<='2026-09-23'?160:150):100})))}}));
}
for(const width of [360,390,430,1440])test(`airport period comparison preserves the glance and supports two ranges ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await records(page);
 // The existing country-trend widgets also read this endpoint in the parent.
 // Count only additional requests from the new analysis document.
 let historyRequests=0;page.on('request',r=>{if(r.url().includes('/api/live/airport-days')&&r.frame().parentFrame())historyRequests++;});
 await page.goto('/ko?date=2026-10-19');
 await expect(page.getByRole('heading',{name:'인천공항 한눈에',exact:true})).toBeVisible();
 await expect(page.locator('#airport-insight-overview .focus-report')).toBeVisible();
 await expect(page.locator('.airport-period-frame')).toHaveCount(0);expect(historyRequests).toBe(0);
 await page.getByRole('tab',{name:'언제 몰렸나요?',exact:true}).click();
 const frame=page.frameLocator('.airport-period-frame');
 await expect(frame.getByText('오전·오후의 변화를 쉽게 파악해보세요')).toBeVisible();
 await frame.getByLabel('기준 기간 시작일').fill('2026-09-12');await frame.getByLabel('기준 기간 종료일').fill('2026-09-18');
 await frame.getByLabel('비교 기간 시작일').fill('2026-10-01');await frame.getByLabel('비교 기간 종료일').fill('2026-10-30');
 await frame.getByRole('button',{name:'기간 적용',exact:true}).click();
 await expect(frame.locator('#comparison-caption')).toContainText('기준 7/7일 · 비교 18/30일 포함');
 await expect(page).toHaveURL(/aStart=2026-09-12/);
 await expect(frame.locator('.series.current')).toHaveCSS('stroke','rgb(36, 73, 103)');
 await expect(frame.locator('.series.before')).toHaveCount(1);
 for(const name of ['항공편 주말이 더 많나요?','어느 터미널이 달라졌나요?','연휴에는 늘었나요?']){
  await page.getByRole('tab',{name,exact:true}).click();await expect(frame.locator('#section-title')).toHaveText(name);
  await expect(frame.getByLabel('기준 기간 시작일')).toHaveValue('2026-09-12');
 }
 expect(historyRequests).toBe(1);
 await frame.getByRole('button',{name:'일본 9/21–9/23 · 3일',exact:true}).click();
 await expect(frame.locator('.holiday-value')).toHaveText(['150편','160편']);
 await expect(frame.locator('#context-note')).toContainText('2026/9/21–9/23');
 await frame.getByRole('button',{name:'같은 기간 국가별 항공편 →',exact:true}).click();
 await expect(page).toHaveURL(/airport-countries\?mode=flights/);
 await expect(page.getByRole('tab',{name:'국가별 항공편',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.frameLocator('.airport-period-frame').getByLabel('비교 기간 시작일')).toHaveValue('2026-09-21');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('unavailable analysis can retry without substituting old embedded records',async({page})=>{
 await page.route('**/api/live/airport-days*',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto('/ko?insight=rhythm&date=2026-10-19');const frame=page.frameLocator('.airport-period-frame');
 await expect(frame.getByRole('button',{name:'다시 불러오기'})).toBeVisible();await expect(frame.locator('#panel')).toBeHidden();
 await records(page);await frame.getByRole('button',{name:'다시 불러오기'}).click();await expect(frame.locator('#panel')).toBeVisible();
});
test('More explains airport roles with compact type and notice links match the release',async({page})=>{
 await page.goto('/ko/more');const guide=page.locator('.site-usage-guide');
 await expect(guide.locator('h2')).toHaveText('누가, 어떻게 쓰면 좋을까요?');
 await expect(guide.locator('p').first()).toHaveCSS('font-size','13px');
 await guide.getByText('활용 예시',{exact:true}).click();
 await expect(guide).toContainText('판매사원·식음료 매장 근무자');await expect(guide).toContainText('영업관리자·현장 관리자');
 await guide.getByText('집계 기준 보기',{exact:true}).click();await expect(guide).toContainText('+는 신장, △는 역신장');
});
