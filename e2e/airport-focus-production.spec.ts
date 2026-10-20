import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

// The captured payload is a selected past day. Undated requests receive clock
// metadata only, not relabelled passenger counts from that past day.
const clockReply={mode:'live-summary',todayKst:summary.todayKst,serviceDateKst:summary.todayKst,generatedAt:summary.generatedAt,dayRelation:'TODAY',areas:{},airport:{},sources:[]};
// Read-only captured fixtures, never production writes or invented live counts.
for(const width of [360,390,430,1440])test(`airport production composition ${width}`,async({page},info)=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.get('date')?summary:clockReply}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
 await page.goto('/ko?date=2026-10-19',{waitUntil:'domcontentloaded'});
 for(const text of ['단순합계 112,403명','103,124명','9,279명'])await expect(page.locator('.focus-report-lines')).toContainText(text);
 await expect(page.locator('.focus-selected-country-changes')).toContainText('일본행');
 const nav=page.locator(width<=820?'.bottom-nav':'.top-nav');await expect(nav.locator('a')).toHaveCount(5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`production-home-${width}.png`)});
 await nav.getByRole('link',{name:'국가별 흐름',exact:true}).click();await expect(page).toHaveURL(/airport-countries/);
 await expect(page.getByRole('heading',{name:'국가별 흐름',exact:true})).toBeVisible();await expect(page.getByTestId('airport-route-passengers')).toBeVisible();
 await expect(page.locator('.focus-month-values')).toHaveCount(6);await page.screenshot({path:info.outputPath(`production-countries-${width}.png`)});
 await nav.getByRole('link',{name:'미리 준비',exact:true}).click();await expect(page).toHaveURL(/airport-prepare/);
 await page.getByRole('link',{name:'도착국 반입 면세한도 보기',exact:false}).first().click();await expect(page.locator('#arrival-allowances')).toBeInViewport();await page.screenshot({path:info.outputPath(`production-preparation-${width}.png`)});
 await nav.getByRole('link',{name:'더보기',exact:true}).click();await expect(page.locator('.more-section-links')).toContainText('서울 한눈에');await expect(page.locator('.more-section-links a[href$="/consumption"]')).toBeVisible();expect(errors).toEqual([]);
});
test('unavailable server date keeps the guide accessible without fabricating today',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/live/summary*',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'미리 준비',exact:true})).toBeVisible();await expect(page.getByText('공식 기준 날짜를 확인하지 못해 휴일 목록을 표시하지 않았습니다.')).toBeVisible();await expect(page.locator('#arrival-allowances')).toBeVisible();expect(errors).toEqual([]);
});
test('monthly history arriving before the official current date does not crash calendar context',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',async route=>{await new Promise(resolve=>setTimeout(resolve,1600));await route.fulfill({json:new URL(route.request().url()).searchParams.get('date')?summary:clockReply});});
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:passengerStats}));
 await page.goto('/ko/airport-countries?date=2026-10-19',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.focus-month-values')).toHaveCount(6);
 await expect(page.locator('#focus-country-trends')).toContainText('노선 국가별');
 expect(errors).toEqual([]);
});
