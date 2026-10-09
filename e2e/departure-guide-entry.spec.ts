import {test,expect} from '@playwright/test';
import {departureGuideEntryCopy} from '../app/departure-guide-entry-copy';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';

for(const lang of ['ko','en','zh','ja'] as const)for(const width of [320,390,1280])test(`departure guide entry ${lang} ${width}: compact text button, keyboard and image action`,async({page})=>{
 await page.setViewportSize({width,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
 await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const guide=page.getByTestId('departure-preparation'),entry=page.getByTestId('departure-guide-entry'),c=departureGuideEntryCopy[lang];
 await expect(entry).toContainText(c.title);await expect(entry).toContainText(c.open);await expect(guide).not.toHaveAttribute('open');
 const image=entry.locator('img');await expect(image).toHaveAttribute('src','/visuals/travel-records/v1/departure.webp');await expect.poll(()=>image.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 // naturalWidth is density-adjusted by srcset; decode the source bitmap for its actual dimensions.
 expect(await image.evaluate(async(i:HTMLImageElement)=>{await i.decode();const bitmap=await createImageBitmap(await(await fetch(i.currentSrc)).blob());const dimensions=[bitmap.width,bitmap.height];bitmap.close();return dimensions;})).toEqual([960,720]);
 const bounds=(await entry.boundingBox())!,imageBounds=(await image.boundingBox())!;expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.height).toBeLessThanOrEqual(116);expect(bounds.width).toBeLessThanOrEqual(420);expect(imageBounds.width).toBe(width<600?48:80);expect(imageBounds.height).toBe(width<600?36:60);await expect(entry.getByRole('img')).toHaveCount(0);
 await expect(page.locator('.airport-purpose-links')).toHaveCount(0);await expect(page.locator('a[href="#airport-data-flow"]')).toHaveCount(0);await expect(page.locator('#airport-data-flow')).toBeVisible();await expect(page.locator('#airport-data-flow').getByRole('tab',{name:'T1',exact:true})).toBeVisible();await expect(page.locator('.airport-context-nav')).toBeVisible();
 await entry.focus();await page.keyboard.press('Shift');await expect(entry).toBeFocused();expect(await entry.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
 await page.keyboard.press('Enter');await expect(guide.getByTestId('passenger-basic-steps').locator(':scope >li')).toHaveCount(5);await expect(entry).toContainText(c.close);
 await expect(page.getByTestId('travel-records-entry')).toBeVisible();await expect(page.getByTestId('travel-records-entry')).toHaveAttribute('href',`/${lang}/travel-records`);
 await guide.getByTestId('prep-route').locator('[data-testid$="-T2"]').click();await entry.focus();await page.keyboard.press('Space');await expect(guide).not.toHaveAttribute('open');await expect(entry).toContainText(c.open);
 await entry.getByText(c.title,{exact:true}).click();await expect(guide).toHaveAttribute('open','');await expect(guide.getByTestId('prep-route')).toHaveAttribute('data-value','T2');
 await entry.getByText(c.title,{exact:true}).click();await expect(guide).not.toHaveAttribute('open');await image.click();await expect(guide).toHaveAttribute('open','');await expect(guide.getByTestId('prep-route')).toHaveAttribute('data-value','T2');
 expect(await tofuCharacters(entry)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
