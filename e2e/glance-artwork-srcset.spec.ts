import {noticeDismissedState} from '../scripts/update-notice-test-state.mjs';
import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

// The published glance artwork's `sizes` follows the page-shell padding (app/globals.css: 14px at
// ≤365px, 18px at ≤820px, the gutter above) plus the glance padding (app/airport-glance-preview.css:
// 12px at ≤700px, 24px above). If those paddings change, the file a phone downloads changes with them.
for(const [width,height,scale,file] of [[360,800,3,960],[390,844,3,1100],[430,932,3,1200],[768,1024,2,1448],[1280,900,1,960]] as const)test(`glance artwork picks the ${file}w file at ${width}x${height}@${scale}`,async({browser})=>{
 const context=await browser.newContext({storageState:noticeDismissedState(test.info().project.use.baseURL),viewport:{width,height},deviceScaleFactor:scale});const page=await context.newPage();
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'MISSING',month:null,months:[],calculatedAt:null,data:null}}));
 await page.goto('/ko');
 const img=page.locator('.glance-art-frame>img');
 await expect.poll(()=>img.evaluate(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0)).toBe(true);
 const {src,rendered}=await img.evaluate(e=>{const image=e as HTMLImageElement;return {src:new URL(image.currentSrc).pathname,rendered:image.getBoundingClientRect().width};});
 expect(src).toBe(`/images/airport-glance/approval-v2-${file}.webp`);
 expect(file,'the chosen file covers the rendered width at this density').toBeGreaterThanOrEqual(Math.ceil(rendered*scale));
 await context.close();
});
