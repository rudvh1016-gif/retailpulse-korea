import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import {collectedDayComparisonCopy} from '../lib/collected-day-comparison-copy';

for(const lang of ['ko','en','zh','ja'])for(const width of [320,390,430,768,1000,1440,1920])test(`five flow markers and desktop-only country space ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));let flightReply=flights;
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flightReply}));
 for(const [path,json] of [['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.goto(`/${lang}?date=2026-10-19`);
 await expect(page.locator('.focus-flight-comparison .daily-comparison-basis')).toContainText(collectedDayComparisonCopy(lang as 'ko'|'en'|'zh'|'ja',true));
 const flow=page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"]');await expect(flow.locator('.airport-flow-item-title')).toHaveCount(5);
 const dots=flow.locator('.airport-flow-dot');await expect(dots).toHaveCount(5);await expect(page.locator('.airport-flow-check')).toHaveCount(0);
 for(const dot of await dots.all()){await expect(dot).toHaveText('·');await expect(dot).toHaveAttribute('aria-hidden','true');await expect(dot).toHaveCSS('color','rgb(17, 17, 17)');await expect(dot).toHaveCSS('font-size','11px');}
 await expect(page.locator('h1 .airport-flow-dot,h2 .airport-flow-dot,nav .airport-flow-dot,summary .airport-flow-dot')).toHaveCount(0);
 const period=flow.getByTestId('glance-key-growth').locator(':scope > small'),stamp=flow.getByTestId('glance-key-growth').locator('.staff-brief-heading small');await expect(stamp).toContainText('2026-10-19');
 const a=(await period.boundingBox())!,b=(await stamp.boundingBox())!;expect(b.y-a.y-a.height).toBeGreaterThanOrEqual(0);expect(b.y-a.y-a.height).toBeLessThanOrEqual(8);
 if(width>700){const first=await flow.locator(':scope > a').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,width:b.width};})),second=await flow.locator('.staff-brief-grid > section').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,width:b.width};}));for(let i=0;i<2;i++){expect(second[i].x).toBeCloseTo(first[i].x,0);expect(second[i].width).toBeCloseTo(first[i].width,0);}}
 const countries=page.locator('.glance-brief-data .glance-destinations'),rows=countries.locator(':scope > ul > li');await expect(countries.locator('.glance-detail-link')).toContainText('(44)');await expect(countries.locator('[data-country="JP"]')).toContainText('161');
 await expect(page.locator('.glance-ranking tbody tr')).toHaveCount(10);
 if(width<1000){await expect(rows).toHaveCount(7);await expect(countries.locator('[data-country="PH"],[data-country="TW"]')).toHaveCount(2);}
 else {await expect.poll(()=>rows.count()).toBeGreaterThan(7);expect(await rows.count()).toBeLessThanOrEqual(24);}
 await page.locator('.focus-calendar-deferred').first().scrollIntoViewIfNeeded();const holidays=page.locator('.focus-calendar-upcoming');await expect(holidays).toBeVisible();const cards=holidays.locator('.focus-holiday-list > li');expect(await cards.count()).toBeGreaterThan(0);
 for(const card of await cards.all()){
  await expect(card.locator(':scope > img')).toHaveCount(0);const group=card.locator('.focus-calendar-country'),flag=group.locator('img'),name=group.locator('.focus-calendar-country-name');await expect(flag).toHaveCount(1);await expect(name).toBeVisible();
  const f=(await flag.boundingBox())!,n=(await name.boundingBox())!;expect(Math.abs(f.y-n.y)).toBeLessThanOrEqual(3);expect(n.x-f.x-f.width).toBeGreaterThanOrEqual(4);expect(n.x-f.x-f.width).toBeLessThanOrEqual(8);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(lang==='ko'&&(width===390||width===1440))await page.screenshot({path:info.outputPath(`five-flow-${width}.png`),fullPage:true});
 if(lang==='ko'&&width===1440){
  await page.setViewportSize({width:390,height:1000});await expect(rows).toHaveCount(7);await page.setViewportSize({width:1440,height:1000});await expect.poll(()=>rows.count()).toBeGreaterThan(7);
  const tokyoFlights=flights.flights.filter(row=>row.airportCode==='도쿄/하네다');expect(tokyoFlights.length).toBeGreaterThan(0);
  flightReply={...flights,flights:tokyoFlights};await page.reload();await expect(countries.locator('.glance-detail-link')).toContainText('(1)');await expect(rows).toHaveCount(1);
 }
 // The weekly official schedule lives on the airport status page, not the glance page.
 await page.goto(`/${lang}/airport?date=2026-10-19`);
 const weekly=page.locator('.focus-staff-calendar');await expect(weekly).toBeVisible();await weekly.scrollIntoViewIfNeeded();
 const weeklyRows=weekly.locator(':scope > p');expect(await weeklyRows.count()).toBeGreaterThanOrEqual(2);
 await expect(weekly).toContainText('미얀마');await expect(weekly).toContainText('카자흐스탄');
 for(const note of await weekly.locator(':scope > p > small').all()){await expect(note).toHaveCSS('font-size','11px');await expect(note).toHaveCSS('font-weight','400');}
 const gaps=await weeklyRows.evaluateAll(rows=>rows.slice(1).map((row,i)=>row.getBoundingClientRect().top-rows[i].getBoundingClientRect().bottom));
 for(const gap of gaps){expect(gap).toBeGreaterThanOrEqual(8);expect(gap).toBeLessThanOrEqual(16);}
});
