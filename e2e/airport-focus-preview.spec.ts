import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
/** These are captured public API responses, not simulated passenger/flight counts.
 * Snapshot date is visibly disclosed by the implementation. No Production writes. */
for(const width of [360,390,430,1440])test(`airport focus approval rendering ${width}`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:passengerStats}));
 await page.goto('/ko/airport-focus-preview');
 await expect(page.getByTestId('glance-key-passengers')).toContainText('103,124');
 await expect(page.getByTestId('glance-key-sum')).toContainText('112,403');
 await expect(page.locator('.focus-report')).toContainText('9,546.3명');
 await expect(page.locator('.focus-report')).toContainText('567편');
 await expect(page.locator('.focus-report')).toContainText('552.9편');
 expect(await page.locator('#focus-holidays li').count()).toBeGreaterThan(0);
 expect(await page.locator('#focus-holidays li').count()).toBeLessThanOrEqual(3);
 await expect(page.locator('#focus-country-trends article')).toHaveCount(3);
 await expect(page.locator('.glance-art-frame > img')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`home-${width}.png`),fullPage:true});
 await page.screenshot({path:testInfo.outputPath(`home-first-screen-${width}.png`)});
 await page.getByRole('button',{name:'국가별 흐름',exact:true}).click();
 await expect(page.locator('#focus-country-trends article')).toHaveCount(6);
 await page.screenshot({path:testInfo.outputPath(`countries-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'미리 준비',exact:true}).click();
 await expect(page.locator('#focus-holidays')).toContainText('연방공무원 기준');
 await page.screenshot({path:testInfo.outputPath(`preparation-${width}.png`),fullPage:false});
 await page.getByRole('button',{name:'더보기',exact:true}).click();
 await expect(page.getByRole('link',{name:'소비 흐름 ↗'})).toHaveAttribute('href','/ko/consumption');
 if(width===390||width===1440){
  await page.getByRole('button',{name:'공항 현황',exact:true}).click();
  await expect(page.locator('.airport-view')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath(`airport-status-${width}.png`),fullPage:true});
 }
 expect(errors).toEqual([]);
});
