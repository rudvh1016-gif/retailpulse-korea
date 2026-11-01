import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tofuCharacters} from './font-glyphs';

// A bundled subset without modern Hangul is an unversioned-resource sentinel.
// Keep it in memory; this regression also works in shallow CI checkouts.
const legacy=readFileSync('public/fonts/pretendard/PretendardVariable.subset.0.woff2');
const revision=createHash('sha256').update(readFileSync('public/fonts/koretail-sans-variable.woff2')).digest('hex').slice(0,12);
for(const width of [1000,1440])test(`menu uses one face even when a legacy font resource exists ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});let legacyRequests=0;const fontRequests:string[]=[];
 page.on('request',request=>{if(request.url().includes('/fonts/koretail-sans-variable.woff2'))fontRequests.push(request.url());});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));
 await page.route('**/fonts/koretail-sans-variable.woff2',r=>{legacyRequests++;return r.fulfill({contentType:'font/woff2',body:legacy});});
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await page.evaluate(()=>document.fonts.ready);
 const menu=page.locator('.shopping-desktop-entry');await expect(menu).toBeVisible();await expect(menu).toHaveText('외국인은 뭘 살까?');
 expect(await tofuCharacters(menu)).toEqual([]);
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 const {root}=await cdp.send('DOM.getDocument'),{nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.shopping-desktop-entry'});
 const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId}) as {fonts:Array<{glyphCount:number;isCustomFont:boolean;familyName:string}>};
 expect(fonts.filter(font=>font.glyphCount>0).map(font=>({custom:font.isCustomFont,family:font.familyName}))).toEqual([{custom:true,family:'KORETAIL Sans Variable'}]);
 expect(legacyRequests).toBe(0);expect(new Set(fontRequests).size).toBe(1);expect(fontRequests.length).toBe(1);
 expect(new URL(fontRequests[0]).searchParams.get('v')).toBe(revision);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('.site-header').screenshot({path:info.outputPath('menu-font.png')});
});
