import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
import {passengerGuideCopy} from '../app/passenger-guide-copy';

for(const width of [320,390,430])test(`Blender passenger guide ${width}: readable steps and optional refund`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:'2026-08-31T03:00:00Z'}}));
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const prep=page.getByTestId('departure-preparation'),steps=prep.getByTestId('passenger-basic-steps');
 await expect(prep).toHaveAttribute('open','');
 await expect(steps.locator(':scope > li')).toHaveCount(5);
 await expect(steps.locator('h4')).toHaveText(passengerGuideCopy.ko.titles.map((title,i)=>`${i+1} · ${title}`));
 await expect(steps.locator('.passenger-terminal-label')).toHaveText(['T1','T2']);
 const detail=steps.locator('details').first();await detail.locator('summary').focus();await page.keyboard.press('Space');await expect(detail).toHaveAttribute('open','');await page.keyboard.press('Space');await expect(detail).not.toHaveAttribute('open','');
 await expect(prep.getByTestId('passenger-learning-note')).toHaveText(passengerGuideCopy.ko.learning);
 await expect(prep.getByTestId('prep-refund-eligibility')).toContainText(passengerGuideCopy.ko.eligibility);
 await prep.getByTestId('prep-route').selectOption('T1');await prep.getByTestId('prep-taxRefund').selectOption('NO');await expect(prep.getByTestId('tax-refund-guide')).toHaveCount(0);
 await prep.getByTestId('prep-taxRefund').selectOption('YES');const refund=prep.getByTestId('tax-refund-guide');await refund.locator(':scope > summary').click();
 await expect(refund.locator('[data-step=KIOSK_REGISTRATION] img')).toHaveAttribute('src','/passenger-guide/v1/refund_register-128.webp');
 await expect(refund.locator('[data-step=REFUND_COLLECTION] img')).toHaveAttribute('src','/passenger-guide/v1/refund_receive-128.webp');
 const images=prep.locator('img[src*="/passenger-guide/v1/"]');await expect(images).toHaveCount(7);
 for(const img of await images.all()){
  await img.scrollIntoViewIfNeeded();await expect(img).toHaveJSProperty('complete',true);
  const pixels=await img.evaluate((el:HTMLImageElement)=>{const canvas=document.createElement('canvas');canvas.width=el.naturalWidth;canvas.height=el.naturalHeight;const ctx=canvas.getContext('2d')!;ctx.drawImage(el,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=0,visible=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;if(data[i]>0)visible++;}return {width:el.naturalWidth,height:el.naturalHeight,transparent,visible};});
  expect(pixels.width).toBe(128);expect(pixels.height).toBe(128);expect(pixels.transparent).toBeGreaterThan(100);expect(pixels.visible).toBeGreaterThan(100);
 }
 const terminal=prep.getByTestId('prep-route');await terminal.selectOption('T2');await terminal.selectOption('T1_CONCOURSE');await terminal.selectOption('T1_CONCOURSE');await expect(prep.getByTestId('tax-refund-guide')).toHaveCount(1);
 const links=await prep.locator('a[href^="https:"]').evaluateAll(els=>els.map(el=>el.getAttribute('href')!));expect(links).toContain('https://customs.go.kr/incheon_airport/cm/cntnts/cntntsView.do?cntntsId=6688&mi=12547');expect(links.every(url=>['www.airport.kr','customs.go.kr','english.visitkorea.or.kr'].includes(new URL(url).hostname))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await prep.scrollIntoViewIfNeeded();await prep.screenshot({path:`test-results/passenger-guide-${width}.png`});
});
