import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import {chooseDate} from './date-selection';

// Counts remain the captured 2026-10-19 payload. The undated calendar test
// receives only clock metadata, never counts relabelled as a different day.
const clock={mode:'live-summary',todayKst:'2026-10-28',serviceDateKst:'2026-10-28',generatedAt:'2026-10-28T06:00:00Z',dayRelation:'TODAY',areas:{},airport:{},sources:[]};
async function fixtures(page:Page){
 await page.route('**/api/live/summary*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('date')?summary:clock}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:passengerStats}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.route(/google-analytics\.com|googletagmanager\.com/,r=>r.abort());
}
async function noKoreanUI(page:Page){
 const remaining=await page.evaluate(()=>{
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),result:string[]=[];
  while(walker.nextNode()){
   const n=walker.currentNode,p=n.parentElement,text=n.textContent?.trim()??'';
   if(!p||!/[가-힣]/.test(text)||text==='한국어'||p.closest('script,style,option,[lang="ko"]')||!p.checkVisibility())continue;
   result.push(text);
  }
  return result;
 });expect(remaining).toEqual([]);
}
for(const width of [360,1440])test(`Chinese core screens, calendar details, allowance choices and chart tooltip ${width}`,async({page},info)=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await fixtures(page);
 await page.goto('/zh?date=2026-10-19');await expect(page.locator('.focus-report-lines')).toContainText('103,124');
 await page.locator('#focus-holidays').scrollIntoViewIfNeeded();await expect(page.locator('#focus-holidays')).toContainText('各国');await noKoreanUI(page);
 await page.screenshot({path:info.outputPath(`zh-home-${width}.png`),fullPage:true});
 await page.goto('/zh/airport-countries?mode=passengers&date=2026-10-19');await expect(page.locator('.focus-trend-grid article')).toHaveCount(12);
 for(const disclosure of await page.locator('.focus-month-table-details').all())await disclosure.locator('summary').click();
 const point=page.locator('.focus-month-target').last();await point.scrollIntoViewIfNeeded();await point.click();await expect(page.getByRole('tooltip')).toBeVisible();await expect(page.getByRole('tooltip')).not.toContainText(/[가-힣]/);
 await noKoreanUI(page);await page.screenshot({path:info.outputPath(`zh-countries-${width}.png`),fullPage:true});
 await page.locator('.focus-trend-grid article').first().screenshot({path:info.outputPath(`zh-chart-detail-${width}.png`)});
 await page.goto('/zh/airport-prepare');await expect(page.locator('.preparation-month-grid')).toBeVisible();
 await page.locator('.focus-country-filter select').selectOption('일본');await page.getByRole('button',{name:'下个月',exact:true}).click();
 const eventDay=page.locator('.preparation-day').filter({has:page.locator('.preparation-event-chip')}).first();await eventDay.click();
 await expect(page.locator('#preparation-day-details')).toBeVisible();await expect(page.locator('#preparation-day-details')).toContainText('官方');
 for(const disclosure of await page.locator('.focus-calendar details').all())await disclosure.locator(':scope > summary').click();
 await noKoreanUI(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`zh-calendar-${width}.png`),fullPage:true});
 await page.locator('.preparation-month').screenshot({path:info.outputPath(`zh-calendar-detail-${width}.png`)});
 // Every destination and every visible condition option is visited. Recursive
 // options retain the component's own dependency clearing and branch rules.
 const country=page.locator('#arrival-allowances > label select');
 for(const id of ['CN','JP','VN','TH','US','TW','HK','SG','AU','CA','PH','MY']){
  await country.selectOption(id);const controls=page.locator('.arrival-filters select');
  for(let index=0;index<await controls.count();index++){
   const select=controls.nth(index),options=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value).filter(Boolean));
   for(const value of options){await select.selectOption(value);await noKoreanUI(page);}
   if(options[0])await select.selectOption(options[0]);
  }
  await page.locator('.arrival-source > summary').click();await noKoreanUI(page);
 }
 expect(errors).toEqual([]);
});
test('Chinese terminal and date controls retain scope through refresh and unavailable dates',async({page})=>{
 await fixtures(page);await page.goto('/zh/airport?date=2026-10-19');
 const tabs=page.locator('.airport-view > .terminal-selector').getByRole('tab');
 await expect(tabs.first()).toBeVisible();await expect(page.locator('.date-nav')).toBeVisible();
 for(const index of [1,2,3,0]){await tabs.nth(index).click();await expect(tabs.nth(index)).toHaveAttribute('aria-selected','true');await noKoreanUI(page);}
 await tabs.nth(2).click();await expect(page).toHaveURL(/terminal=T2/);await page.reload();await expect(tabs.nth(2)).toHaveAttribute('aria-selected','true');
 await chooseDate(page,'2026-10-18');await expect(page).toHaveURL(/date=2026-10-18/);await expect(page).toHaveURL(/terminal=T2/);await noKoreanUI(page);
 const language=page.locator('select').filter({has:page.locator('option[value="zh"]')}).first();await language.selectOption('ko');await expect(page).toHaveURL(/\/ko\/airport\?/);await expect(page).toHaveURL(/terminal=T2/);await expect(page).toHaveURL(/date=2026-10-18/);await page.reload();await expect(tabs.nth(2)).toHaveAttribute('aria-selected','true');
});
test('Chinese stays selected through language change, refresh, date query and tab navigation',async({page})=>{
 await fixtures(page);await page.goto('/ko/airport-countries?mode=passengers&date=2026-10-19');await expect(page.locator('.focus-country-brief li').first()).toBeVisible();
 const language=page.locator('select').filter({has:page.locator('option[value="zh"]')}).first();await language.selectOption('zh');
 await expect(page).toHaveURL(/\/zh\/airport-countries\?/);expect(new URL(page.url()).searchParams.get('date')).toBe('2026-10-19');expect(new URL(page.url()).searchParams.get('mode')).toBe('passengers');await page.reload();await expect(language).toHaveValue('zh');
 await expect(page.locator('.focus-country-brief')).toContainText('最新公布月份');await noKoreanUI(page);
 await language.selectOption('ko');await expect(page).toHaveURL(/\/ko\/airport-countries\?/);await expect(page.locator('#country-flow-tab-passengers')).toHaveAttribute('aria-selected','true');expect(new URL(page.url()).searchParams.get('date')).toBe('2026-10-19');
});
test('slow and failed summaries show Chinese unavailable copy without zero-filled calendar',async({page})=>{
 await fixtures(page);let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/summary*',async r=>{await gate;await r.fulfill({status:503,json:{status:'UNAVAILABLE'}});});
 await page.goto('/zh/airport-prepare',{waitUntil:'domcontentloaded'});await expect(page.locator('h1')).toContainText('提前准备');await noKoreanUI(page);release();
 await expect(page.locator('.focus-detail')).toContainText('未能确认官方基准日期');await expect(page.locator('.preparation-month-grid')).toHaveCount(0);await expect(page.locator('#arrival-allowances')).toBeVisible();await noKoreanUI(page);
});
