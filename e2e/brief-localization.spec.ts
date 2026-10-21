import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
for(const lang of ['en','zh','ko'])for(const width of [390,1440])test(`${lang} full 30-second brief ${width}`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'UNAVAILABLE',events:[],sources:[],replacementScopes:[]}}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.goto(`/${lang}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const brief=page.locator('.focus-report');await expect(brief).toContainText('112,403');
 await expect(brief).toContainText(lang==='en'?'30-second work briefing':lang==='zh'?'上班后30秒速览':'출근 후 30초 확인');
 await expect(brief).toContainText(lang==='en'?'Next week':lang==='zh'?'下周':'다음 주');
 await expect(brief).toContainText(lang==='en'?'Next month':lang==='zh'?'下月':'다음 달');
 for(const detail of await brief.locator('details').all()){await detail.locator('summary').click();await expect(detail).toHaveAttribute('open','');}
 if(lang!=='ko')expect(await brief.textContent()).not.toMatch(/[가-힣]/);
 await expect(brief.locator('.focus-passenger-total')).toContainText(lang==='ko'?'단순합계 112,403명':lang==='en'?'arithmetic sum 112,403 people':'简单合计 112,403人');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await brief.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 // Localization must reuse the existing font cascade, sizes and sign styling.
 const font=await brief.evaluate(el=>getComputedStyle(el).fontFamily);expect(font).toMatch(/KORETAIL|Pretendard/);
 await brief.screenshot({path:info.outputPath(`brief-${lang}-${width}.png`)});
 for(const detail of await brief.locator('details').all()){await detail.locator('summary').click();await expect(detail).not.toHaveAttribute('open','');}
});
