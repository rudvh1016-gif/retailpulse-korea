import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';

async function fixtures(page:import('@playwright/test').Page){
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:'2026-08-31',flights:[],truncated:false,retrievedAt:null}}));
}
for(const lang of ['ko','en','zh','ja'] as const)for(const width of[360,390,430,1280])test(`verified dated duty-free strip fits and cites each online shop ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));await fixtures(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const vendorRequests:string[]=[];page.on('request',r=>{if(/shilladfs|ssgdfs|hddfs/.test(r.url()))vendorRequests.push(r.url());});
 await page.goto(`/${lang}/airport`);const strip=page.getByTestId('airport-duty-free-exchange');
 await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await expect(strip.getByTestId('duty-free-rate')).toHaveText('1 USD = 1,343.40 KRW');
  expect(await strip.evaluate(node=>node.closest('.topbar') !== null && node.previousElementSibling?.classList.contains('install-app-button'))).toBe(true);
  const install=page.locator('.topbar .install-app-button'),language=page.getByLabel('Language',{exact:true});
  const positions=await Promise.all([install.boundingBox(),strip.boundingBox(),language.boundingBox()]);
  expect(positions.every(Boolean)).toBe(true);
  const [installBox,rateBox,languageBox]=positions as Array<{x:number;y:number;width:number;height:number}>;
  expect(installBox.x+installBox.width).toBeLessThanOrEqual(rateBox.x+1);expect(rateBox.x+rateBox.width).toBeLessThanOrEqual(languageBox.x+1);
  expect(Math.abs(installBox.y+installBox.height/2-rateBox.y-rateBox.height/2)).toBeLessThan(4);
 await strip.locator('summary').focus();await page.keyboard.press('Enter');await expect(strip.locator('details')).toHaveAttribute('open');
  const detailBox=await strip.locator('.duty-free-rate-detail').boundingBox();expect(detailBox).not.toBeNull();expect(detailBox!.x).toBeGreaterThanOrEqual(0);expect(detailBox!.x+detailBox!.width).toBeLessThanOrEqual(width+1);
 await expect(strip.locator('a[href="https://www.shilladfs.com/estore/kr/ko/"]')).toHaveCount(1);await expect(strip.locator('a[href="https://www.ssgdfs.com/kr/main/initMain/"]')).toHaveCount(1);
 await expect(strip.locator('time')).toHaveCount(2);expect(await tofuCharacters(strip)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);expect(vendorRequests).toEqual([]);
  if(lang==='ko')await strip.locator('.duty-free-rate-detail').screenshot({path:info.outputPath(`duty-free-sources-${width}.png`)});
  await page.keyboard.press('Escape');await expect(strip.locator('details')).not.toHaveAttribute('open');await expect(strip.locator('summary')).toBeFocused();
  await install.click();await expect(page.locator('.install-modal')).toBeVisible();await page.keyboard.press('Escape');await expect(install).toBeFocused();
  await language.selectOption(lang==='en'?'ko':'en');await expect(language).toHaveValue(lang==='en'?'ko':'en');
  await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await language.selectOption(lang);if(lang==='ko'){await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());await page.locator('.site-header').screenshot({path:info.outputPath(`duty-free-exchange-${width}.png`)});}
});
test('a mounted strip expires across KST midnight and focus cannot revive yesterday',async({page})=>{
 await page.clock.install({time:new Date('2026-10-08T14:59:50Z')});await page.clock.pauseAt(new Date('2026-10-08T14:59:50Z'));await fixtures(page);await page.goto('/ko/airport');
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
 await page.clock.runFor(10051);await expect(strip).toHaveAttribute('data-state','UNAVAILABLE');await expect(strip.getByTestId('duty-free-rate')).toHaveCount(0);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(strip.getByTestId('duty-free-rate')).toHaveCount(0);
});
test('future observations and a historical selection are withheld',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-08T02:00:00Z'));await fixtures(page);await page.goto('/en/airport');
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','UNAVAILABLE');await expect(strip.getByTestId('duty-free-rate')).toHaveCount(0);
 await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));await page.goto('/en/airport?date=2026-10-07');await expect(strip).toHaveAttribute('data-state','UNAVAILABLE');await expect(strip.getByTestId('duty-free-rate')).toHaveCount(0);
});
