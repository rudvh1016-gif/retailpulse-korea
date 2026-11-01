import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

const cases=[...['ko','en'].flatMap(lang=>[320,390,899,999,1000,1280,1440,1920].map(width=>({lang,width}))),...['zh','ja'].flatMap(lang=>[390,1440].map(width=>({lang,width})))];
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
 await expect(figuresTitle).toHaveText(({ko:'출국객 수 (환승객 포함)',en:'Departing passengers (incl. transfers)',zh:'出境旅客人数（含中转）',ja:'出国者数（乗継客含む）'} as Record<string,string>)[lang]);
 await expect(figuresTitle).toHaveAttribute('data-heading','subsection');
 await expect(figuresTitle).toHaveCSS('font-size',width<=600?'15px':'18px');
 await expect(report.locator('.focus-report-date')).toHaveCSS('font-size','12px');
 const parent=report.locator('.focus-report-title > h2');
 await expect(parent).toHaveCSS('font-size','22px');await expect(parent).toHaveAttribute('data-heading','section');
 const parentSize=await parent.evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
 expect(parentSize).toBeGreaterThan(await figuresTitle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
 const keyNumber=report.locator('.focus-passenger-total');await expect(keyNumber).toHaveCSS('font-size',width>=1000?'28px':width<=600?'20px':'24px');
 expect(await keyNumber.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(width<=600?await figuresTitle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)):parentSize);
 const topics=stack.locator(':scope > .focus-selected-country-changes');await expect(topics).toHaveCount(2);
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
 await expect(future.locator(':scope > div > small')).toHaveCount(0);
 await expect(future.locator('.focus-preparation-events')).toHaveCSS('margin-bottom',width<=700?'0px':'5px');
 await expect(future.locator(':scope > .focus-planning-basis')).toHaveCount(0);
 await expect(future.locator('.focus-planning-link')).toHaveCount(0);
 const heights:number[]=[],leftTops:number[][]=[];
 for(const expanded of [true,false]){
  for(const disclosure of await disclosures.all()){
   if(await disclosure.locator(':scope > summary').isVisible()&&await disclosure.evaluate(element=>(element as HTMLDetailsElement).open)!==expanded)await disclosure.locator(':scope > summary').click();
  }
  // Read all compared rectangles in one browser turn. Async reference replies
  // and disclosure-driven scroll anchoring may otherwise move the layout between
  // sequential boundingBox calls, producing a gap that never existed on screen.
  const layout=await report.evaluate((element,viewportWidth)=>{
   const requireElement=(root:Element,selector:string)=>{
    const node=root.querySelector(selector);
    if(!node)throw new Error(`Missing briefing geometry target: ${selector}`);
    return node;
   };
   const box=(node:Element)=>{const {x,y,width,height}=node.getBoundingClientRect();return {x,y,width,height};};
   const figures=requireElement(element,'.focus-report-lines'),future=requireElement(element,'.focus-preparation-brief');
   const stack=requireElement(element,'.focus-selected-country-stack');
   const topics=[...stack.querySelectorAll(':scope > .focus-selected-country-changes')];
   if(topics.length!==2)throw new Error('Expected both selected-day briefing topics');
   return {
    title:box(requireElement(element,'.focus-report-date')),
    reportTitle:box(requireElement(element,'.focus-report-title')),
    numbers:box(figures),right:box(future),
    changeTitle:box(requireElement(topics[0],'h3')),
    returnTitle:box(requireElement(topics[1],'h3')),
    changeEnd:box(requireElement(topics[0],':scope > small')),
    scrollY:window.scrollY,
    returnBox:box(requireElement(element,'.focus-return-context')),
    cards:[...element.querySelectorAll('.focus-return-events>.focus-preparation-event')].slice(0,2).map(box),
    topicBoxes:[figures,...topics,...future.querySelectorAll(':scope > div')].map(topic=>({
     figures:topic===figures,
     heading:box(requireElement(topic,':scope > h3')),
     content:box(requireElement(topic,topic===figures&&viewportWidth<1000?'.focus-people-metric':':scope > h3 + *')),
    })),
    firstFuture:box(requireElement(future,':scope > div > h3')),
    gridTemplateRows:getComputedStyle(element).gridTemplateRows,
    changes:box(stack),
   };
  },width);
  const {title,reportTitle,numbers,right,changeTitle,returnTitle,changeEnd,scrollY}=layout;
  expect(title.y-reportTitle.y-reportTitle.height).toBeGreaterThanOrEqual(19);
  expect(title.y-reportTitle.y-reportTitle.height).toBeLessThanOrEqual(21);
  heights.push(right.height);leftTops.push([title.y,numbers.y,changeTitle.y,returnTitle.y].map(y=>y+scrollY));
  const topicGap=returnTitle.y-changeEnd.y-changeEnd.height;
  if(width<1000){expect(topicGap).toBeGreaterThanOrEqual(24);expect(topicGap).toBeLessThanOrEqual(28);}
  else{
   const {returnBox,cards}=layout;
   expect(right.y).toBeGreaterThanOrEqual(returnBox.y+returnBox.height);expect(right.width).toBeGreaterThan(numbers.width+returnBox.width);expect(returnBox.x).toBeGreaterThanOrEqual(numbers.x+numbers.width);
   if(cards.length>1){const [a,b]=cards;expect(a.y).toBeCloseTo(b.y,0);expect(b.x).toBeGreaterThanOrEqual(a.x+a.width);}
  }
  for(const {figures:isFigures,heading:hb,content:cb} of layout.topicBoxes){
   expect(cb.y-hb.y-hb.height).toBeGreaterThanOrEqual(isFigures?7:9);
   expect(cb.y-hb.y-hb.height).toBeLessThanOrEqual(isFigures?10:14);
  }
  if(width>=1000){
   expect(numbers.y-title.y-title.height).toBeGreaterThanOrEqual(7);
   expect(numbers.y-title.y-title.height).toBeLessThanOrEqual(9);
   const topEnd=Math.max(numbers.y+numbers.height,layout.returnBox.y+layout.returnBox.height);
   expect(changeTitle.y-topEnd).toBeGreaterThanOrEqual(24);
   expect(changeTitle.y-topEnd).toBeLessThanOrEqual(28);
   expect(right.x).toBeCloseTo(numbers.x,0);
   expect(Math.abs(returnTitle.y-title.y)).toBeLessThanOrEqual(1);
  }else{
   expect(layout.gridTemplateRows).toBe('none');
   expect(right.y).toBeGreaterThanOrEqual(layout.changes.y+layout.changes.height-1);
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
  await expect(group.locator(':scope > small')).toHaveCount(0);
  const cards=group.locator('.focus-return-events>.focus-preparation-event');await expect(cards).toHaveCount(count);
 for(const card of await cards.all()){
  await expect(card.locator('h4')).toBeVisible();await expect(card.locator('time').first()).toHaveAttribute('datetime','2026-10-19');
  const details=card.locator('.focus-event-details');await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');await expect(details.getByRole('link')).toHaveAttribute('href','https://example.test/return-layout');
  await details.locator('summary').focus();await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open','');
 }
 const boxes=await cards.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
 if(count===2){if(width>=1000){expect(boxes[0].y).toBeCloseTo(boxes[1].y,0);expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].right);}else expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].bottom);}
 const future=(await page.locator('.focus-preparation-brief').boundingBox())!,bounds=(await group.boundingBox())!;
 expect(future.y).toBeGreaterThanOrEqual(bounds.y+bounds.height);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
