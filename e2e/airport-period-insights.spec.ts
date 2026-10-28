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
 await expect(frame.locator('#takeaway')).toContainText('기준 대비 하루 평균 출발편');
 await expect(frame.locator('#boundary')).toContainText('비중은 하루 출발편 중 각 시간대의 비율');
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
  if(name==='항공편 주말이 더 많나요?'){
   await expect(frame.locator('#takeaway')).toContainText('출발편이 가장 많은 요일');
   await expect(frame.locator('#boundary')).toContainText('출발편 평균');
  }
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
for(const width of [360,1440])test(`airport navigation has clear aligned selections ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await records(page);await page.goto('/ko/airport');
 const terminals=page.locator('#airport-data-flow');
 await expect(terminals.getByRole('tab',{name:'T2',exact:true})).toBeVisible();
 await terminals.getByRole('tab',{name:'T2',exact:true}).click();
 await expect(terminals.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(terminals.getByRole('tab',{name:'T2',exact:true})).toHaveCSS('border-bottom-color','rgb(52, 91, 123)');
 const nav=page.locator('.airport-context-nav');await nav.getByRole('button',{name:'항공편',exact:true}).click();
 await expect(nav.getByRole('button',{name:'항공편',exact:true})).toHaveAttribute('aria-current','page');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('당일 비교 uses an explicitly provisional snapshot and one chosen baseline day',async({page})=>{
 let chunks=0;page.on('request',request=>{if(/\/airport-period\/today-[a-f0-9]+\.js/.test(request.url()))chunks++;});
 await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+09:00'));await records(page);
 await page.goto('/ko?insight=rhythm&date=2026-10-19');const frame=page.frameLocator('.airport-period-frame');
 await expect(frame.locator('#panel')).toBeVisible();expect(chunks).toBe(0);
 await frame.getByRole('button',{name:'당일 비교',exact:true}).click();await expect.poll(()=>chunks).toBe(1);
 await expect(frame.locator('#comparison-caption')).toContainText('당일 미확정');
 await expect(frame.getByLabel('비교 기간 시작일')).toHaveValue('2026-10-19');
 await frame.getByLabel('오늘과 비교할 날짜').fill('2026-10-05');
 await expect(frame.getByLabel('기준 기간 시작일')).toHaveValue('2026-10-05');
 await expect(frame.getByLabel('기준 기간 종료일')).toHaveValue('2026-10-05');
});
test('당일 비교 refuses truncated data',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+09:00'));await records(page);
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{...flights,truncated:true}}));
 await page.goto('/ko?insight=rhythm&date=2026-10-19');const frame=page.frameLocator('.airport-period-frame');
 await frame.getByRole('button',{name:'당일 비교',exact:true}).click();
 await expect(frame.locator('#range-error')).toContainText('오늘 항공편을 확인하지 못했습니다');
});
test('항공사 이전은 정확한 전후 날짜를 넣고 빈 과거 자료를 0으로 취급하지 않는다',async({page})=>{
 await records(page);
 await page.route('**/api/live/airport-days*',r=>new URL(r.request().url()).searchParams.get('date')==='2026-02-11'?r.fulfill({json:{mode:'airport-days',date:'2026-02-11',history:[],countryDays:[]}}):r.fallback());
 await page.goto('/ko?insight=terminal&date=2026-10-19');const frame=page.frameLocator('.airport-period-frame');
 await frame.getByRole('button',{name:'아시아나 · 2026/01/14'}).click();
 await expect(frame.getByLabel('기준 기간 시작일')).toHaveValue('2025-12-17');
 await expect(frame.getByLabel('비교 기간 종료일')).toHaveValue('2026-02-10');
 await expect(frame.locator('#finding-title')).toHaveText('양쪽 기간의 기록이 필요합니다');
 await expect(frame.getByRole('link',{name:'이전 공지 확인 ↗'})).toBeVisible();
});
test('More explains airport roles with compact type and notice links match the release',async({page})=>{
 await page.goto('/ko/more');const guide=page.locator('.site-usage-guide');
 await expect(guide.locator('h2')).toHaveText('누가, 어떻게 쓰면 좋을까요?');
 await expect(guide.locator('p').first()).toHaveCSS('font-size','13px');
 const airportGuideButton=page.locator('.more-section-links').getByRole('button',{name:'인천공항 이용 방법'});
 await expect(airportGuideButton).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(airportGuideButton).toHaveCSS('border-bottom-width','1px');
 await airportGuideButton.click();
 await expect(guide.locator('#airport-usage-guide')).toHaveAttribute('open','');
 for(const name of ['공항한눈에','공항현황','국가별 흐름','미리 준비'])await expect(guide.getByRole('link',{name,exact:true})).toBeVisible();
 await guide.getByText('활용 예시',{exact:true}).click();
 await expect(guide).toContainText('판매사원·식음료 매장 근무자');await expect(guide).toContainText('영업관리자·현장 관리자');
 await guide.getByText('집계 기준 보기',{exact:true}).click();await expect(guide).toContainText('+는 신장, △는 역신장');
});
test('소개 prioritizes airport staff and explains change symbols',async({page})=>{
 await page.goto('/ko/about');
 await expect(page.getByRole('heading',{name:'인천공항의 흐름을 한눈에'})).toBeVisible();
 await expect(page.locator('.about-sections')).toContainText('파란색 +는 신장, 빨간색 △는 역신장');
 await expect(page.locator('.about-sections')).toContainText('목적지 국가는 승객 국적이 아닙니다');
});
