import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

const date='2026-08-31';
const rows=[['T1','29'],['T1','29'],['T1','26'],['T1','5'],['T2','215'],['T2','280'],['T2',null],['CONCOURSE','121'],['CONCOURSE','101'],[null,null]].map(([terminal,gate],i)=>({physicalFlightId:`building-${i}`,flightNumber:`TEST${i}`,terminal,gate,status:'scheduled',direction:'departure',airportCode:'NRT',scheduledAt:`${date}T09:30:00+09:00`,retrievedAt:`${date}T01:00:00Z`}));
for(const width of[360,390,430,1280])for(const lang of['ko','en','zh','ja'] as const)test(`own-building ratios and simple preserved forecast ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date(`${date}T05:00:00Z`));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));let reads=0;
 await page.route('**/api/live/flights*',r=>{reads++;return r.fulfill({json:{mode:'live-flights',serviceDateKst:date,flights:rows,truncated:false,retrievedAt:`${date}T01:00:00Z`}});});
 await page.goto(`/${lang}/airport`);const model=page.getByTestId('airport-concept-model');
 await expect(model).toHaveAttribute('data-denominator','10');
 for(const [building,total,shares]of [['T1',4,['50.0%','25.0%','25.0%']],['T2',3,['33.3%','0.0%','33.3%']],['CONCOURSE',2,['50.0%','0.0%','50.0%']]] as const){const group=model.locator(`.airport-concept-counts[data-building=${building}]`);await expect(group).toHaveAttribute('data-denominator',String(total));await expect(group.locator('small')).toHaveText([...shares]);}
 await expect(model.getByTestId('model-unverified-share')).toContainText('20.0%');
 await expect(page.locator('.airport-glance-strip, .airport-near-term, .airport-upcoming-peak')).toHaveCount(0);await expect(page.getByTestId('airport-top-reference')).toHaveCount(0);
 await expect(page.locator('.airport-forecast')).toBeVisible();await expect(page.getByTestId('map-zone-countries')).toBeVisible();
 const picture=model.locator('.airport-concept-picture'),image=picture.locator('img');await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 const frame=(await image.boundingBox())!,boxes=await Promise.all((await picture.locator('.airport-concept-counts').all()).map(r=>r.boundingBox()));
 for(const b of boxes){expect(b!.x).toBeGreaterThanOrEqual(frame.x);expect(b!.y).toBeGreaterThanOrEqual(frame.y);expect(b!.x+b!.width).toBeLessThanOrEqual(frame.x+frame.width+1);expect(b!.y+b!.height).toBeLessThanOrEqual(frame.y+frame.height+1);}
 if(width<=600){expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y+boxes[0]!.height);expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y+boxes[1]!.height);}else expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x+boxes[0]!.width);
 if(lang==='ko')await picture.screenshot({path:info.outputPath(`building-ratios-${width}.png`)});
 await page.getByTestId('departure-map-section').locator(':scope > summary').click();const map=page.getByTestId('departure-map');await map.locator('[data-preset=CUSTOM]').click();await map.getByTestId('map-from').selectOption('10');await map.getByTestId('map-to').selectOption('11');
 await expect(model).toHaveAttribute('data-denominator','0');for(const group of await model.locator('.airport-concept-counts').all()){await expect(group).toHaveAttribute('data-denominator','0');await expect(group).not.toContainText('%');}
 await map.locator('[data-preset=DAY]').click();await expect(model).toHaveAttribute('data-denominator','10');expect(reads).toBe(1);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
