import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
import {departurePreparationCopy} from '../app/airport-departure-preparation-copy';

for(const lang of ['ko','en','zh','ja'] as const) for(const width of [360,390,430,1280]) {
 test(`clarity ${lang} ${width}: closed travel entry, baggage branches, retained header`,async({page})=>{
  await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
  await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const guide=page.getByTestId('departure-preparation'),entry=page.getByTestId('departure-guide-entry'),trip=page.getByTestId('travel-records-entry');
  await expect(guide).not.toHaveAttribute('open');await expect(trip).toBeVisible();await expect(trip).toHaveAttribute('href',`/${lang}/travel-records`);
  const left=(await entry.boundingBox())!,right=(await trip.boundingBox())!;expect(right.x).toBeGreaterThanOrEqual(left.x+left.width-1);expect(Math.abs(right.y-left.y)).toBeLessThan(3);
  await entry.focus();await page.keyboard.press('Enter');const copy=departurePreparationCopy[lang];
  await guide.getByTestId('prep-baggage-YES').click();await expect(guide.getByTestId('prep-baggage-status')).toContainText(copy.drop);
  await guide.getByTestId('prep-route').selectOption('T2');
  for(const choice of ['NO','YES','NO','YES'] as const){
   await guide.getByTestId(`prep-baggage-${choice}`).click();await expect(guide.getByTestId('prep-checkedBaggage')).toHaveValue(choice);
   await expect(guide.getByTestId(`prep-baggage-${choice}`)).toHaveAttribute('aria-pressed','true');await expect(guide.getByTestId('prep-plan')).toHaveAttribute('open','');
   await expect(guide.locator('[data-step="BAG_DROP"]')).toHaveCount(choice==='YES'?1:0);
  }
  await guide.getByTestId('prep-checkedBaggage').selectOption('NO');await expect(guide.getByTestId('prep-baggage-NO')).toHaveAttribute('aria-pressed','true');
  await expect(guide.getByTestId('prep-baggage-status')).toContainText(copy.securityStep);
  await entry.focus();await page.keyboard.press('Enter');await expect(guide).not.toHaveAttribute('open');await expect(trip).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
  if(lang==='ko'&&width===390){await trip.click();await expect(page).toHaveURL(/\/ko\/travel-records/);await expect(page.getByTestId('travel-records')).toHaveAttribute('data-hydrated','true');await expect(page.getByTestId('travel-empty')).toBeVisible();await expect(page.getByTestId('travel-card')).toHaveCount(0);}
 });
}

test('tourism desk removes show/copy actions and keeps the official event details',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.goto('/ko/tourism-desk/myeongdong');
 await expect(page.locator('.tourism-desk')).toBeVisible();await expect(page.locator('#tourism-visitor-title')).toHaveCount(0);
 await expect(page.locator('.tourism-event-actions button')).toHaveCount(0);await expect(page.locator('.tourism-event-facts')).not.toHaveCount(0);
});
