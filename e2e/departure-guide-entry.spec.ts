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
 // Preserve the former news column's exact responsive width, not a wider replacement card.
 const originalWidth=await entry.evaluate(node=>{const parent=node.parentElement!.parentElement!,style=getComputedStyle(parent);const contentWidth=parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);return (Math.min(contentWidth,856)-16)/2;});
 expect(Math.abs(bounds.width-originalWidth)).toBeLessThanOrEqual(1);
 const minimum=width<=600&&lang==='en'?72:64;expect(await entry.evaluate(node=>parseFloat(getComputedStyle(node).minHeight))).toBe(minimum);expect(bounds.height).toBeGreaterThanOrEqual(minimum);
 // height:auto must still accommodate longer labels; compare with the unchanged former two-column layout.
 const former=await entry.evaluate(node=>{const launcher=node.parentElement!,parent=launcher.parentElement!,style=getComputedStyle(parent),clone=launcher.cloneNode(true) as HTMLElement;const contentWidth=parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);clone.inert=true;Object.assign(clone.style,{position:'fixed',visibility:'hidden',pointerEvents:'none',width:`${Math.min(contentWidth,856)}px`,maxWidth:'856px',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)'});const news=clone.querySelector('a')!;news.style.gridColumn='2';parent.append(clone);try{const rect=news.getBoundingClientRect();return {width:rect.width,height:rect.height};}finally{clone.remove();}});
 expect(Math.abs(bounds.width-former.width)).toBeLessThanOrEqual(1);expect(Math.abs(bounds.height-former.height)).toBeLessThanOrEqual(1);
 const imageBounds=(await image.boundingBox())!;expect(imageBounds.width).toBe(width<=600?40:56);expect(imageBounds.height).toBe(width<=600?40:42);
 await expect(page.locator('.airport-purpose-links')).toHaveCount(0);await expect(page.locator('a[href="#airport-data-flow"]')).toHaveCount(0);await expect(page.locator('#airport-data-flow')).toBeVisible();await expect(page.locator('#airport-data-flow').getByRole('tab',{name:'T1',exact:true})).toBeVisible();await expect(page.locator('.airport-context-nav')).toBeVisible();
 await entry.focus();await expect(entry).toBeFocused();expect(await entry.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
 expect(await tofuCharacters(entry)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.keyboard.press('Enter');await expect(page).toHaveURL(new RegExp(`/${lang}/airport-news$`));await expect(page.getByTestId('airport-customs-news')).toBeVisible();expect(errors).toEqual([]);
});
