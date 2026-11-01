import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
async function setup(page:Page){
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false}}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:{status:'MISSING',data:null}}));
}
// More's approved aligned rows include the generated chevron in their accessible names.
for(const width of [360,390,430,1440])test(`glass navigation preserves menus, dates, area and history ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await setup(page);await page.goto('/ko/hongdae?date=2026-08-31');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const nav=page.locator(width<821?'.bottom-nav':'.top-nav'),links=nav.locator('a');await expect(nav).toBeVisible();await expect(links).toHaveCount(width<821?5:6);
 await expect(nav.getByRole('link',{name:'미리 준비',exact:true})).toBeVisible();
 for(const link of await links.all()){const box=await link.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
 await nav.getByRole('link',{name:'공항현황',exact:true}).click();await expect(page).toHaveURL(/\/ko\/airport\?date=2026-08-31/);await expect(nav.getByRole('link',{name:'공항현황',exact:true})).toHaveAttribute('aria-current','page');
 await nav.getByRole('link',{name:'더보기',exact:true}).click();await page.locator('.more-section-links').getByRole('link',{name:'서울 ›',exact:true}).click();await expect(page).toHaveURL(/\/ko\/hongdae\?date=2026-08-31/);await page.goBack();await expect(page).toHaveURL(/\/ko\/more/);await page.goBack();await expect(page).toHaveURL(/\/ko\/airport\?date=2026-08-31/);await page.goBack();await expect(page).toHaveURL(/\/ko\/hongdae\?date=2026-08-31/);
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
 await page.setViewportSize({width:360,height:950});await setup(page);await page.goto(`/${lang}`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.locator('.bottom-nav a')).toHaveCount(5);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 for(const item of await page.locator('.bottom-nav a').all())expect(await item.evaluate(e=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight)).toBe(true);
});

test('desktop preserves plain operating menu and cancels mobile feedback on resize',async({page})=>{
 await page.setViewportSize({width:390,height:950});await setup(page);await page.goto('/ko');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.locator('.bottom-nav a').last().click();await page.setViewportSize({width:1440,height:950});
 const nav=page.locator('.top-nav');await expect(nav).toBeVisible();await expect(nav.locator('a')).toHaveCount(6);await expect(nav.locator('svg,.navigation-icon')).toHaveCount(0);await expect(page.locator('.bottom-nav')).toBeHidden();
 await expect.poll(()=>page.locator('main.page-shell').evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.locator('.more-section-links').getByRole('link',{name:'매장 ›',exact:true}).click();await expect(page).toHaveURL(/\/ko\/business$/);await expect(nav.getByRole('link',{name:'더보기',exact:true})).toHaveAttribute('aria-current','location');
 expect(await page.locator('main.page-shell').evaluate(e=>e.getAnimations().length)).toBe(0);
 expect(await nav.locator('a').first().evaluate(e=>getComputedStyle(e).transform)).toBe('none');
 await page.goBack();await expect(page).toHaveURL(/\/ko\/more$/);
});

// Release checks (owner, 2026-10-14): small-screen clipping, bottom safe area,
// content never hidden behind the bar. Order and functions are covered above.
for(const lang of ['ko','en','zh','ja'])test(`320px phone keeps every label inside its target and the page above the bar ${lang}`,async({page})=>{
 await page.setViewportSize({width:320,height:568});await setup(page);await page.goto(`/${lang}/hongdae`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.bottom-nav a')).toHaveCount(5);
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
 // The glass floats 12px above the 34px inset, as the owner's reference bar does (2026-10-14).
 expect(Math.abs(bar.bottom-844)).toBeLessThanOrEqual(1);expect(bar.glass).toBe('46px');
 for(const bottom of bar.links)expect(bottom).toBeLessThanOrEqual(844-46);
});
// Owner, 2026-10-14: "첨부파일 이미지의 하단 아이콘을 거의 더 유사하기배껴봐" — the reference tab bar
// (noah0316 wedding-invitation, MIT): grey glass 14px from the sides and 62px tall, a glass pill
// behind the current menu, 24px filled icons over 10px labels, ink when idle, blue when current.
test('mobile tab bar follows the owner reference look',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const look=await page.locator('.bottom-nav').evaluate(n=>{const css=(e:Element,p:string,pseudo?:string)=>getComputedStyle(e,pseudo).getPropertyValue(p),root=getComputedStyle(document.documentElement),links=[...n.querySelectorAll('a')],current=n.querySelector('a[aria-current]')!,idle=links.find(a=>a!==current)!,pill=n.querySelector('.glass-nav-indicator')!,box=n.getBoundingClientRect(),pillBox=pill.getBoundingClientRect(),currentBox=current.getBoundingClientRect();
  return {left:box.left,right:innerWidth-box.right,glassRadius:css(n,'border-top-left-radius','::before'),glassHeight:box.height-parseFloat(css(n,'bottom','::before')),pillRadius:css(pill,'border-top-left-radius'),pillOverCurrent:Math.abs(pillBox.left-currentBox.left)<=1&&Math.abs(pillBox.width-currentBox.width)<=1,
   icon:[...n.querySelectorAll('svg')].map(s=>s.getBoundingClientRect().width),label:css(idle.querySelector('span')!,'font-size'),idle:css(idle,'color'),current:css(current,'color'),ink:root.getPropertyValue('--ink').trim(),blue:root.getPropertyValue('--blue').trim()};});
 expect(look.left).toBe(14);expect(look.right).toBe(14);expect(look.glassRadius).toBe('33px');expect(look.glassHeight).toBe(62);expect(look.pillRadius).toBe('27px');expect(look.pillOverCurrent).toBe(true);
 expect(look.icon).toEqual([24,24,24,24,24]);expect(look.label).toBe('10px');
 const rgb=(hex:string)=>{const full=hex.length===4?`#${[...hex.slice(1)].map(c=>c+c).join('')}`:hex;return `rgb(${parseInt(full.slice(1,3),16)}, ${parseInt(full.slice(3,5),16)}, ${parseInt(full.slice(5,7),16)})`;};
 expect(look.idle).toBe(rgb(look.ink));expect(look.current).toBe('rgb(0, 48, 96)');
 await expect(page.locator('.glass-nav-indicator')).toHaveCSS('background-color','rgba(187, 187, 188, 0.36)');
});
