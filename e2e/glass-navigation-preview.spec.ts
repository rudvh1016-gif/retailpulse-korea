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

// Release checks (owner, 2026-10-14): small-screen clipping, bottom safe area,
// content never hidden behind the bar. Order and functions are covered above.
for(const lang of ['ko','en','zh','ja'])test(`320px phone keeps every label inside its target and the page above the bar ${lang}`,async({page})=>{
 await page.setViewportSize({width:320,height:568});await setup(page);await page.goto(`/${lang}/hongdae`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.bottom-nav a')).toHaveCount(6);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const nav=await page.locator('.bottom-nav').evaluate(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,bottom:b.bottom,top:b.top};});
 expect(nav.left).toBeGreaterThanOrEqual(0);expect(nav.right).toBeLessThanOrEqual(320);expect(Math.abs(nav.bottom-568)).toBeLessThanOrEqual(1);
 for(const item of await page.locator('.bottom-nav a').all()){
  const fit=await item.evaluate(a=>{const b=a.getBoundingClientRect(),s=a.querySelector('span')!.getBoundingClientRect();return {w:b.width,h:b.height,inside:s.top>=b.top-.5&&s.bottom<=b.bottom+.5&&s.left>=b.left-.5&&s.right<=b.right+.5,scroll:a.scrollWidth<=a.clientWidth&&a.scrollHeight<=a.clientHeight};});
  expect(fit.w).toBeGreaterThanOrEqual(44);expect(fit.h).toBeGreaterThanOrEqual(44);expect(fit.inside).toBe(true);expect(fit.scroll).toBe(true);
 }
 await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
 await expect.poll(()=>page.evaluate(()=>{const top=document.querySelector('.bottom-nav')!.getBoundingClientRect().top,footer=document.querySelector('main footer, footer')!.getBoundingClientRect().bottom;return footer<=top;})).toBe(true);
});
test('bottom safe area keeps the glass bar and its targets above the home indicator',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);
 // Chromium's env(safe-area-inset-*) override; an emulation, not an iOS device.
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride' as never,{insets:{top:47,bottom:34,left:0,right:0}} as never);
 await page.goto('/ko/hongdae');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const bar=await page.locator('.bottom-nav').evaluate(n=>({bottom:n.getBoundingClientRect().bottom,links:[...n.querySelectorAll('a')].map(a=>a.getBoundingClientRect().bottom),glass:getComputedStyle(n,'::before').bottom}));
 expect(Math.abs(bar.bottom-844)).toBeLessThanOrEqual(1);expect(bar.glass).toBe('34px');
 for(const bottom of bar.links)expect(bottom).toBeLessThanOrEqual(844-34);
});
