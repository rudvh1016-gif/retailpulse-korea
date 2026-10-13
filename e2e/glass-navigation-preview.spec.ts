import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
async function setup(page:Page){
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false}}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:{status:'MISSING',data:null}}));
}
for(const width of [360,390,430,1440])test(`glass navigation preserves menus, dates, area and history ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await setup(page);await page.goto('/ko/hongdae?date=2026-08-31');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const nav=page.locator(width<821?'.bottom-nav':'.top-nav'),links=nav.locator('a');await expect(nav).toBeVisible();await expect(links).toHaveCount(width<821?6:7);
 if(width>=821)await expect(nav.getByRole('link',{name:'매장',exact:true})).toBeVisible();
 for(const link of await links.all()){const box=await link.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
 await nav.getByRole('link',{name:'공항',exact:true}).click();await expect(page).toHaveURL(/\/ko\/airport\?date=2026-08-31/);await expect(nav.getByRole('link',{name:'공항',exact:true})).toHaveAttribute('aria-current','page');
 await nav.getByRole('link',{name:'서울',exact:true}).click();await expect(page).toHaveURL(/\/ko\/hongdae\?date=2026-08-31/);await page.goBack();await expect(page).toHaveURL(/\/ko\/airport\?date=2026-08-31/);await page.goBack();await expect(page).toHaveURL(/\/ko\/hongdae\?date=2026-08-31/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('horizontal drag snaps once; vertical movement leaves navigation unchanged',async({page})=>{
 await page.setViewportSize({width:390,height:950});await setup(page);await page.goto('/ko');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');const nav=page.locator('.bottom-nav'),links=nav.locator('a'),first=await links.first().boundingBox(),last=await links.last().boundingBox();
 await page.mouse.move(first!.x+first!.width/2,first!.y+15);await page.mouse.down();await page.mouse.move(last!.x+last!.width/2,last!.y+15,{steps:12});await page.mouse.up();await expect(page).toHaveURL(/\/ko\/more$/);await expect(links.last()).toHaveAttribute('aria-current','page');await expect(nav).not.toHaveAttribute('data-dragging','true');
 const url=page.url();await page.mouse.move(first!.x+first!.width/2,first!.y+15);await page.mouse.down();await page.mouse.move(first!.x+first!.width/2,first!.y-60,{steps:8});await page.mouse.up();expect(page.url()).toBe(url);
});
test('keyboard focus and finite navigation animation respect reduced motion',async({page})=>{
 await page.setViewportSize({width:390,height:950});await setup(page);await page.goto('/ko');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');const nav=page.locator('.bottom-nav'),links=nav.locator('a');await links.first().focus();await page.keyboard.press('ArrowRight');await expect(links.nth(1)).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/ko\/airport$/);
 await expect.poll(()=>nav.locator('.glass-nav-indicator').evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.emulateMedia({reducedMotion:'reduce'});await links.last().click();expect(await nav.locator('.glass-nav-indicator').evaluate(e=>e.getAnimations().length)).toBe(0);expect(await page.locator('main.page-shell').evaluate(e=>e.getAnimations().length)).toBe(0);
});
for(const lang of ['en','zh','ja'])test(`glass navigation keeps readable localized labels ${lang}`,async({page})=>{
 await page.setViewportSize({width:360,height:950});await setup(page);await page.goto(`/${lang}`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.locator('.bottom-nav a')).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 for(const item of await page.locator('.bottom-nav a').all())expect(await item.evaluate(e=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight)).toBe(true);
});

test('desktop preserves plain operating menu and cancels mobile feedback on resize',async({page})=>{
 await page.setViewportSize({width:390,height:950});await setup(page);await page.goto('/ko');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.locator('.bottom-nav a').last().click();await page.setViewportSize({width:1440,height:950});
 const nav=page.locator('.top-nav');await expect(nav).toBeVisible();await expect(nav.locator('a')).toHaveCount(7);await expect(nav.locator('svg,.navigation-icon')).toHaveCount(0);await expect(page.locator('.bottom-nav')).toBeHidden();
 await expect.poll(()=>page.locator('main.page-shell').evaluate(e=>e.getAnimations().length)).toBe(0);
 await nav.getByRole('link',{name:'매장',exact:true}).click();await expect(page).toHaveURL(/\/ko\/business$/);await expect(nav.getByRole('link',{name:'매장',exact:true})).toHaveAttribute('aria-current','page');
 expect(await page.locator('main.page-shell').evaluate(e=>e.getAnimations().length)).toBe(0);
 expect(await nav.locator('a').first().evaluate(e=>getComputedStyle(e).transform)).toBe('none');
 await page.goBack();await expect(page).toHaveURL(/\/ko\/more$/);
});
