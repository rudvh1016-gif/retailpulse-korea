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
 const topics=stack.locator(':scope > .focus-selected-country-changes');await expect(topics).toHaveCount(2);
 await page.evaluate(()=>document.fonts.ready);
 for(const heading of await report.locator('h3[data-heading="subsection"]').all()){
  await expect(heading).toHaveCSS('color','rgb(17, 17, 17)');
  await expect(heading).toHaveCSS('font-weight',lang==='ja'||lang==='zh'?'600':'700');
 }
 // Supporting dates remain subordinate rather than inheriting title weight/color.
 await expect(report.locator('.focus-today-title > small')).toHaveCSS('font-weight','400');
 const future=report.locator('.focus-preparation-brief'),disclosures=future.locator('details');
 expect(await disclosures.count()).toBeGreaterThan(0);
 const heights:number[]=[],leftTops:number[][]=[];
 for(const expanded of [true,false]){
  for(const disclosure of await disclosures.all()){
   if(await disclosure.locator(':scope > summary').isVisible()&&await disclosure.evaluate(element=>(element as HTMLDetailsElement).open)!==expanded)await disclosure.locator(':scope > summary').click();
  }
  const title=(await report.locator('.focus-today-title').boundingBox())!;
  const reportTitle=(await report.locator('.focus-report-title').boundingBox())!;
  expect(title.y-reportTitle.y-reportTitle.height).toBeGreaterThanOrEqual(15);
  expect(title.y-reportTitle.y-reportTitle.height).toBeLessThanOrEqual(17);
  const numbers=(await figures.boundingBox())!,right=(await future.boundingBox())!;
  const changeTitle=(await topics.nth(0).locator('h3').boundingBox())!;
  const returnTitle=(await topics.nth(1).locator('h3').boundingBox())!;
  const changeEnd=(await topics.nth(0).locator(':scope > small').boundingBox())!;
  const scrollY=await page.evaluate(()=>window.scrollY);
  heights.push(right.height);leftTops.push([title.y,numbers.y,changeTitle.y,returnTitle.y].map(y=>y+scrollY));
  const topicGap=returnTitle.y-changeEnd.y-changeEnd.height;
  expect(topicGap).toBeGreaterThanOrEqual(24);expect(topicGap).toBeLessThanOrEqual(28);
  for(const topic of [figures,...await topics.all(),...await future.locator(':scope > div').all()]){
   const h=topic.locator(':scope > h3'),content=topic.locator(':scope > h3 + *');
   const hb=(await h.boundingBox())!,cb=(await content.boundingBox())!;
   expect(cb.y-hb.y-hb.height).toBeGreaterThanOrEqual(9);
   expect(cb.y-hb.y-hb.height).toBeLessThanOrEqual(14);
  }
  if(width>=1000){
   expect(numbers.y-title.y-title.height).toBeGreaterThanOrEqual(11);
   expect(numbers.y-title.y-title.height).toBeLessThanOrEqual(13);
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
 for(let i=0;i<leftTops[0].length;i++)expect(Math.abs(leftTops[0][i]-leftTops[1][i])).toBeLessThanOrEqual(1);
});
