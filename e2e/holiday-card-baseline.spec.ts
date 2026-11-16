import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import calendar from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
import seed from '../data/airport-focus-preview/holidays-summary.json' with {type:'json'};
import {planningHolidays} from '../lib/holiday-flight-brief';
const routeCounts=new Map([['일본',1000],['베트남',900]]);

for(const lang of ['ko','en','zh','ja'])for(const width of [360,390,430,1280])test(`${lang} holiday header/date baselines ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date('2026-11-16T02:00:00Z'));
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:{...summary,todayKst:'2026-11-16',serviceDateKst:'2026-11-16',generatedAt:'2026-11-16T02:00:00Z',airport:{...summary.airport,serviceDateKst:'2026-11-16'}}}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'PARTIAL',events:calendar.events,calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 // Selection is ranked by route counts. Without this fixture MM/LA precede JP/VN.
 expect(planningHolidays(seed.events,'2026-11-23','2026-11-29','2026-11-16',routeCounts).map(e=>e.country)).toEqual(['JP','VN']);
 await page.route('**/api/live/airport-passenger-stats*',r=>{
  const month=new URL(r.request().url()).searchParams.get('month')??'2026-11';
  const stats={operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows:[...routeCounts].map(([label,departures])=>({label,region:null,departures,arrivals:0,total:departures,aggregate:false,startHour:null,endHour:null})),retrievedAt:'2026-11-16T02:00:00Z'};
  return r.fulfill({json:{status:'READY',month,previousMonth:null,current:{ROUTE_COUNTRY_PASSENGERS:stats},previous:{}}});
 });
 await page.goto(`/${lang}?date=2026-11-16`);
 const cards=page.locator('.focus-preparation-brief .focus-preparation-events>.focus-preparation-event');
 await expect(cards).toHaveCount(2);await expect(cards.nth(0)).toHaveAttribute('data-country','JP');await expect(cards.nth(1)).toHaveAttribute('data-country','VN');
 await page.evaluate(()=>document.fonts.ready);
 const titles=await cards.locator('h4').allTextContents();
 for(const variant of ['normal','first-long','second-long','zoom'] as const){
  await cards.evaluateAll((nodes,{titles,variant})=>{
   document.documentElement.style.zoom=variant==='zoom'?'1.25':'1';
   nodes.forEach((node,i)=>{const h=node.querySelector('h4')!,b=h.querySelector('b')!;const suffix=titles[i].slice(b.textContent!.length);for(const child of [...h.childNodes])if(child!==b)child.remove();h.append(document.createTextNode(suffix.repeat((variant==='first-long'&&i===0)||(variant==='second-long'&&i===1)?12:1)));});
  },{titles,variant});
  const metrics=await cards.evaluateAll(nodes=>nodes.map(card=>{
   const h=card.querySelector('h4')!,country=h.querySelector('b')!,date=card.querySelector('.focus-event-dates')!,time=date.querySelector('time')!,weekday=time.querySelector('small')!,img=h.querySelector('img')!;
   const textRect=(node:Node,start=0,end?:number)=>{const range=document.createRange();range.setStart(node,start);range.setEnd(node,end??node.textContent!.length);return range.getClientRects()[0].toJSON();};
   const countryText=[...country.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim()).at(0)!;
   const titleText=h.lastChild!,titleStart=titleText.textContent!.search(/\S/);
   const style=getComputedStyle(time),smallStyle=getComputedStyle(weekday);
   return{header:h.getBoundingClientRect().toJSON(),date:date.getBoundingClientRect().toJSON(),country:textRect(countryText),title:textRect(titleText,titleStart,titleStart+1),number:textRect(time.firstChild!),weekday:weekday.getBoundingClientRect().toJSON(),flag:{width:getComputedStyle(img).width,height:getComputedStyle(img).height},family:style.fontFamily,smallFamily:smallStyle.fontFamily,font:style.fontSize,smallFont:smallStyle.fontSize,margin:getComputedStyle(date).marginTop,overflow:card.scrollWidth>card.clientWidth+1,zoom:Number(getComputedStyle(document.documentElement).zoom)};
  }));
  for(const m of metrics){
   // Font glyph boxes may differ by script; equal-size country/title glyphs must share their first line.
   expect(Math.abs(m.country.y-m.title.y),`${variant}: country/title baseline`).toBeLessThanOrEqual(.2*m.zoom);
   expect(m.date.y-m.header.bottom,`${variant}: title/date gap`).toBeCloseTo(parseFloat(m.margin)*m.zoom,0);
   expect(m.weekday.x-m.number.right,`${variant}: visible date/weekday spacing`).toBeGreaterThanOrEqual(2*m.zoom);
   expect(Math.abs(m.weekday.bottom-m.number.bottom),`${variant}: date/weekday baseline`).toBeLessThanOrEqual(1*m.zoom);
   expect(m.date.height).toBeGreaterThan(0);expect(m.overflow).toBe(false);
   expect(m.flag).toEqual({width:'24px',height:'24px'});expect(m.family).toBe(m.smallFamily);expect(m.smallFont).toBe('11px');
  }
  if(width>=1000&&variant==='normal')expect(metrics[0].date.y).toBeCloseTo(metrics[1].date.y,1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await info.attach(`${variant}-geometry`,{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
  if(variant==='normal')await page.locator('.focus-preparation-brief').screenshot({path:info.outputPath(`holidays-${lang}-${width}.png`)});
 }
});
