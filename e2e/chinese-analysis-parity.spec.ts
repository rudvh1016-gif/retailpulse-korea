import {test,expect,type Page,type FrameLocator} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import calendarSeed from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
import calendarManual from '../data/official-calendar/priority-country-multiyear.json' with {type:'json'};
const calendar={events:[...calendarSeed.events.filter(e=>e.country!=='CN'),...calendarManual.events],sources:[],calendarCoverage:[{country:'CN',year:2026,scope:'national',verifiedAt:calendarManual.checkedOn}]};
const dates=Array.from({length:48},(_,i)=>new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10));
const hours=(n:number)=>Array.from({length:24},(_,h)=>h===8?n:0);
const countryDays=dates.flatMap(date=>['JP','CN'].filter(country=>country!=='CN'||date!=='2026-10-07').map(country=>({country,scope:'ALL',date,complete:true,value:country==='JP'?(date>='2026-09-21'&&date<='2026-09-23'?160:150):100})));
const history={history:dates.map(day=>({T1:{day,total:300,hours:hours(300),complete:true},T2:{day,total:250,hours:hours(250),complete:true}})),countryDays,countryDaysByTerminal:{T1:countryDays.map(row=>({...row,scope:'T1',value:row.value-40})),T2:countryDays.map(row=>({...row,scope:'T2',value:40}))}};
async function fixtures(page:Page){
 await page.route('**/api/airport/calendar',r=>r.fulfill({json:calendar}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:passengerStats}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.route('**/api/live/airport-days*',r=>r.fulfill({json:{mode:'airport-days',date:new URL(r.request().url()).searchParams.get('date'),...history}}));
}
async function noKoreanFrame(frame:FrameLocator){
 await expect(frame.locator('html')).toHaveAttribute('lang','zh-CN');
 await expect(frame.locator('body')).not.toContainText(/[가-힣]/);
 const labels=await frame.locator('[aria-label],[placeholder],[title]').evaluateAll(nodes=>nodes.flatMap(node=>['aria-label','placeholder','title'].map(name=>node.getAttribute(name))).filter(Boolean));
 expect(labels.filter(label=>/[가-힣]/.test(label!))).toEqual([]);
 expect(await frame.locator('html').evaluate(node=>node.scrollWidth<=innerWidth+1)).toBe(true);
}
for(const width of [320,390,1440])test(`Chinese five glance tabs, all comparison modes and country jump ${width}`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:950});await page.emulateMedia({reducedMotion:'reduce'});await fixtures(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/zh?date=2026-10-19');await expect(page.getByRole('heading',{name:'仁川机场一览',exact:true})).toBeVisible();
 await expect(page.locator('#airport-glance-tabs [role=tab]')).toHaveCount(5);
 await expect(page.locator('#airport-insight-overview .focus-report-lines')).toContainText('103,124');
 await expect(page.locator('.airport-period-frame')).toHaveCount(0);
 for(const view of ['rhythm','weekday','terminal','holiday']){
  const tab=page.locator('#airport-insight-tab-'+view);await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');
  const frame=page.frameLocator('.airport-period-frame');await expect(frame.locator('html')).toHaveAttribute('data-preview-ready','true');
  await expect(frame.locator('#chart')).not.toBeEmpty();await noKoreanFrame(frame);
  if(view==='rhythm'){
   await frame.getByRole('button',{name:'分开显示两条线',exact:true}).click();await expect(frame.locator('.separated-period')).toHaveCount(2);
   await frame.getByRole('button',{name:'占比',exact:true}).click();await noKoreanFrame(frame);
   await frame.getByRole('button',{name:'叠加显示两条线',exact:true}).click();await expect(frame.locator('.hour-chart')).toHaveCount(1);
  }
  if(view==='weekday'){await frame.locator('.weekday-hit').first().click();await expect(frame.locator('#selection')).toContainText('周一');await noKoreanFrame(frame);}
  if(view==='terminal'){await frame.getByRole('button',{name:'占比',exact:true}).click();await expect(frame.locator('.comparison-row')).toHaveCount(2);await noKoreanFrame(frame);}
  if(view==='holiday'){
   await frame.locator('#country-select').selectOption('CN');
   for(const [id,value] of [['a-start','2026-09-24'],['a-end','2026-09-30'],['b-start','2026-10-01'],['b-end','2026-10-07']])await frame.locator('#'+id).fill(value);
   await frame.getByRole('button',{name:'应用期间',exact:true}).click();
   await expect(frame.locator('#comparison-caption')).toContainText('基准 7/7天 · 对比 6/7天纳入');
   await expect(frame.locator('#holiday-calendar-context')).toContainText('官方调休时段');
   await frame.locator('#evidence > summary').click();await expect(frame.locator('#method')).toContainText('无记录');await noKoreanFrame(frame);
  }
  await page.screenshot({path:info.outputPath(`zh-${view}-${width}.png`),fullPage:true});
 }
 const frame=page.frameLocator('.airport-period-frame');await frame.getByRole('button',{name:'查看同期各国航班 →'}).click();
 await expect(page).toHaveURL(/\/zh\/airport-countries\?/);expect(new URL(page.url()).searchParams.get('aStart')).toBe('2026-09-24');expect(new URL(page.url()).searchParams.get('date')).toBe('2026-10-19');
 await expect(page.locator('#country-flow-tab-flights')).toHaveAttribute('aria-selected','true');
 const country=page.frameLocator('.airport-period-frame');await expect(country.locator('#chart')).not.toBeEmpty();await noKoreanFrame(country);
 await country.getByRole('group',{name:'选择航站楼'}).getByRole('button',{name:'T2',exact:true}).click();await expect(country.locator('.country-pairs')).toContainText('40');
 await country.locator('#country-sort').selectOption('down');await noKoreanFrame(country);
 await page.screenshot({path:info.outputPath(`zh-country-period-${width}.png`),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('Chinese deep links keep range, mode and date on refresh and locale round trip',async({page})=>{
 await fixtures(page);await page.goto('/zh?date=2026-10-19&insight=terminal&aStart=2026-09-01&aEnd=2026-09-07&bStart=2026-10-01&bEnd=2026-10-07');
 const frame=()=>page.frameLocator('.airport-period-frame');await expect(frame().locator('#a-start')).toHaveValue('2026-09-01');
 const language=page.locator('select').filter({has:page.locator('option[value="zh"]')}).first();
 for(const lang of ['ko','zh']){
  await language.selectOption(lang);await expect(page).toHaveURL(new RegExp('/'+lang+'\\?'));
  await expect(page.locator('.airport-period-frame')).toHaveAttribute('src',new RegExp(lang==='zh'?'frame-zh\\.html':'frame\\.html'));
  await expect(frame().locator('#a-start')).toHaveValue('2026-09-01');expect(new URL(page.url()).searchParams.get('insight')).toBe('terminal');expect(new URL(page.url()).searchParams.get('date')).toBe('2026-10-19');
 }
 await page.reload();await expect(page.locator('#airport-insight-tab-terminal')).toHaveAttribute('aria-selected','true');await noKoreanFrame(frame());
});
test('Chinese analysis loading failure retries and missing dates remain unavailable, never zero',async({page})=>{
 await fixtures(page);let failed=true;await page.route('**/api/live/airport-days*',r=>r.fulfill(failed?{status:503,json:{status:'UNAVAILABLE'}}:{json:{mode:'airport-days',date:new URL(r.request().url()).searchParams.get('date'),...history}}));
 await page.goto('/zh?date=2026-10-19&insight=rhythm');const frame=page.frameLocator('.airport-period-frame');
 await expect(frame.getByRole('status')).toContainText('无法加载机场记录');await noKoreanFrame(frame);failed=false;
 await frame.getByRole('button',{name:'重新加载',exact:true}).click();await expect(frame.locator('html')).toHaveAttribute('data-preview-ready','true');
 for(const [id,value] of [['a-start','2027-01-01'],['a-end','2027-01-07'],['b-start','2027-02-01'],['b-end','2027-02-07']])await frame.locator('#'+id).fill(value);
 await frame.getByRole('button',{name:'应用期间',exact:true}).click();await expect(frame.locator('#finding-title')).toHaveText('需要两期均有记录');await expect(frame.locator('.hour-chart')).toHaveCount(0);await noKoreanFrame(frame);
});
// The color key is shared by every destination, including long country names.
// Exercise every country code present in the captured monthly records.
const storedCountries=[...new Set(months.data.months.flatMap(month=>Object.keys(month.scopes.ALL.destinationCountries)))].filter(code=>/^[A-Z]{2}$/.test(code));
for(const lang of ['ko','zh'])for(const width of [320,360,390,430])test(`compact holiday key stays one line for all stored destinations ${lang} ${width}`,async({page},info)=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:1000});await fixtures(page);
 const rows=dates.flatMap(date=>storedCountries.map(country=>({date,country,scope:'ALL',complete:true,value:100})));
 await page.route('**/api/live/airport-days*',r=>r.fulfill({json:{mode:'airport-days',date:new URL(r.request().url()).searchParams.get('date'),...history,countryDays:rows}}));
 await page.goto(`/airport-period/${lang==='zh'?'frame-zh.html':'frame.html'}?date=2026-10-19&view=holiday`);
 await expect(page.locator('html')).toHaveAttribute('data-preview-ready','true');await page.evaluate(()=>document.fonts.ready);
 const key=page.locator('.holiday-period-key'),copy=lang==='zh'?'灰：基准 · 蓝：对比（与假日无关）':'회색: 기준 · 파랑: 비교 (휴일 여부와 무관)';
 const options=await page.locator('#country-select option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value));expect(options.sort()).toEqual([...storedCountries].sort());
 for(const country of options){
  await page.locator('#country-select').selectOption(country);await expect(key).toHaveText(copy);await expect(key).toHaveCSS('font-size','10px');
  const geometry=await key.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return{lines:range.getClientRects().length,overflow:node.scrollWidth>node.clientWidth+1};});
  expect(geometry,country).toEqual({lines:1,overflow:false});
 }
 info.annotations.push({type:'countries',description:String(options.length)+' stored destination codes checked'});
 await page.screenshot({path:info.outputPath(`holiday-key-${lang}-${width}.png`),fullPage:true});
 // Enlarging text may wrap; it must never be truncated, hidden or horizontally
 // clipped to enforce the default-size one-line request.
 await key.evaluate(node=>{(node as HTMLElement).style.fontSize='20px';});await expect(key).toHaveText(copy);await expect(key).toBeVisible();
 expect(await key.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
 await expect(key).not.toHaveCSS('white-space','nowrap');await expect(key).not.toHaveCSS('text-overflow','ellipsis');
 await page.screenshot({path:info.outputPath(`holiday-key-enlarged-${lang}-${width}.png`),fullPage:true});
});
test('compact holiday copy retains the desktop type size and missing-data warning',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await fixtures(page);
 await page.goto('/airport-period/frame.html?date=2026-10-19&view=holiday&aStart=2026-09-24&aEnd=2026-09-30&bStart=2026-10-01&bEnd=2026-10-07');
 await page.locator('#country-select').selectOption('CN');
 await expect(page.locator('.holiday-period-key')).toHaveCSS('font-size','12px');
 await expect(page.locator('#context-note')).toContainText('수집일 부족');await expect(page.locator('#context-note')).toContainText('차이 없음·연휴 효과 단정 불가');
 await expect(page.locator('#holiday-calendar-context')).toContainText('공식 조정 휴무 구간');await expect(page.locator('#holiday-calendar-context a').first()).toHaveAttribute('href',/^https:\/\//);
});
