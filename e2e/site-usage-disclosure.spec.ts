import {test,expect,type Locator} from '@playwright/test';
import calendar from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
// Visibility alone does not mean the touch target clears a fixed bottom menu.
// Scroll as a user can, then prove the actual target is unobstructed before native tap.
async function tapClearSummary(toggle:Locator){
 await toggle.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
 await expect.poll(()=>toggle.evaluate(node=>{
  const box=node.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
  const hit=document.elementFromPoint(x,y),nav=document.querySelector('nav.bottom-nav.glass-nav');
  const navTop=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().top:innerHeight;
  return box.top>=0&&box.bottom<navTop&&!!hit&&(hit===node||node.contains(hit));
 }),{message:'native summary tap target is inside viewport, above fixed navigation and unobstructed'}).toBe(true);
 await toggle.tap();
}

test.use({hasTouch:true,isMobile:true});
for(const lang of ['ko','en','zh','ja'])test(`${lang}: More optional explanations open and close natively while limits remain visible`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.goto(`/${lang}/more`);
 const guide=page.locator('.site-usage-guide');
 await expect(guide.locator('.site-usage-limit')).toBeVisible();
 await expect(guide.locator('h3')).toHaveCount(1);
 for(const id of ['usage-examples','usage-method','usage-updates']){
  const details=guide.getByTestId(id),toggle=details.locator('summary');
  await expect(details).not.toHaveAttribute('open','');
  await expect(details.locator(id==='usage-examples'?'dl':'p').first()).toBeHidden();
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open','');
  await expect(details.locator(id==='usage-examples'?'dl':'p').first()).toBeVisible();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.focus();await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open','');
  await toggle.tap();await expect(details).toHaveAttribute('open','');
  await toggle.tap();await expect(details).not.toHaveAttribute('open','');
 }
 await expect(guide.locator('.site-usage-limit')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const lang of ['ko','en','zh','ja'])for(const motion of ['reduce','no-preference'] as const)test(`${lang} ${motion}: monthly retrospective calendar is optional, with the qualification always visible`,async({page})=>{
 await page.setViewportSize({width:320,height:844});await page.emulateMedia({reducedMotion:motion});
 // Complete read fixtures: no late live/local API result may reflow the target.
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/airport-passenger-comparison*',route=>{
  const query=new URL(route.request().url()).searchParams,selectedMonth=query.get('selected')!,baselineMonth=query.get('baseline')!;
  const stored=[passengerStats.current.ROUTE_COUNTRY_PASSENGERS,passengerStats.previous.ROUTE_COUNTRY_PASSENGERS];
  const selected=stored.find(item=>item.month===selectedMonth)??null,baseline=stored.find(item=>item.month===baselineMonth)??null;
  return route.fulfill({json:{status:selected&&baseline?'READY':'PARTIAL',selectedMonth,baselineMonth,selected,baseline,availableMonths:stored.map(item=>item.month)}});
 });
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 const calendarEvents=calendar.events.filter(event=>event.verifiedAt<=summary.todayKst);
 expect(new Date(Date.parse(summary.generatedAt)+9*60*60*1000).toISOString().slice(0,10)).toBe(summary.todayKst);
 expect(calendarEvents.every(event=>event.verifiedAt<=summary.todayKst)).toBe(true);
 expect(calendarEvents.find(event=>event.country==='CN'&&event.start==='2026-09-25')?.end).toBe('2026-09-27');
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{status:'PARTIAL',events:calendarEvents,calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:passengerStats}));
 await page.goto(`/${lang}/airport-countries?mode=passengers&date=2026-10-19`);
 const context=page.locator('.focus-trend-context[data-country="CN"] .focus-calendar-context');
 const details=context.getByTestId('monthly-calendar-reference'),toggle=details.locator('summary');
 const local=(ko:string,zh:string)=>lang==='zh'?zh:ko;
 const qualificationText=local('일정 참고 · 증감 원인 단정 불가 · 한국 일정은 출발지 기준','日程参考 · 不能断定增减原因 · 韩国日程按出发地提供');
 const qualification=context.getByText(qualificationText,{exact:true});
 await expect(toggle).toHaveText(({ko:'일정 근거',en:'Comparison-period calendar · official sources',zh:'比较期间日程 · 官方依据',ja:'比較期間の日程・公式根拠'} as Record<string,string>)[lang]);
 await expect(qualification).toHaveCount(1);
 await expect(qualification).toHaveText(qualificationText);
 await expect(qualification).toBeVisible();
 await expect(details).not.toHaveAttribute('open','');
 await expect(context.locator('[data-calendar-role]').first()).toBeVisible();
 // Four verified records remain; two regional summer breaks share one country/season heading.
 await expect(context.locator('[data-calendar-role] b')).toHaveCount(3);
 for(const [role,text] of [
  ['route',local('중국 · 중추절 2026-09-25–2026-09-27','中国 · 中秋节 2026-09-25–2026-09-27')],
  ['origin',local('한국 · 여름방학 2026-07-28–2026-08-19','韩国 · 暑假 2026-07-28–2026-08-19')],
 ])await expect(context.locator(`[data-calendar-role="${role}"]`).filter({hasText:text})).toBeVisible();
 const summer=context.locator('[data-vacation-group="CN"]');
 await expect(summer).toHaveCount(1);await expect(summer.locator('b')).toHaveText(local('여름방학','暑假'));
 await expect(summer.locator('.focus-vacation-period')).toHaveText([local('2026-07-01–2026-08-31 · 상하이 초·중등학교 · 직전 월','2026-07-01–2026-08-31 · 上海市中小学 · 上个月'),local('2026-07-08–2026-08-31 · 베이징 의무교육 학교 · 직전 월','2026-07-08–2026-08-31 · 北京市义务教育学校 · 上个月')]);
 await expect(details.locator(':scope > ul')).toBeHidden();
 await toggle.focus();await page.keyboard.press('Enter');
 await expect(details.locator(':scope > ul')).toBeVisible();
 await expect(page.locator('html')).toHaveCSS('scroll-behavior','auto');
 expect(await page.locator('html').evaluate(node=>parseFloat(getComputedStyle(node).scrollPaddingBottom))).toBeGreaterThanOrEqual(90);
 await expect(toggle).toHaveCSS('scroll-margin-block-start','16px');
 await expect(qualification).toBeVisible();
 await expect(context.locator('[data-calendar-role="route"][data-calendar-start="2026-09-25"]')).toContainText(local('중국','中国'));await expect(context.locator('[data-calendar-role="route"][data-calendar-start="2026-09-25"]')).toContainText('2026-09-25');
 await expect(details.locator('a').first()).toHaveAttribute('href',/^https:\/\//);
 expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await tapClearSummary(toggle);await expect(details).not.toHaveAttribute('open','');
 await expect(page.locator('html')).toHaveCSS('scroll-behavior','auto');
 await tapClearSummary(toggle);await expect(details).toHaveAttribute('open','');
 // Repeat using untouched Playwright native auto-scroll, with no helper recenter.
 await toggle.tap();await expect(details).not.toHaveAttribute('open','');
 await toggle.tap();await expect(details).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await toggle.focus();await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open','');
 await expect(qualification).toBeVisible();
});

for(const lang of ['ko','en','zh','ja'])for(const width of [320,1440])test.describe(`${lang} ${width} vacation coverage`,()=>{
 test.use({hasTouch:width===320,isMobile:width===320});
 test(`${lang} ${width}: grouped regional vacations follow actual comparison months without country omissions`,async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 let selected='2026-09';
 const earlier=(month:string)=>{const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1);return date.toISOString().slice(0,7);};
 const stats=(month:string)=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows:['일본','중국','베트남','미국','대만','태국'].map((label,index)=>({label,region:null,departures:1000-index*100,arrivals:900,total:1900-index*100,aggregate:false,startHour:null,endHour:null})),retrievedAt:'2026-10-24T01:00:00Z'});
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...summary,todayKst:'2026-10-25',serviceDateKst:'2026-10-25',generatedAt:'2026-10-25T01:00:00Z'}}));
 await page.route('**/api/airport/calendar*',route=>route.fulfill({json:{status:'PARTIAL',events:calendar.events,calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.route('**/api/live/airport-passenger-stats*',route=>{
  const requested=new URL(route.request().url()).searchParams.get('month')??selected,month=requested>selected?selected:requested,previousMonth=earlier(month);
  return route.fulfill({json:{status:'READY',month,previousMonth,current:{ROUTE_COUNTRY_PASSENGERS:stats(month)},previous:{ROUTE_COUNTRY_PASSENGERS:stats(previousMonth)}}});
 });
 const context=(country:string)=>page.locator(`.focus-trend-context[data-country="${country}"] .focus-calendar-context`);
 const checkFoldedStatus=async(country:string,status:'NO_REVIEWED_DATA'|'OUTSIDE_PERIOD')=>{
  const area=context(country),evidence=area.getByTestId('monthly-calendar-reference'),note=evidence.locator('[data-school-break-status]');
  const expected=status==='NO_REVIEWED_DATA'?({ko:'방학 자료: 미확인',en:'School-break data: unverified',zh:'学校假期资料：未确认',ja:'学校休暇資料：未確認'} as Record<string,string>)[lang]:({ko:'방학 자료: 비교 기간 밖',en:'School-break data: outside comparison period',zh:'学校假期资料：比较期间以外',ja:'学校休暇資料：比較期間外'} as Record<string,string>)[lang];
  await expect(area.locator(':scope > [data-school-break-status]')).toHaveCount(0);
  await expect(evidence).not.toHaveAttribute('open','');await expect(note).toBeHidden();
  await evidence.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(note).toHaveAttribute('data-school-break-status',status);await expect(note).toHaveText(expected);await expect(note).toBeVisible();
  await expect(evidence.locator('[data-school-break-limit]')).toBeVisible();
  await page.keyboard.press('Space');await expect(evidence).not.toHaveAttribute('open','');await expect(note).toBeHidden();
 };

 await page.goto(`/${lang}/airport-countries?mode=passengers`,{waitUntil:'domcontentloaded'});
 const cn=context('CN'),jp=context('JP');await cn.scrollIntoViewIfNeeded();
 const local=(ko:string,zh:string)=>lang==='zh'?zh:ko;
 await expect(cn.locator('[data-vacation-group="CN"]')).toHaveCount(1);
 const members=cn.locator('.focus-vacation-period');await expect(members).toHaveCount(2);
 await expect(members.nth(0)).toContainText('2026-07-01–2026-08-31');await expect(members.nth(0)).toContainText(local('상하이 초·중등학교','上海市中小学'));
 await expect(members.nth(1)).toContainText('2026-07-08–2026-08-31');await expect(members.nth(1)).toContainText(local('베이징 의무교육 학교','北京市义务教育学校'));
 await expect(jp.locator('[data-calendar-role="route"][data-calendar-start="2026-07-21"]')).toContainText('2026-07-21–2026-08-31');
 await expect(jp.locator('[data-calendar-role="origin"][data-calendar-start="2026-07-28"]')).toContainText('2026-07-28–2026-08-19');
 await checkFoldedStatus('VN','NO_REVIEWED_DATA');
 const sources=cn.getByTestId('monthly-calendar-reference');await sources.locator('summary').focus();await page.keyboard.press('Enter');
 for(const item of calendar.events.filter(item=>item.country==='CN'&&item.kind==='school_break'))await expect(sources.locator(`a[href="${item.sourceURL}"]`)).toHaveCount(1);
 await page.keyboard.press('Space');await expect(sources).not.toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 selected='2026-10';await page.reload();await context('JP').scrollIntoViewIfNeeded();
 await checkFoldedStatus('JP','OUTSIDE_PERIOD');
 await expect(context('JP')).not.toContainText('2026-07-21');await expect(context('CN').locator('[data-vacation-group="CN"]')).toHaveCount(0);
 selected='2026-04';await page.reload();const us=context('US');await us.scrollIntoViewIfNeeded();
 await expect(us.locator('[data-calendar-role="route"][data-calendar-start="2026-04-02"]')).toContainText('2026-04-02–2026-04-10');
 await us.getByTestId('monthly-calendar-reference').locator('summary').click();
 await expect(us).toContainText(local('뉴욕시 공립학교 3K–12학년 대상 · 사립학교 등 제외','纽约市公立学校3K–12年级 · 不含私立学校等'));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
});
