import {test,expect,type Page,type TestInfo} from '@playwright/test';
async function captureMobileViewports(page:Page,info:TestInfo,name:string,width:number){
 if(width>820)return;
 for(const [index,fraction] of [0,0.33,0.66,1].entries()){
  await page.evaluate(value=>window.scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*value,behavior:'instant'}),fraction);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const rect=await page.locator('.bottom-nav.glass-nav').evaluate(node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:window.visualViewport?.height??innerHeight};});
  expect(rect.bottom).toBeLessThanOrEqual(rect.height+1);expect(rect.bottom).toBeGreaterThan(rect.height-40);
  await page.screenshot({path:info.outputPath(`${name}-viewport-${index+1}-${width}.png`)});
 }
 const last=page.locator('#focus-main a:visible,#focus-main button:visible').last();
 if(await last.count()){const rect=await last.boundingBox();const bar=await page.locator('.bottom-nav').boundingBox();if(rect&&bar)expect(rect.y+rect.height).toBeLessThanOrEqual(bar.y+1);}
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
}
test.use({storageState:{cookies:[],origins:[]}});
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
/** These are captured public API responses, not simulated passenger/flight counts.
 * Snapshot date is visibly disclosed by the implementation. No Production writes. */
for(const width of [360,390,430,1440])test(`airport focus approval rendering ${width}`,async({page},testInfo)=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:passengerStats}));
 await page.route('**/api/live/passenger-reference*',route=>route.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,r=>r.abort());
 await page.goto('/ko/airport-focus-preview',{waitUntil:'domcontentloaded'});
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(page.getByTestId('glance-key-passengers')).toHaveCount(0);
 await expect(page.getByTestId('glance-key-sum')).toHaveCount(0);
 await expect(page.locator('.focus-report-lines')).toContainText('단순합계 112,403명');
 await expect(page.locator('.focus-passenger-parts')).toBeVisible();
 await expect(page.locator('.focus-passenger-parts')).toContainText('예상 출국객 103,124명 + 예상 환승객 9,279명');
 await expect(page.locator('.focus-report-basis')).toContainText('누락일을 0으로 계산하지 않습니다');
 await expect(page.locator('.focus-report-lines')).not.toContainText('9,546');
 await expect(page.locator('.focus-passenger-total')).toHaveCSS('white-space','nowrap');
 await expect(page.locator('.focus-passenger-comparison')).toHaveText('전월 일평균 대비: 같은 기준의 비교자료 확인 중');
 expect(await page.locator('.focus-passenger-total').evaluate(node=>node.getBoundingClientRect().height<32)).toBe(true);
 await expect(page.getByTestId('glance-day-comparison')).toHaveCount(0);
 await page.locator('#focus-country-trends').scrollIntoViewIfNeeded();
 await expect(page.locator('.focus-line-chart')).toHaveCount(3);
 await expect(page.locator('.focus-line-chart').first()).toContainText('4월');
 await expect(page.locator('.focus-line-chart').first()).toContainText('9월');
 await expect(page.locator('.focus-report')).toContainText('567편');
 await expect(page.locator('.focus-selected-country-changes')).toContainText('일본행 161편');
 await expect(page.locator('.focus-selected-country-changes')).toContainText('+2.5%');
 await expect(page.locator('.focus-report')).toContainText('출근 후 30초 확인');
 await expect(page.locator('.focus-staff-links a')).toHaveAttribute('href','/ko/airport-news');
 await expect(page.locator('.focus-report')).toContainText('552.9편');
 await expect(page.locator('.focus-preparation-brief')).toContainText('10/26–11/1');
 await expect(page.locator('.focus-preparation-brief')).toContainText('11/1–11/30');
 const upcoming=page.locator('.focus-preparation-events > .focus-preparation-event');
 await expect(upcoming).toHaveCount(4);
 for(const event of await upcoming.all()){
  await expect(event.locator('h4')).toBeVisible();
  for(const date of await event.locator('time').all())await expect(date).toBeVisible();
 }
 await expect(page.locator('.focus-report-lines p').first()).toHaveCSS('font-size',width<=700?'12px':'14px');
 const upcomingBody=page.locator('.focus-preparation-events').first();
 const bodyToken=await upcomingBody.evaluate(node=>getComputedStyle(node).getPropertyValue('--type-body').trim());
 expect(bodyToken).toBe(width<=820?'13px':'14px');
 await expect(upcomingBody).toHaveCSS('font-size',bodyToken);
 const firstUpcoming=upcoming.first();
 await expect(firstUpcoming.locator('h4')).toContainText('필리핀:');
 await expect(firstUpcoming.locator('time')).toHaveCount(2);
 await expect(firstUpcoming.locator('time').first()).toHaveAttribute('datetime','2026-11-01');
 await expect(firstUpcoming.locator('time').last()).toHaveAttribute('datetime','2026-11-02');
 const detail=firstUpcoming.locator('.focus-event-details');
 await expect(detail).not.toHaveAttribute('open','');
 await expect(detail.locator('.focus-holiday-gloss')).not.toBeVisible();
 await detail.locator('summary').click();
 await expect(detail).toHaveAttribute('open','');
 await expect(detail.locator('.focus-holiday-gloss')).toBeVisible();
 await expect(detail.locator('.focus-holiday-gloss')).toContainText('성인을 기리고 고인을 추모하는 휴일입니다');
 await expect(detail.locator('.focus-event-row').nth(0)).toBeVisible();
 await expect(detail.locator('.focus-event-row').nth(0)).toHaveText('전국 특별 비근무일');
 await expect(detail.locator('.focus-event-row').nth(1)).toBeVisible();
 await expect(detail.locator('.focus-event-row').nth(1)).toContainText('귀국 준비: 인천→필리핀 출발편 확인');
 await expect(detail.getByRole('link',{name:'공식 일정 ↗'})).toBeVisible();
 await detail.locator('summary').click();
 await expect(detail).not.toHaveAttribute('open','');
 await expect(page.locator('.focus-report-title h2')).toHaveCSS('font-size',width<=700?'22px':'26px');
 await expect(page.locator('.focus-preparation-brief>div>small').first()).toHaveCSS('font-size','12px');
 expect(await page.getByTestId('glance-key-growth').evaluate(node=>Boolean(node.compareDocumentPosition(document.querySelector('#focus-holidays')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await page.locator('#focus-holidays').scrollIntoViewIfNeeded();
 await expect(page.locator('#focus-holidays li').first()).toBeVisible();
 expect(await page.locator('#focus-holidays li').count()).toBeGreaterThan(0);
 expect(await page.locator('#focus-holidays li').count()).toBeLessThanOrEqual(3);
 await page.locator('#focus-country-trends').scrollIntoViewIfNeeded();
 await expect(page.locator('#focus-country-trends article')).toHaveCount(3);
 await expect(page.locator('.glance-art-frame > img')).toBeVisible();
 await expect.poll(()=>page.locator('.glance-art-frame > img').evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain('approval-v2-');
 expect(await page.locator('.glance-art-frame > img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`home-${width}.png`),fullPage:true});
 await captureMobileViewports(page,testInfo,'home',width);
 await page.screenshot({path:testInfo.outputPath(`home-first-screen-${width}.png`)});
 if(width<=820){await expect(page.locator('.bottom-nav.glass-nav')).toBeVisible();await expect(page.locator('.bottom-nav .navigation-icon')).toHaveCount(5);await expect(page.locator('.bottom-nav .glass-nav-indicator')).toBeVisible();const links=page.locator('.bottom-nav a');await links.first().focus();await page.keyboard.press('ArrowRight');await expect(links.nth(1)).toBeFocused();await page.keyboard.press('Home');await expect(links.first()).toBeFocused();await page.locator('.bottom-nav').screenshot({path:testInfo.outputPath(`bottom-navigation-${width}.png`)});}
 await page.getByRole(width<=820?'link':'button',{name:'국가별 흐름',exact:true}).click();
 await expect(page.locator('#focus-country-trends article')).toHaveCount(6);
 await expect(page.locator('.focus-country-brief')).toContainText('일본');
 await expect(page.getByTestId('airport-route-passengers')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.locator('.focus-trend-summary').first()).toContainText('3개월 연속 증가');
 await expect(page.locator('.focus-trend-context[data-country="CN"]')).toContainText('6–8월 3개월 연속 증가');
 await expect(page.locator('.focus-trend-context[data-country="CN"]')).toContainText('▲ 21.1%');
 await expect(page.locator('.focus-trend-context[data-country="CN"]')).toContainText('160,405명');
 await expect(page.locator('.focus-month-values').first().locator('thead')).toContainText('전월비');
 await expect(page.locator('.focus-month-values').first().locator('tbody tr').first()).toContainText('비교자료 없음');
 await expect(page.locator('.focus-trend-context[data-country="CN"] .change-rate[data-direction=down]')).toHaveCSS('color','rgb(161, 45, 63)');
 await expect(page.locator('.focus-trend-context[data-country="CN"]')).toContainText('국경절');
 await expect(page.locator('.focus-trend-context[data-country="CN"]')).toContainText('증감 원인 단정 불가');
 if(width===390){const china=page.locator('#focus-country-trends article').filter({has:page.locator('.focus-trend-context[data-country="CN"]')});await china.evaluate(node=>window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-18,behavior:'instant'}));await page.screenshot({path:testInfo.outputPath('countries-china-viewport-390.png')});const monthlyTable=china.locator('.focus-month-values');await monthlyTable.evaluate(node=>window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-90,behavior:'instant'}));await page.screenshot({path:testInfo.outputPath('countries-monthly-table-390.png')});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));}
 await page.screenshot({path:testInfo.outputPath(`countries-${width}.png`),fullPage:true});
 await captureMobileViewports(page,testInfo,'countries',width);
 await page.getByRole(width<=820?'link':'button',{name:'미리 준비',exact:true}).click();
 await expect(page.locator('#focus-holidays')).toContainText('연방공무원 기준');
 await expect(page.locator('.focus-country-filter option')).toHaveCount(61);
 await page.locator('.focus-country-filter select').selectOption('괌');
 await expect(page.locator('#focus-holidays li')).toContainText(['괌','괌']);
 await expect(page.locator('#focus-holidays li').first()).toContainText('괌 세무국');
 await page.locator('.focus-country-filter select').selectOption('all');
 await page.screenshot({path:testInfo.outputPath(`preparation-${width}.png`),fullPage:false});
 await captureMobileViewports(page,testInfo,'preparation',width);
 await page.getByRole(width<=820?'link':'button',{name:'더보기',exact:true}).click();
 await expect(page.getByRole('link',{name:'소비 흐름 ↗'})).toHaveAttribute('href','/ko/consumption');
 if([360,390,430,1440].includes(width)){
  await page.getByRole(width<=820?'link':'button',{name:'공항 현황',exact:true}).click();
 await expect(page.locator('.focus-staff-calendar')).toHaveCount(1);
 await expect(page.locator('.focus-staff-calendar')).toContainText('2026-10-19–2026-10-25');
  await expect(page.locator('.airport-view')).toBeVisible();
  await expect(page.getByTestId('airport-route-passengers')).toHaveCount(0);
  await expect(page.locator('.focus-country-jump')).toBeVisible();
  const models=page.locator('.airport-scene-picture img');
  expect(await models.count()).toBeGreaterThan(0);
  for(const model of await models.all()){
   await model.scrollIntoViewIfNeeded();
   await expect.poll(()=>model.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
   await expect(model).toBeVisible();
   expect(await model.evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain('/airport-models/approval-v3/');
   await expect(model).toHaveCSS('opacity','1');
  }
  await page.locator('.airport-scene-picture').first().screenshot({path:testInfo.outputPath(`airport-model-${width}.png`)});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath(`airport-status-${width}.png`),fullPage:true});
 await captureMobileViewports(page,testInfo,'airport-status',width);
  for(const [name,asset] of [['T1','T1'],['T2','T2'],['탑승동','CONCOURSE']]){
   await page.getByRole('tab',{name,exact:true}).click();
   const model=page.locator('.airport-scene-picture img').first();
   await model.scrollIntoViewIfNeeded();
   await expect.poll(()=>model.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
   expect(await model.evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain(`/approval-v3/${asset}.svg`);
   await page.locator('.airport-scene-picture').first().screenshot({path:testInfo.outputPath(`airport-model-${asset}-${width}.png`)});
  }
  await page.getByRole('tab',{name:/^전체/ }).click();
  await page.locator('.focus-country-jump').click();
  await expect(page.getByTestId('airport-route-passengers')).toBeVisible();
  await expect(page.locator('.focus-country-brief')).toBeInViewport();
 }
 expect(errors).toEqual([]);
});

for(const width of [390,1440])test(`approved notice has only bottom close ${width}`,async({page},testInfo)=>{
 test.setTimeout(60000);
 await page.setViewportSize({width,height:width===390?844:1000});await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:passengerStats}));
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,r=>r.abort());
 await page.goto('/ko/airport-focus-preview',{waitUntil:'domcontentloaded'});const dialog=page.getByRole('dialog',{name:'new update!'});
 await expect(dialog).toBeVisible();await expect(dialog.locator('.update-notice-x')).toHaveCount(0);
 await expect(dialog).toHaveCSS('background-color','rgba(255, 255, 255, 0.72)');
 await expect(dialog).toHaveCSS('backdrop-filter','blur(28px) saturate(1.1)');
 const noticeContrast=await dialog.locator('p').first().evaluate(node=>{const rgb=getComputedStyle(node).color.match(/[\d.]+/g)!.slice(0,3).map(Number);const luminance=(v:number[])=>v.map(n=>{const x=n/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);return (luminance([255*.72,255*.72,255*.72])+.05)/(luminance(rgb)+.05);});
 expect(noticeContrast).toBeGreaterThanOrEqual(4.5);
 await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeInViewport({ratio:1});
 await expect(dialog.getByRole('button',{name:'일주일 동안 안 보기',exact:true})).toBeInViewport({ratio:1});
 await expect(dialog.locator('section')).toHaveCount(4);
 await page.screenshot({path:testInfo.outputPath(`notice-${width}.png`)});
 await dialog.getByRole('link',{name:'국가별 흐름 보기 →'}).click();
 await expect(page.locator('.focus-country-brief')).toBeVisible();
 await expect(page.getByTestId('airport-route-passengers')).toBeVisible();
 await page.evaluate(()=>sessionStorage.clear());
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('link',{name:'주요 휴일 보기 →'}).click();
 await expect(page.locator('.focus-country-filter')).toBeVisible();
 await page.evaluate(()=>sessionStorage.clear());await page.reload({waitUntil:'domcontentloaded'});
 await dialog.getByRole('link',{name:'공항 한눈에 보기 →'}).click();
 await expect(page.locator('.focus-report-lines')).toContainText('단순합계 112,403명');
 await expect(page.locator('.focus-passenger-parts')).toBeVisible();
 await expect(page.locator('.focus-passenger-parts')).toContainText('예상 출국객 103,124명 + 예상 환승객 9,279명');
 await page.evaluate(()=>sessionStorage.clear());await page.reload({waitUntil:'domcontentloaded'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('link',{name:'반입 면세한도 보기 →'}).click();
 await expect(page.locator('#arrival-allowances')).toBeInViewport();
 await page.evaluate(()=>sessionStorage.clear());await page.reload({waitUntil:'domcontentloaded'});
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog).not.toBeVisible();
});

for(const width of [390,1440])test(`arrival allowances preserve traveller conditions ${width}`,async({page},testInfo)=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:1000});
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,r=>r.abort());
 await page.goto('/ko/airport-focus-preview?view=prepare&section=arrival',{waitUntil:'domcontentloaded'});
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 const section=page.locator('#arrival-allowances');await expect(section).toBeInViewport();
 const destination=section.getByLabel('도착 국가·지역',{exact:true});await expect(destination).toHaveValue('');
 await expect(section.locator('.arrival-result')).toHaveCount(0);
 await section.screenshot({path:testInfo.outputPath(`arrival-start-${width}.png`)});
 await destination.selectOption('JP');await expect(section.locator('.arrival-result')).toHaveCount(0);
 await section.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await section.getByLabel('나이',{exact:true}).selectOption('adult');
 await expect(section.locator('.arrival-result')).toContainText('JPY 200,000');
 await section.screenshot({path:testInfo.outputPath(`arrival-japan-${width}.png`)});
 await section.locator('.arrival-result').evaluate(node=>window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-24,behavior:'instant'}));
 await page.screenshot({path:testInfo.outputPath(`arrival-japan-viewport-${width}.png`)});
 await destination.selectOption('CN');await expect(section.locator('.arrival-result')).toHaveCount(0);
 await section.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await section.getByLabel('나이',{exact:true}).selectOption('adult');
 await section.getByLabel('통상 거주지 (국적과 다름)',{exact:true}).selectOption('visitor');
 await section.getByLabel('중국 본토 직전 출발지',{exact:true}).selectOption('korea');
 await section.getByLabel('이번 입국 전 15일 내 중국 입국',{exact:true}).selectOption('normal');
 await expect(section.locator('.arrival-result')).toContainText('CNY 2,000');
 await section.screenshot({path:testInfo.outputPath(`arrival-china-${width}.png`)});
 await section.locator('.arrival-result').evaluate(node=>window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-24,behavior:'instant'}));
 await page.screenshot({path:testInfo.outputPath(`arrival-china-viewport-${width}.png`)});
 await section.getByLabel('이번 입국 전 15일 내 중국 입국',{exact:true}).selectOption('frequent');await expect(section.locator('.arrival-result')).toHaveCount(0);
 await destination.selectOption('US');await section.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');
 await section.getByLabel('거주 상태 (국적과 다름)',{exact:true}).selectOption('visitor');await section.getByLabel('나이',{exact:true}).selectOption('adult');
 await expect(section.locator('.arrival-result')).toHaveCount(0);await section.getByLabel('방문객 선물 면세 조건',{exact:true}).selectOption('met');
 await expect(section.locator('.arrival-result')).toContainText('개인 선물 USD 100');await expect(section.locator('.arrival-result')).not.toContainText('USD 800');
 await section.screenshot({path:testInfo.outputPath(`arrival-us-visitor-${width}.png`)});
 await section.locator('.arrival-result').evaluate(node=>window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-24,behavior:'instant'}));
 await page.screenshot({path:testInfo.outputPath(`arrival-us-visitor-viewport-${width}.png`)});
 await section.getByLabel('거주 상태 (국적과 다름)',{exact:true}).selectOption('resident');await expect(section.locator('.arrival-result')).toHaveCount(0);
 await section.getByLabel('귀국 거주자 기본 면세 조건',{exact:true}).selectOption('met');await expect(section.locator('.arrival-result')).toContainText('USD 800');
 await section.getByLabel('나이',{exact:true}).selectOption('young');await expect(section.locator('.arrival-result')).toContainText('21세 미만은 주류 반입 불가');
 await destination.selectOption('PH');await section.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');
 await expect(section.locator('.arrival-result')).toContainText('PHP 10,000');
 await expect(section.locator('.arrival-result')).toContainText('공식');
 await section.screenshot({path:testInfo.outputPath(`arrival-philippines-${width}.png`)});
 await section.locator('.arrival-result').evaluate(node=>window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-24,behavior:'instant'}));
 await page.screenshot({path:testInfo.outputPath(`arrival-philippines-viewport-${width}.png`)});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
});

// Real document anchors must survive first-load hydration and browser scroll restoration.
for(const attempt of [1,2,3])test(`notice destinations cold load 390 attempt ${attempt}`,async({browser})=>{
 test.setTimeout(120000);
 const destinations=[['공항 한눈에 보기 →','.focus-report'],['국가별 흐름 보기 →','.focus-country-brief'],['주요 휴일 보기 →','.focus-country-filter'],['반입 면세한도 보기 →','#arrival-allowances']] as const;
 for(const [name,target] of destinations){
  const context=await browser.newContext({viewport:{width:390,height:1000}});
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date(summary.generatedAt));
  await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
  await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
  await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
  await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:passengerStats}));
  await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,r=>r.abort());
  await page.goto('/ko/airport-focus-preview',{waitUntil:'domcontentloaded'});
  const dialog=page.getByRole('dialog',{name:'new update!'});
  await expect(dialog).toBeVisible();
  if(target==='#arrival-allowances')await expect(dialog.getByRole('link',{name})).toHaveAttribute('href',/section=arrival#arrival-allowances$/);
  await dialog.getByRole('link',{name}).click();
  await expect(page.locator(target)).toBeInViewport();
  if(target==='#arrival-allowances'){
   await expect(page).toHaveURL(/#arrival-allowances$/);
   await page.evaluate(()=>document.fonts.ready);
   const assertAnchor=async()=>{
    await expect.poll(()=>page.locator(target).evaluate(node=>{const top=node.getBoundingClientRect().top+scrollY;const margin=parseFloat(getComputedStyle(node).scrollMarginTop)||0;const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);return Math.abs(scrollY-Math.min(Math.max(0,top-margin),max));})).toBeLessThan(3);
    const geometry=await page.locator(target).evaluate(node=>({headingTop:node.querySelector('h2')!.getBoundingClientRect().top,headingBottom:node.querySelector('h2')!.getBoundingClientRect().bottom,navTop:document.querySelector('.focus-mobile-navigation .bottom-nav')!.getBoundingClientRect().top}));
    expect(geometry.headingTop).toBeGreaterThanOrEqual(0);expect(geometry.headingBottom).toBeLessThan(geometry.navTop);
   };
   await assertAnchor();
   await page.reload({waitUntil:'domcontentloaded'});
   await expect(page.locator(target)).toBeInViewport();await assertAnchor();
   await page.goBack({waitUntil:'domcontentloaded'});
   await expect(page).toHaveURL(/\/ko\/airport-focus-preview$/);
   await expect(page.locator('.focus-report')).toBeVisible();
   await page.goForward({waitUntil:'domcontentloaded'});
   await expect(page.locator(target)).toBeInViewport();await assertAnchor();
  }
  await context.close();
 }
});
