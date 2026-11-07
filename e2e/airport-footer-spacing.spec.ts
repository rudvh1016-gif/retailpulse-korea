import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';

// Catch standalone-preview navigation clearance leaking into the embedded home,
// where .page-shell already reserves the fixed bottom navigation's safe area.
for(const width of [360,390,430,820,1440]){
 test(`airport home footer follows the source link without an empty block at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights:[],truncated:false}}));
  await page.goto('/ko',{waitUntil:'domcontentloaded'});
  const app=page.locator('.app[data-hydrated="true"]');
  const source=app.locator('#airport-insight-overview .glance-preview > footer');
  const footer=app.locator('.page-shell > .site-footer');
  await expect(source.getByRole('link',{name:'공식 공항 지도 ↗'})).toBeVisible();
  const gap=async()=>{
   const sourceBox=await source.boundingBox(),footerBox=await footer.boundingBox();
   expect(sourceBox).not.toBeNull();expect(footerBox).not.toBeNull();
   return footerBox!.y-sourceBox!.y-sourceBox!.height;
  };
  expect(await gap()).toBeGreaterThanOrEqual(16);
  expect(await gap()).toBeLessThanOrEqual(32);
  // Returning from another tab must not restore the inherited spacer.
  await app.locator('#airport-insight-tab-briefing').click();
  await expect(app.locator('#airport-insight-briefing')).toBeVisible();
  await app.locator('#airport-insight-tab-overview').click();
  await expect(source).toBeVisible();
  expect(await gap()).toBeLessThanOrEqual(32);
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  if(width<=820){
   const footerBox=await footer.boundingBox(),navBox=await app.locator('.bottom-nav').boundingBox();
   expect(footerBox!.y+footerBox!.height).toBeLessThanOrEqual(navBox!.y);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`airport-footer-${width}.png`)});
 });
}
