import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import calendarSeed from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
import calendarManual from '../data/official-calendar/priority-country-multiyear.json' with {type:'json'};
const calendar={events:[...calendarSeed.events.filter(e=>e.country!=='CN'),...calendarManual.events],sources:[],calendarCoverage:[{country:'CN',year:2026,scope:'national',verifiedAt:calendarManual.checkedOn}]};
const dates=Array.from({length:48},(_,i)=>new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10));
const hour=(n:number)=>Array.from({length:24},(_,h)=>h===8?n:0);
for(const [label,path,heading] of [['공항한눈에','/ko','인천공항 한눈에'],['공항현황','/ko/airport','인천공항'],['국가별 흐름','/ko/airport-countries','국가별 흐름'],['미리 준비','/ko/airport-prepare','미리 준비']] as const)test(`인천공항 이용 방법 링크 이동: ${label}`,async({page})=>{
 await page.goto('/ko/more');
 await expect(async()=>{await page.getByRole('button',{name:'인천공항 이용 방법'}).click();await expect(page.getByTestId('airport-usage-guide')).toHaveAttribute('open','',{timeout:500});}).toPass();
 await page.getByTestId('airport-usage-guide').getByRole('link',{name:label,exact:true}).click();
 await expect.poll(()=>new URL(page.url()).pathname).toBe(path);
 await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();
});
async function records(page:Page){
 await page.route('**/api/airport/calendar',r=>r.fulfill({json:calendar}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 const countryDays=dates.flatMap(date=>['JP','CN'].filter(country=>country!=='CN'||date!=='2026-10-07').map(country=>({country,scope:'ALL',date,complete:true,value:country==='JP'?(date>='2026-09-21'&&date<='2026-09-23'?160:150):100})));
 await page.route('**/api/live/airport-days*',r=>r.fulfill({json:{mode:'airport-days',date:new URL(r.request().url()).searchParams.get('date'),history:dates.map(day=>({T1:{day,total:300,hours:hour(300),complete:true},T2:{day,total:250,hours:hour(250),complete:true}})),countryDays,countryDaysByTerminal:{T1:countryDays.map(row=>({...row,scope:'T1',value:row.value-40})),T2:countryDays.map(row=>({...row,scope:'T2',value:40}))}}}));
}
for(const width of [320,1440])test(`country comparison switches actual terminal records and shows flags ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await records(page);await page.goto('/ko/airport-countries?mode=flights&date=2026-10-19');
 const frame=page.frameLocator('.airport-period-frame'),scope=frame.getByRole('group',{name:'터미널 선택'});
 await expect(scope.getByRole('button',{name:'전체'})).toHaveAttribute('aria-pressed','true');
 await expect(frame.locator('.country-pairs .country-flag').first()).toBeVisible();
 await scope.getByRole('button',{name:'T2'}).click();
 await expect(scope.getByRole('button',{name:'T2'})).toHaveAttribute('aria-pressed','true');
 await expect(frame.locator('#boundary')).toContainText('T2');
 await expect(frame.locator('.country-pairs').first()).toContainText('40');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const width of [360,390,430,1440])test(`airport period comparison preserves the glance and supports two ranges ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await records(page);
 // The existing country-trend widgets also read this endpoint in the parent.
 // Count only additional requests from the new analysis document.
 let historyRequests=0;page.on('request',r=>{if(r.url().includes('/api/live/airport-days')&&r.frame().parentFrame())historyRequests++;});
 await page.goto('/ko?date=2026-10-19');
 await expect(page.getByRole('heading',{name:'인천공항 한눈에',exact:true})).toBeVisible();
 await expect(page.locator('#airport-insight-overview .focus-report')).toBeVisible();
 await expect(page.locator('.airport-period-frame')).toHaveCount(0);expect(historyRequests).toBe(0);
 await expect(async()=>{const tab=page.getByRole('tab',{name:'언제 몰렸나요?',exact:true});await tab.click();await expect(tab).toHaveAttribute('aria-selected','true',{timeout:500});}).toPass();
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
 await frame.getByRole('button',{name:/일본 09\/21.*09\/23/ }).click();
 await expect(frame.locator('.holiday-value')).toHaveText(['150편','160편']);
 await expect(frame.locator('#takeaway')).toContainText('포함일수');
 await expect(frame.locator('#boundary')).toContainText('연휴의 인과 효과');
 await expect(frame.locator('#holiday-calendar-context')).toContainText('경로의 날');
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
 await expect(async()=>{const tab=terminals.getByRole('tab',{name:'T2',exact:true});await tab.click();await expect(tab).toHaveAttribute('aria-selected','true',{timeout:500});}).toPass();
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
for(const width of [360,1440])test(`CN holiday overlap and independent flight coverage stay visible ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1100});await records(page);
 await page.goto('/airport-period/frame.html?date=2026-10-19&view=holiday');
 await page.locator('[data-holiday="CN"]').filter({hasText:'10/01'}).click();
 const context=page.locator('#holiday-calendar-context'),before=context.locator('[data-period="previous"]'),after=context.locator('[data-period="current"]');
 await expect(before).toContainText('중추절');await expect(before).toContainText('2026-09-25~2026-09-27');
 await expect(before).toContainText('항공편 수집 7/7일');await expect(after).toContainText('항공편 수집 6/7일');
 await expect(before).toContainText('한국 출발지 참고');await expect(before).toContainText('추석');
 await expect(context).not.toContainText('경로의 날');await expect(context).toContainText('색은 휴일 여부를 뜻하지 않습니다');
 await expect(page.locator('#context-note')).toContainText('수집일이 부족');
 await expect(before.getByRole('link',{name:'공식 출처'})).toHaveAttribute('href',/beijing.gov.cn/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`holiday-overlap-${width}.png`),fullPage:true});
});
test('failed calendar leaves flights visible and says unknown, never no holidays',async({page})=>{
 await records(page);await page.route('**/api/airport/calendar',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto('/airport-period/frame.html?date=2026-10-19&view=holiday');
 await expect(page.locator('.holiday-value')).toHaveCount(2);
 await expect(page.locator('#holiday-calendar-context')).toContainText('자료 미확인');
 await expect(page.locator('#holiday-suggestions')).toContainText('확인된 연휴 추천 자료 없음');
 await expect(page.locator('#holiday-calendar-context')).not.toContainText('조정 휴무 없음');
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

for(const width of [320,390,1440])test(`mobile airport controls and country heading remain compact ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date(summary.generatedAt));await records(page);
 // Return the requested service date rather than relabelling the captured past day as today.
 await page.route('**/api/live/summary*',r=>{const date=new URL(r.request().url()).searchParams.get('date')??summary.todayKst;return r.fulfill({json:{...summary,serviceDateKst:date,dayRelation:date===summary.todayKst?'TODAY':date<summary.todayKst?'PAST':'FUTURE',airport:{...summary.airport,serviceDateKst:date}}});});
 await page.goto('/ko/airport');
 const terminal=page.locator('#airport-data-flow > button');
 const nav=page.locator('.airport-context-nav > button');
 const days=page.locator('.airport-date-reserved .date-nav-shortcuts > button');
 await expect(terminal).toHaveCount(4);await expect(nav).toHaveCount(5);await expect(days).toHaveCount(3);
 if(width<=600){
  for(const button of [...await terminal.all(),...await nav.all(),...await days.all()]){
   expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
   await expect(button).toHaveCSS('text-align','left');
  }
  await expect(terminal.first()).toHaveCSS('font-size','11px');
  await expect(nav.first()).toHaveCSS('font-size','11px');
  await expect(days.first()).toHaveCSS('font-size','12px');
 }
 await days.last().click();await expect(days.last()).toHaveAttribute('aria-pressed','true');
 await page.goto('/ko/airport-countries?date=2026-10-19');
 const heading=page.getByTestId('daily-country-heading');await expect(heading).toBeVisible();
 if(width<=600){
  const lines=await heading.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return new Set(Array.from(range.getClientRects(),rect=>Math.round(rect.top))).size});
  expect(lines).toBe(1);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await heading.screenshot({path:info.outputPath(`country-heading-${width}.png`)});
});

// Owner mobile alignment regression: these widths straddle both phone gutters.
for(const width of [320,360,365,390,430,600,700])test(`phone heading menu terminal and date share briefing text edge ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await records(page);
 await page.goto('/ko?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const report=page.locator('.focus-report'),tabs=page.locator('.airport-insight-tabs:not(.country-tabs)'),controls=page.locator('.glance-controls');
 await expect(report).toBeVisible();await expect(controls.locator('.glance-date-control')).toBeVisible();
 const edges=await page.evaluate(()=>{
  const textLeft=(selector:string)=>{const element=document.querySelector(selector)!;const range=document.createRange();range.selectNodeContents(element);return range.getBoundingClientRect().x;};
  return {heading:textLeft('.airport-insight-shell>.glance-heading h1'),menu:textLeft('.airport-insight-tabs:not(.country-tabs) button:first-child'),terminal:textLeft('.glance-controls>div button:first-child'),date:document.querySelector('.glance-date-control')!.getBoundingClientRect().x,report:document.querySelector('.focus-report')!.getBoundingClientRect().x+parseFloat(getComputedStyle(document.querySelector('.focus-report')!).paddingLeft)+parseFloat(getComputedStyle(document.querySelector('.focus-report')!).borderLeftWidth)};
 });
 for(const edge of [edges.heading,edges.menu,edges.terminal,edges.date])expect(Math.abs(edge-edges.report)).toBeLessThanOrEqual(1.5);
 const card=(await report.boundingBox())!;expect(card.x).toBeCloseTo(8,0);expect(card.x+card.width).toBeCloseTo(width-8,0);
 await expect(report.locator('.focus-metric-total').first()).toHaveCSS('font-size',width<=600?'20px':'24px');
 const first=controls.locator('div>button').first();expect((await first.boundingBox())!.width).toBeGreaterThanOrEqual(44);expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await tabs.getByRole('tab').first().focus();await page.keyboard.press('End');await expect(tabs.getByRole('tab').last()).toBeFocused();await page.keyboard.press('Home');await expect(report).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`phone-alignment-${width}.png`),fullPage:true});
});
for(const width of [320,360,390,430,700])test(`country phone tabs remain one reachable row ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});await records(page);await page.goto('/ko/airport-countries?mode=zones&date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const tabs=page.locator('.country-tabs'),buttons=tabs.getByRole('tab');await expect(buttons).toHaveCount(3);
 const boxes=await buttons.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);return {y:b.y,width:b.width,height:b.height,textHeight:range.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(node).lineHeight)};}));
 for(const box of boxes){expect(box.y).toBe(boxes[0].y);expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.textHeight).toBeLessThanOrEqual(box.lineHeight+1);}
 await buttons.first().focus();await page.keyboard.press('End');await expect(buttons.last()).toBeFocused();await expect(buttons.last()).toHaveAttribute('aria-selected','true');
 const last=(await buttons.last().boundingBox())!,strip=(await tabs.boundingBox())!;expect(last.x).toBeGreaterThanOrEqual(strip.x-1);expect(last.x+last.width).toBeLessThanOrEqual(strip.x+strip.width+1);
 await page.keyboard.press('Home');await expect(buttons.first()).toHaveAttribute('aria-selected','true');
 await buttons.nth(1).click();await expect(buttons.nth(1)).toHaveAttribute('aria-selected','true');await buttons.first().click();await expect(buttons.first()).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`country-phone-row-${width}.png`),fullPage:true});
});
for(const lang of ['en','zh','ja'])test(`localized phone glance uses the same card text edge ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:1000});await records(page);await page.goto(`/${lang}?date=2026-10-19`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.focus-report')).toBeVisible();
 const edges=await page.evaluate(()=>{const report=document.querySelector('.focus-report')!,style=getComputedStyle(report);return {date:document.querySelector('.glance-date-control')!.getBoundingClientRect().x,heading:document.querySelector('.glance-heading h1')!.getBoundingClientRect().x,report:report.getBoundingClientRect().x+parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth)};});
 expect(Math.abs(edges.date-edges.report)).toBeLessThanOrEqual(1.5);expect(Math.abs(edges.heading-edges.report)).toBeLessThanOrEqual(1.5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const width of [320,360,390,600])test(`airport phone date shortcuts share the terminal text edge ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await records(page);await page.goto('/ko/airport?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const dateButtons=page.locator('.airport-date-reserved .date-nav-shortcuts > button');await expect(dateButtons).toHaveCount(3);
 const edges=await page.evaluate(()=>{const text=(selector:string)=>{const range=document.createRange();range.selectNodeContents(document.querySelector(selector)!);return range.getBoundingClientRect().x;};return {terminal:text('#airport-data-flow>button:first-child'),date:text('.airport-date-reserved .date-nav-shortcuts>button:first-child')};});
 expect(Math.abs(edges.date-edges.terminal)).toBeLessThanOrEqual(1.5);
 for(const button of await dateButtons.all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await dateButtons.last().click();await expect(dateButtons.last()).toHaveAttribute('aria-pressed','true');await dateButtons.first().click();await expect(dateButtons.first()).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const width of [701,1024,1440])test(`desktop keeps deployed airport gutters and country grid ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});await records(page);await page.goto('/ko?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.airport-insight-shell')).toHaveCSS('padding-left','24px');
 await expect(page.locator('.airport-insight-tabs:not(.country-tabs)')).toHaveCSS('display','grid');
 await page.screenshot({path:testInfo.outputPath(`desktop-glance-unchanged-${width}.png`),fullPage:true});
 await page.goto('/ko/airport-countries?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.locator('.country-tabs')).toHaveCSS('display','grid');
 const columns=await page.locator('.country-tabs').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').map(Number.parseFloat));expect(columns).toHaveLength(3);expect(Math.max(...columns)-Math.min(...columns)).toBeLessThanOrEqual(1);
 await page.screenshot({path:testInfo.outputPath(`desktop-country-unchanged-${width}.png`),fullPage:true});
});

for(const width of [320,390,430])test(`phone glance arrows reveal all menus without selecting tabs ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await records(page);
 await page.goto('/ko?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const strip=page.locator('#airport-glance-tabs'),next=page.getByRole('button',{name:'다음 메뉴 보기',exact:true}),previous=page.getByRole('button',{name:'이전 메뉴 보기',exact:true}),buttons=strip.getByRole('tab');
 await expect(next).toBeVisible();await expect(next).toBeEnabled();await expect(previous).toHaveCount(0);
 const url=page.url(),initial=await strip.evaluate(node=>node.scrollLeft),target=(await next.boundingBox())!;expect(target.width).toBeGreaterThanOrEqual(44);expect(target.height).toBeGreaterThanOrEqual(44);
 await next.focus();await page.keyboard.press('Enter');await expect.poll(()=>strip.evaluate(node=>node.scrollLeft)).toBeGreaterThan(initial);await expect(buttons.first()).toHaveAttribute('aria-selected','true');expect(page.url()).toBe(url);
 await expect(previous).toBeVisible();const forwardOffset=await strip.evaluate(node=>node.scrollLeft);await previous.focus();await page.keyboard.press('Space');await expect.poll(()=>strip.evaluate(node=>node.scrollLeft)).toBeLessThan(forwardOffset);
 for(let i=0;i<8;i++){const before=await strip.evaluate(node=>node.scrollLeft);if(before<=1)break;await previous.click();await expect.poll(()=>strip.evaluate(node=>node.scrollLeft)).toBeLessThan(before);}await expect.poll(()=>strip.evaluate(node=>node.scrollLeft)).toBe(0);await expect(next).toBeFocused();
 for(let i=0;i<8;i++){const before=await strip.evaluate(node=>node.scrollLeft),remaining=await strip.evaluate(node=>node.scrollWidth-node.clientWidth-node.scrollLeft);if(remaining<=1)break;await expect(next).toBeEnabled();await next.click();await expect.poll(()=>strip.evaluate(node=>node.scrollLeft)).toBeGreaterThan(before);}await expect(next).toBeDisabled();
 const last=(await buttons.last().boundingBox())!,box=(await strip.boundingBox())!;expect(last.x).toBeGreaterThanOrEqual(box.x-1);expect(last.x+last.width).toBeLessThanOrEqual(box.x+box.width+1);
 await page.screenshot({path:testInfo.outputPath(`phone-nav-arrow-end-${width}.png`),fullPage:true});
 for(let i=0;i<8;i++){const before=await strip.evaluate(node=>node.scrollLeft);if(before<=1)break;await previous.click();await expect.poll(()=>strip.evaluate(node=>node.scrollLeft)).toBeLessThan(before);}await expect.poll(()=>strip.evaluate(node=>node.scrollLeft)).toBe(0);await expect(next).toBeEnabled();await expect(previous).toHaveCount(0);await expect(next).toBeFocused();
 // Existing swipe/trackpad scroll, selected tabs and history remain independent of the arrow buttons.
 await strip.evaluate(node=>{node.scrollLeft=120;});await expect(previous).toBeVisible();
 await buttons.first().focus();await page.keyboard.press('End');await expect(buttons.last()).toBeFocused();await expect(buttons.last()).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Home');await expect(buttons.first()).toHaveAttribute('aria-selected','true');await expect(page.locator('.focus-report')).toBeVisible();
 await buttons.nth(1).click();await expect(buttons.nth(1)).toHaveAttribute('aria-selected','true');await page.goBack();await expect(buttons.first()).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`phone-nav-arrow-start-${width}.png`),fullPage:true});
});
test('phone glance hides arrows when all menus fit at 700px',async({page},testInfo)=>{
 await page.setViewportSize({width:700,height:1000});await records(page);await page.goto('/ko?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const strip=page.locator('#airport-glance-tabs');await expect(strip).toHaveCSS('display','flex');await expect(strip.getByRole('tab')).toHaveCount(5);
 expect(await strip.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);await expect(page.locator('.airport-insight-scroll')).toHaveCount(0);
 const box=(await strip.boundingBox())!,last=(await strip.getByRole('tab').last().boundingBox())!;expect(last.x+last.width).toBeLessThanOrEqual(box.x+box.width+1);
 await page.screenshot({path:testInfo.outputPath('phone-nav-no-overflow-700.png'),fullPage:true});
});
for(const width of [701,1440])test(`desktop glance arrow controls stay hidden ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await records(page);await page.goto('/ko?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('#airport-glance-tabs')).toHaveCSS('display','grid');await expect(page.locator('.airport-insight-scroll:visible')).toHaveCount(0);
});
for(const width of [390,1440])test(`empty comparison copy stays small without shrinking headings ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});await records(page);await page.route('**/api/live/airport-months*',r=>r.fulfill({json:{...months,months:[],data:{...months.data,months:[]}}}));
 await page.goto('/ko?date=2026-10-19');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const copy=page.locator('.focus-country-change-empty');await expect(copy).toHaveText('표시할 비교 항목이 없습니다.');await expect(copy).toHaveCSS('font-size','12px');
 expect(await copy.evaluate(node=>parseFloat(getComputedStyle(node.previousElementSibling!).fontSize))).toBeGreaterThan(12);
 await page.screenshot({path:testInfo.outputPath(`empty-comparison-copy-${width}.png`),fullPage:true});
});
