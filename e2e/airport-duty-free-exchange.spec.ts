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
 expect(await strip.evaluate(node=>node.previousElementSibling?.classList.contains('view-intro'))).toBe(true);
 await strip.locator('summary').focus();await page.keyboard.press('Enter');await expect(strip.locator('details')).toHaveAttribute('open');
 await expect(strip.locator('a[href="https://www.shilladfs.com/estore/kr/ko/"]')).toHaveCount(1);await expect(strip.locator('a[href="https://www.ssgdfs.com/kr/main/initMain/"]')).toHaveCount(1);
 await expect(strip.locator('time')).toHaveCount(2);expect(await tofuCharacters(strip)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);expect(vendorRequests).toEqual([]);
 if(lang==='ko'){await strip.locator('summary').press('Space');await expect(strip.locator('details')).not.toHaveAttribute('open');await strip.screenshot({path:info.outputPath(`duty-free-exchange-${width}.png`)});}
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
