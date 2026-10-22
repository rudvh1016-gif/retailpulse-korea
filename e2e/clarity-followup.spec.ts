import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';

for(const lang of ['ko','en','zh','ja'] as const) for(const width of [360,390,430,1280]) {
 test(`clarity ${lang} ${width}: standalone news entry and retained header`,async({page})=>{
  await page.setViewportSize({width,height:900}); await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
  await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const trip=page.getByTestId('airport-customs-news-entry');
  await expect(page.getByTestId('departure-preparation')).toHaveCount(0);await expect(page.getByTestId('departure-guide-entry')).toHaveCount(0);
  await expect(trip).toBeVisible();await expect(trip).toHaveAttribute('href',`/${lang}/airport-news`);
  await trip.focus();await expect(trip).toBeFocused();
  await expect(page.getByRole('banner')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
  if(lang==='ko'&&width===390){await trip.click();await expect(page).toHaveURL(/\/ko\/airport-news/);await expect(page.getByTestId('airport-customs-news')).toBeVisible();await expect(page.locator('a[href*="/travel-records"]')).toHaveCount(0);await page.goto('/ko/travel-records');await expect(page).toHaveURL(/\/ko\/travel-records/);await expect(page.getByTestId('travel-records')).toHaveAttribute('data-hydrated','true');await expect(page.getByTestId('travel-empty')).toBeVisible();await expect(page.getByTestId('travel-card')).toHaveCount(0);}
 });
}

test('tourism desk removes show/copy actions and keeps the official event details',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.goto('/ko/tourism-desk/myeongdong');
 await expect(page.locator('.tourism-desk')).toBeVisible();await expect(page.locator('#tourism-visitor-title')).toHaveCount(0);
 await expect(page.locator('.tourism-event-actions button')).toHaveCount(0);await expect(page.locator('.tourism-event-facts')).not.toHaveCount(0);
});
