import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import stats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
for(const width of [390,1440])test(`English preserves airport menus, analysis and language switching ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 // Standalone vinext does not serve asset HTML; model the production ASSETS binding.
 await page.route('**/airport-period/frame.html*',route=>route.fulfill({contentType:'text/html',body:readFileSync(new URL('../public/airport-period/frame.html',import.meta.url),'utf8')}));
 for(const [path,json] of [['summary',summary],['flights',flights],['airport-months',months],['airport-passenger-stats',stats]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
 const dates=Array.from({length:48},(_,i)=>new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10)),hours=Array.from({length:24},()=>10);
 await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',date:new URL(route.request().url()).searchParams.get('date'),history:dates.map(day=>({T1:{day,total:240,hours,complete:true},T2:{day,total:240,hours,complete:true}})),countryDays:[],countryDaysByTerminal:{}}}));
 await page.goto('/ko?date=2026-10-19',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.focus-report')).toContainText('112,403');
 await page.locator('.language-control select').selectOption('en');
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/en');
 expect(new URL(page.url()).searchParams.get('date')).toBe('2026-10-19');
 await expect(page.getByRole('heading',{name:'Airport changes to watch',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Times and terminals',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Route and holiday planning',exact:true})).toBeVisible();
 await expect(page.locator('#airport-glance-tabs [role=tab]')).toHaveCount(5);
 for(const label of ['When were departures busiest?','Are there more weekend flights?','Which terminal changed?','Did flights increase during holidays?']){
  await page.getByRole('tab',{name:label,exact:true}).click();
  await expect(page.locator('.airport-period-frame')).toHaveAttribute('src',/frame\.html\?.*lang=en/);
  const frame=page.frameLocator('.airport-period-frame');await expect(frame.locator('#range-form')).toBeVisible();
  await expect(frame.getByRole('button',{name:'Apply periods',exact:true})).toBeVisible();
  expect(await frame.locator('body').innerText()).not.toMatch(/[가-힣]/);
 }
 await page.locator('.language-control select').selectOption('ko');await expect.poll(()=>new URL(page.url()).pathname).toBe('/ko');
 await expect(page.getByRole('tab',{name:'연휴에는 늘었나요?',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
