import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

// The business screen's code (its briefing and industry guide) loads with that
// screen. A phone reaches it through More, so More starts that load once it is
// idle, and the screen then opens whole in its first frame instead of showing
// an empty slot while its code arrives.
// The screen components only (app/business-prep.tsx, not lib/business-prep.ts), in dev or built form.
const businessCode=(url:string)=>/\/(?:app|assets)\/(business-prep|industry-guide)(?:\.tsx|-[\w-]+\.js)$/.exec(new URL(url).pathname)?.[1];
test('More prepares the business screen, which then opens without a gap',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const requested=new Set<string>(),errors:string[]=[];
 page.on('request',request=>{const code=request.resourceType()==='script'&&businessCode(request.url());if(code)requested.add(code);});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/myeongdong');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.waitForTimeout(1000);
 expect([...requested],'a Seoul page does not load the business screen').toEqual([]);
 await page.locator('.bottom-nav a[href="/ko/more"]').click();
 await expect(page).toHaveURL(/\/ko\/more$/);
 await expect.poll(()=>[...requested].sort(),{message:'More starts loading the business screen'}).toEqual(['business-prep','industry-guide']);
 await page.waitForLoadState('networkidle');
 await page.evaluate(()=>{
  const w=window as unknown as {firstBusinessFrame?:{prep:boolean;guide:boolean}};
  new MutationObserver((_,observer)=>{const view=document.querySelector('.business-view');if(!view)return;observer.disconnect();w.firstBusinessFrame={prep:Boolean(view.querySelector('[data-testid="business-prep"]')),guide:Boolean(view.querySelector('[data-testid="industry-guide"]'))};}).observe(document.body,{childList:true,subtree:true});
 });
 await page.locator('.more-section-links a[href="/ko/business"]').click();
 await expect(page).toHaveURL(/\/ko\/business$/);
 await expect(page.getByTestId('business-prep')).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as {firstBusinessFrame?:unknown}).firstBusinessFrame),'the first frame of the business screen already holds its briefing and guide').toEqual({prep:true,guide:true});
 expect(errors).toEqual([]);
});

// The business route passes its briefing and guide in from its server page, so
// hydration keeps the server-rendered screen instead of removing it while the
// code loads (the glance had the same fault before PR #364).
test('the business route keeps its server-rendered briefing and guide through hydration',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 const ids=['business-prep','industry-guide'];
 await page.addInitScript((ids)=>{
  const w=window as unknown as {removed?:string[]};w.removed=[];
  new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node instanceof Element)for(const id of ids)if(node.matches(`[data-testid="${id}"]`)||node.querySelector(`[data-testid="${id}"]`))w.removed!.push(id);}).observe(document,{childList:true,subtree:true});
 },ids);
 const html=await (await page.goto('/ko/business',{waitUntil:'commit'}))!.text();
 for(const id of ids)expect(html,`the server HTML already holds ${id}`).toContain(`data-testid="${id}"`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('business-prep')).toBeVisible();
 await page.waitForTimeout(1000);
 await expect(page.getByTestId('industry-guide')).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as {removed?:string[]}).removed),'the server-rendered screen stays in place').toEqual([]);
});
