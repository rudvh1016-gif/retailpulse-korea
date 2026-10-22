import {test,expect} from '@playwright/test';
import {airportNewsCopy} from '../lib/airport-customs-news-copy';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';

for(const lang of ['ko','en','zh','ja'] as const)for(const width of [320,390,1280])test(`standalone news entry ${lang} ${width}: keyboard and retained airport navigation`,async({page})=>{
 await page.setViewportSize({width,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
 await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const entry=page.getByTestId('airport-customs-news-entry');await expect(entry).toHaveText(airportNewsCopy[lang].entry);await expect(entry).toHaveAttribute('href',`/${lang}/airport-news`);
 await expect(page.getByTestId('departure-guide-entry')).toHaveCount(0);await expect(page.getByTestId('departure-preparation')).toHaveCount(0);
 const image=entry.locator('img');await expect(image).toHaveAttribute('src','/visuals/news/v1/paper-news-128.webp');await expect.poll(()=>image.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 const bounds=(await entry.boundingBox())!;expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.width).toBeLessThanOrEqual(420);await expect(entry.getByRole('img')).toHaveCount(0);
 await expect(page.locator('.airport-purpose-links')).toHaveCount(0);await expect(page.locator('a[href="#airport-data-flow"]')).toHaveCount(0);await expect(page.locator('#airport-data-flow')).toBeVisible();await expect(page.locator('#airport-data-flow').getByRole('tab',{name:'T1',exact:true})).toBeVisible();await expect(page.locator('.airport-context-nav')).toBeVisible();
 await entry.focus();await expect(entry).toBeFocused();expect(await entry.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
 expect(await tofuCharacters(entry)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.keyboard.press('Enter');await expect(page).toHaveURL(new RegExp(`/${lang}/airport-news$`));await expect(page.getByTestId('airport-customs-news')).toBeVisible();expect(errors).toEqual([]);
});
