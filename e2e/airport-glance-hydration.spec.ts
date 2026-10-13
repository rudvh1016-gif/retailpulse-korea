import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

// The glance routes pass the glance in from their server pages (app/[locale]/page.tsx and
// app/[locale]/[slug]/page.tsx), so hydration keeps the server-rendered glance instead of
// dropping it for a lazy chunk and building it again (two footer shifts, CLS 0.57–0.67 on a
// cold phone load). tests/rendered-html.test.mjs checks the glance assets in the built head.
async function routeData(page:Page){
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'MISSING',month:null,months:[],calculatedAt:null,data:null}}));
}
for(const [width,path] of [[390,'/ko'],[1280,'/ko'],[390,'/ko/airport-glance']] as const)test(`hydration keeps the server-rendered glance ${path} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await routeData(page);
 // Remember the first glance node the parser inserts and note if it is ever taken out.
 await page.addInitScript(()=>{const w=window as unknown as {glance?:Element;glanceRemoved?:boolean};new MutationObserver(()=>{if(!w.glance)w.glance=document.querySelector('[data-testid="airport-glance-preview"]')??undefined;else if(!w.glance.isConnected)w.glanceRemoved=true;}).observe(document,{childList:true,subtree:true});});
 await page.goto(path,{waitUntil:'domcontentloaded'});
 expect(await page.evaluate(()=>Boolean((window as unknown as {glance?:Element}).glance)),'the server HTML carries the glance').toBe(true);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await page.waitForTimeout(1000);
 expect(await page.evaluate(()=>{const w=window as unknown as {glance?:Element;glanceRemoved?:boolean};return {removed:Boolean(w.glanceRemoved),same:document.querySelector('[data-testid="airport-glance-preview"]')===w.glance};})).toEqual({removed:false,same:true});
});
