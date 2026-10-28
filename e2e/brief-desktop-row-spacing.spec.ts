import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

const cases=[...['ko','en'].flatMap(lang=>[390,899,999,1000,1280,1440,1920].map(width=>({lang,width}))),...['zh','ja'].flatMap(lang=>[390,1440].map(width=>({lang,width})))];
for(const {lang,width} of cases)test(`${lang} briefing hierarchy and compact rows at ${width}px with short and expanded future content`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 // Fully local test inputs, including one explicitly synthetic return-planning
 // event so both adjacent topics are exercised without changing passenger/flight data.
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
 await page.route('**/api/live/passenger-reference*',route=>route.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.route('**/api/airport/calendar*',route=>route.fulfill({json:{status:'PARTIAL',events:[{id:'layout-return-fixture',country:'TH',name:'Layout test holiday',kind:'public_holiday',status:'verified',scope:'national',start:'2026-10-19',end:'2026-10-19',verifiedAt:'2026-10-01',reviewValidUntil:'2026-12-31',sourceURL:'https://example.test/layout-fixture'}],calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.goto(`/${lang}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 const report=page.locator('.airport-focus-shell .focus-report');
 const figures=report.locator('.focus-report-lines'),stack=report.locator('.focus-selected-country-stack');
 await expect(figures).toContainText('112,403');
 const figuresTitle=figures.locator('h3');
 await expect(figuresTitle).toHaveText(({ko:'출국객·항공편',en:'Passengers and flights',zh:'出境旅客与航班',ja:'出国者・便数'} as Record<string,string>)[lang]);
 await expect(figuresTitle).toHaveAttribute('data-heading','subsection');
 await expect(figuresTitle).toHaveCSS('font-size',width<=700?'16px':'18px');
 await expect(report.locator('.focus-report-date')).toHaveCSS('font-size','12px');
 const parent=report.locator('.focus-report-title > h2');
 await expect(parent).toHaveCSS('font-size','22px');await expect(parent).toHaveAttribute('data-heading','section');
 const parentSize=await parent.evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
 expect(parentSize).toBeGreaterThan(await figuresTitle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
 const keyNumber=report.locator('.focus-passenger-total');await expect(keyNumber).toHaveCSS('font-size',width>=1000?'28px':width<=700?'20px':'24px');
 expect(await keyNumber.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(width<=700?await figuresTitle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)):parentSize);
 const topics=stack.locator(':scope > .focus-selected-country-changes');await expect(topics).toHaveCount(2);
 if(width<=700){await expect(topics.nth(0)).toHaveCSS('border-bottom-width','0px');await expect(topics.nth(1)).toHaveCSS('border-top-width','1px');await expect(report).toHaveCSS('border-top-width','1px');}
 await page.evaluate(()=>document.fonts.ready);
 for(const heading of await report.locator('h3[data-heading="subsection"]').all()){
  await expect(heading).toHaveCSS('color','rgb(34, 35, 38)');
  const quiet=await heading.evaluate(element=>element.classList.contains('focus-brief-band'));
  await expect(heading).toHaveCSS('font-weight',quiet||lang==='ja'||lang==='zh'?'600':'700');
  if(quiet){await expect(heading).toHaveCSS('font-size','16px');await expect(heading).toHaveCSS('border-top-width','0px');await expect(heading.locator('.ui-line-icon')).toHaveCount(0);}
 }
 // Supporting dates remain subordinate rather than inheriting title weight/color.
 await expect(report.locator('.focus-report-date')).toHaveCSS('font-weight','400');
 const future=report.locator('.focus-preparation-brief'),disclosures=future.locator('details');
 expect(await disclosures.count()).toBeGreaterThan(0);
 const heights:number[]=[],leftTops:number[][]=[];
 for(const expanded of [true,false]){
  for(const disclosure of await disclosures.all()){
   if(await disclosure.locator(':scope > summary').isVisible()&&await disclosure.evaluate(element=>(element as HTMLDetailsElement).open)!==expanded)await disclosure.locator(':scope > summary').click();
  }
  const title=(await report.locator('.focus-report-date').boundingBox())!;
  const reportTitle=(await report.locator('.focus-report-title').boundingBox())!;
  expect(title.y-reportTitle.y-reportTitle.height).toBeGreaterThanOrEqual(19);
  expect(title.y-reportTitle.y-reportTitle.height).toBeLessThanOrEqual(21);
  const numbers=(await figures.boundingBox())!,right=(await future.boundingBox())!;
  const changeTitle=(await topics.nth(0).locator('h3').boundingBox())!;
  const returnTitle=(await topics.nth(1).locator('h3').boundingBox())!;
  const changeEnd=(await topics.nth(0).locator(':scope > small').boundingBox())!;
  const scrollY=await page.evaluate(()=>window.scrollY);
  heights.push(right.height);leftTops.push([title.y,numbers.y,changeTitle.y,returnTitle.y].map(y=>y+scrollY));
  const topicGap=returnTitle.y-changeEnd.y-changeEnd.height;
  if(width<1000){expect(topicGap).toBeGreaterThanOrEqual(24);expect(topicGap).toBeLessThanOrEqual(28);}
  else{
   const returnBox=(await report.locator('.focus-return-context').boundingBox())!;
   expect(returnBox.y).toBeGreaterThanOrEqual(right.y+right.height);expect(returnBox.width).toBeGreaterThan(numbers.width+right.width);
   const cards=await report.locator('.focus-return-events>.focus-preparation-event').all();
   if(cards.length>1){const [a,b]=await Promise.all(cards.slice(0,2).map(card=>card.boundingBox()));expect(a!.y).toBeCloseTo(b!.y,0);expect(b!.x).toBeGreaterThanOrEqual(a!.x+a!.width);}
  }
  for(const topic of [figures,...await topics.all(),...await future.locator(':scope > div').all()]){
   const h=topic.locator(':scope > h3'),content=topic===figures&&width<1000?topic.locator('.focus-people-metric'):topic.locator(':scope > h3 + *');
   const hb=(await h.boundingBox())!,cb=(await content.boundingBox())!;
   expect(cb.y-hb.y-hb.height).toBeGreaterThanOrEqual(topic===figures?7:9);
   expect(cb.y-hb.y-hb.height).toBeLessThanOrEqual(topic===figures?10:14);
  }
  if(width>=1000){
   expect(numbers.y-title.y-title.height).toBeGreaterThanOrEqual(7);
   expect(numbers.y-title.y-title.height).toBeLessThanOrEqual(9);
   expect(changeTitle.y-numbers.y-numbers.height).toBeGreaterThanOrEqual(24);
   expect(changeTitle.y-numbers.y-numbers.height).toBeLessThanOrEqual(28);
   expect(right.x).toBeGreaterThan(numbers.x+numbers.width);
   const firstFuture=(await future.locator(':scope > div > h3').first().boundingBox())!;
   expect(Math.abs(firstFuture.y-title.y)).toBeLessThanOrEqual(1);
  }else{
   expect(await report.evaluate(element=>getComputedStyle(element).gridTemplateRows)).toBe('none');
   const changes=(await stack.boundingBox())!;
   expect(right.y).toBeGreaterThanOrEqual(changes.y+changes.height-1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await report.screenshot({path:info.outputPath(`brief-${lang}-${width}-${expanded?'expanded':'closed'}.png`)});
 }
 expect(heights[0]).toBeGreaterThan(heights[1]);
 // A taller right column must not redistribute whitespace inside the left one.
 for(let i=0;i<(width>=1000?3:leftTops[0].length);i++)expect(Math.abs(leftTops[0][i]-leftTops[1][i])).toBeLessThanOrEqual(1);
});



for(const width of [390,1440])for(const count of [0,1,2])test(`return planning keeps ${count} countries without overlap at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date('2026-10-19T02:00:00Z'));
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:{...summary,todayKst:'2026-10-19',generatedAt:'2026-10-19T02:00:00Z'}}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'PARTIAL',events:['TH','PH'].slice(0,count).map(country=>({id:'return-layout-'+country,country,name:'Synthetic return holiday '+country,kind:'public_holiday',status:'verified',scope:'national',start:'2026-10-19',end:'2026-10-19',verifiedAt:'2026-10-01',sourceURL:'https://example.test/return-layout'})),calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.goto('/ko?date=2026-10-19');const group=page.locator('.focus-return-context');await expect(group).toHaveCount(count?1:0);if(!count)return;
 const cards=group.locator('.focus-return-events>.focus-preparation-event');await expect(cards).toHaveCount(count);
 for(const card of await cards.all()){
  await expect(card.locator('h4')).toBeVisible();await expect(card.locator('time').first()).toHaveAttribute('datetime','2026-10-19');
  const details=card.locator('.focus-event-details');await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');await expect(details.getByRole('link')).toHaveAttribute('href','https://example.test/return-layout');
  await details.locator('summary').focus();await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open','');
 }
 const boxes=await cards.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
 if(count===2){if(width>=1000){expect(boxes[0].y).toBeCloseTo(boxes[1].y,0);expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].right);}else expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].bottom);}
 const future=(await page.locator('.focus-preparation-brief').boundingBox())!,bounds=(await group.boundingBox())!;
 if(width>=1000)expect(bounds.y).toBeGreaterThanOrEqual(future.y+future.height);else expect(future.y).toBeGreaterThanOrEqual(bounds.y+bounds.height);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
