import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
import {taxRefundCopy} from '../app/airport-tax-refund-copy';
import {tofuCharacters} from './font-glyphs';

for(const lang of ['ko','en','zh','ja'] as const)for(const width of [320,390,430,1280])test(`tax refund ${lang} ${width}: conditional inspection and source conflict`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const c=taxRefundCopy[lang];const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:'2026-08-31T03:00:00Z'}}));
 await page.goto(`/${lang}/airport?terminal=T2`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const preparation=page.getByTestId('departure-preparation');await expect(preparation).toHaveAttribute('open','');await preparation.getByTestId('prep-route').selectOption('T2');await preparation.getByTestId('prep-taxRefund').selectOption('YES');
 const guide=page.getByTestId('tax-refund-guide');await expect(guide).toHaveCount(1);await expect(guide.locator('img')).toHaveCount(0);
 await guide.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(guide.locator('.tax-refund-body')).toHaveAttribute('data-terminal','T2');
 await expect(guide.locator('[data-step=PREPARE] img')).toHaveAttribute('src',/PREPARE.webp$/);
 await expect(guide.locator('[data-step=CONDITIONAL_INSPECTION] h3')).toHaveText(c.inspection);
 await expect(guide.getByTestId('tax-baggage-note')).toHaveText(c.checkedNote);await guide.getByRole('button',{name:c.carry,exact:true}).click();await expect(guide.getByTestId('tax-baggage-note')).toHaveText(c.carryNote);
 const order=await guide.evaluate(el=>{const inspection=el.querySelector('[data-step=CONDITIONAL_INSPECTION]')!,security=el.querySelector('[data-testid=tax-security-step]')!,refund=el.querySelector('[data-step=REFUND_COLLECTION]')!;return {inspection:inspection.getBoundingClientRect().bottom,security:security.getBoundingClientRect().top,refund:refund.getBoundingClientRect().top};});expect(order.security).toBeGreaterThanOrEqual(order.inspection);expect(order.refund).toBeGreaterThan(order.security);
 await expect(guide.getByTestId('tax-locations')).toContainText('F, G');await guide.getByRole('button',{name:c.after,exact:true}).click();await expect(guide.getByTestId('tax-t2-conflict')).toHaveText(c.conflict);
 await expect(guide.locator('[data-source=AIRPORT_GUIDE]')).not.toBeVisible();await guide.getByText(c.sourceDetails,{exact:true}).click();await expect(guide.locator('[data-source=AIRPORT_GUIDE]')).toContainText('07:00');await expect(guide.locator('[data-source=KTO]')).toContainText('225, 249, 274');await expect(guide.locator('[data-source=KTO]')).toContainText('07:30');
 await guide.getByText(c.eligibility,{exact:true}).click();await expect(guide).toContainText(c.immediate);await guide.getByText(c.sources,{exact:true}).click();await expect(guide).toContainText(c.updated);
 expect(await tofuCharacters(guide)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 for(const terminal of ['T1','CONCOURSE','T2']) {await guide.getByRole('combobox').selectOption(terminal);await expect(guide.locator('.tax-refund-body')).toHaveAttribute('data-terminal',terminal);if(terminal==='T1')await expect(guide.getByTestId('tax-locations')).toContainText('28');if(terminal==='CONCOURSE')await expect(guide.getByTestId('tax-locations')).toContainText(c.pharmacy);}
 expect(errors).toEqual([]);
});
