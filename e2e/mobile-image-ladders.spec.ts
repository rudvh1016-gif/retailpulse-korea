import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,FLIGHT_ROWS,routeSummary} from './summary-fixture';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';

// The file each phone downloads follows `sizes` and the width steps in srcset. These pin the steps
// added for 3x phones (and the corrected sizes) so a later edit cannot silently send the full render
// again, while every chosen file still covers the painted width x density.
const rows=(month:string,step:number)=>[{observed_at:`${month}-01T10:10:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-01T10:10:00+09:00`,categories:['한식','화장품','편의점'].map((category,i)=>({category,group:'fixture',payments:(i+1)*step,amountMin:100,amountMax:200}))})}];
const month=publicCommercialMonth(compareCommercialMonths(buildCommercialMonth(rows('2026-08',2),'2026-08','2026-08-30'),buildCommercialMonth(rows('2026-07',1),'2026-07','2026-07-31')));
async function open(page:Page,path:string){
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:FLIGHT_ROWS,truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'MISSING',month:null,months:[],calculatedAt:null,data:null}}));
 await page.route('**/api/live/commercial-months*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{status:'READY',area:url.searchParams.get('area'),month:url.searchParams.get('month'),months:['2026-08','2026-07'],data:month}});});
 await page.goto(path);
}
const cases=[
 {name:'T2 scene',path:'/ko/airport?terminal=T2',image:'[data-testid="airport-departure-model-slot"] .airport-concept-picture img',width:390,height:844,scale:3,file:'/airport-models/v14/T2_day-1300.webp'},
 {name:'mobile overview',path:'/ko/airport',image:'[data-testid="airport-departure-model-slot"] .airport-concept-picture img',width:390,height:844,scale:3,file:'/airport-models/v14/OVERVIEW_MOBILE_day-1100.webp'},
 {name:'mobile overview',path:'/ko/airport',image:'[data-testid="airport-departure-model-slot"] .airport-concept-picture img',width:430,height:932,scale:3,file:'/airport-models/v14/OVERVIEW_MOBILE_day.webp'},
 {name:'guide entry mark',path:'/ko/airport',image:'[data-testid="departure-guide-entry"] img',width:390,height:844,scale:3,file:'/visuals/news/v1/airport-news-128.webp'},
 {name:'Seoul flow model',path:'/ko/myeongdong',image:'[data-testid="seoul-flow-models"] img',width:390,height:844,scale:3,file:'/seoul-flow-models/station-1200.webp'},
 {name:'consumption icon',path:'/ko/consumption',image:'.consumption-category>img',width:390,height:844,scale:3,file:'/commercial-icons/sharp-v1/convenience-192.webp'},
 {name:'district card',path:'/ko/where-to',image:'.district-choice-model',width:360,height:800,scale:2,file:'/visuals/seoul-comparison/myeongdong-320.webp'},
] as const;
for(const c of cases)test(`${c.name} picks ${c.file.split('/').pop()} at ${c.width}x${c.height}@${c.scale}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:c.width,height:c.height},deviceScaleFactor:c.scale,isMobile:true,hasTouch:true});const page=await context.newPage();
 await open(page,c.path);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 // The model re-mounts while its data settles, so each attempt looks the image up again and only
 // measures one that has loaded. naturalWidth of a srcset image is density-corrected, so the file's
 // pixel width is read from a plain copy.
 let reading:{src:string;natural:number;painted:number}|null=null;
 for(let attempt=0;attempt<60&&!reading;attempt++){
  reading=await page.evaluate(async selector=>{const image=document.querySelector(selector) as HTMLImageElement|null;if(!image)return null;image.scrollIntoView({block:'center'});
   if(!image.complete||!image.naturalWidth||!image.currentSrc)return null;const box=image.getBoundingClientRect(),fit=getComputedStyle(image).objectFit,file=new Image();file.src=image.currentSrc;await file.decode();
   return {src:new URL(image.currentSrc).pathname,natural:file.naturalWidth,painted:fit==='contain'?Math.min(box.width,box.height*file.naturalWidth/file.naturalHeight):box.width};},c.image).catch(()=>null);
  if(!reading)await page.waitForTimeout(250);
 }
 expect(reading,'the image loaded').not.toBeNull();const {src,natural,painted}=reading!;
 expect(src).toBe(c.file);
 expect(natural,'the chosen file covers the painted width at this density').toBeGreaterThanOrEqual(Math.floor(painted*c.scale));
 await context.close();
});
