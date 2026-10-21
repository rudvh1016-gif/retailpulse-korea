import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
// Synthetic, complete forecast pairs: never a claim about stored production data.
const sampleReference=(factor:number)=>({month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:22,mean:null,status:'PARTIAL',
 missingDates:Array.from({length:8},(_,i)=>`2026-09-${i+23}`),
 observedDays:Array.from({length:22},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,departures:50000*factor,transfers:10000*factor}))});
for(const lang of ['en','zh','ko'])for(const width of [390,1440])test(`${lang} full 30-second brief ${width}`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'UNAVAILABLE',events:[],sources:[],replacementScopes:[]}}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'READY',month:'2026-09',data:{all:sampleReference(2),T1:sampleReference(1),T2:sampleReference(1)}}}));
 await page.goto(`/${lang}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const brief=page.locator('.focus-report');await expect(brief).toContainText('112,403');
 await expect(brief).toContainText(lang==='en'?'30-second work briefing':lang==='zh'?'上班后30秒速览':'출근 후 30초 확인');
 await expect(brief).toContainText(lang==='en'?'Next week':lang==='zh'?'下周':'다음 주');
 await expect(brief).toContainText(lang==='en'?'Next month':lang==='zh'?'下月':'다음 달');
 const comparison=brief.locator('.focus-passenger-comparison');
 for(const value of ['120,000','7,597','▲ 6.3%','2,640,000','22','30','8'])await expect(comparison).toContainText(value);
 await expect(comparison).toContainText(lang==='ko'?'월전체 평균 아님':lang==='en'?'Not a full-month average':'非全月平均值');
 for(const detail of await brief.locator('details').all()){await detail.locator('summary').click();await expect(detail).toHaveAttribute('open','');}
 await expect(brief).toContainText('2026-09-23');await expect(brief).toContainText('2026-09-30');
 if(lang!=='ko')expect(await brief.textContent()).not.toMatch(/[가-힣]/);
 await expect(brief.locator('.focus-passenger-total')).toContainText(lang==='ko'?'단순합계 112,403명':lang==='en'?'arithmetic sum 112,403 people':'简单合计 112,403人');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await brief.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 // Match the existing locale cascades in globals.css; Chinese already uses Noto Sans SC.
 const font=await brief.evaluate(el=>getComputedStyle(el).fontFamily);
 expect(font).toBe(lang==='zh'?'"Noto Sans SC Variable", system-ui, sans-serif':'"KORETAIL Sans Variable", system-ui, sans-serif');
 await brief.screenshot({path:info.outputPath(`brief-${lang}-${width}.png`)});
 for(const detail of await brief.locator('details').all()){await detail.locator('summary').click();await expect(detail).not.toHaveAttribute('open','');}
});
