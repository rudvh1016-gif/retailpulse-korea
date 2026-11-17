import {test,expect,type Request} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

// The business screen's code (its briefing and industry guide) loads with that
// screen. A phone reaches it through More, so More starts that load once it is
// idle, and the screen then opens whole in its first frame instead of showing
// an empty slot while its code arrives. (The shell itself fetches only the
// industry guide once a loaded screen is idle; the briefing waits for More.)
// The screen components only (app/business-prep.tsx, not lib/business-prep.ts), in dev or built form.
const businessCode=(url:string)=>/\/(?:app|assets)\/(business-prep|industry-guide)(?:\.tsx|-[\w-]+\.js)$/.exec(new URL(url).pathname)?.[1];
test('More prepares the business screen, which then opens without a gap',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const requested=new Set<string>(),errors:string[]=[];
 const completed=new Set<string>(),pendingScripts=new Set<Request>(),scriptFailures:string[]=[];
 page.on('request',request=>{
  if(request.resourceType()!=='script')return;
  pendingScripts.add(request);
  const code=businessCode(request.url());if(code)requested.add(code);
 });
 page.on('response',response=>{
  if(response.request().resourceType()==='script'&&!response.ok())scriptFailures.push(`${response.status()} ${response.url()}`);
 });
 page.on('requestfinished',request=>{
  pendingScripts.delete(request);
  const code=request.resourceType()==='script'&&businessCode(request.url());if(code)completed.add(code);
 });
 page.on('requestfailed',request=>{
  if(!pendingScripts.delete(request))return;
  scriptFailures.push(`${request.failure()?.errorText} ${request.url()}`);
 });
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.waitForTimeout(1000);
 // The shell may fetch the industry guide once idle (the airport screen needs it too); the briefing itself stays with 매장.
 expect([...requested].filter(code=>code!=='industry-guide'),'airport home does not load the business briefing').toEqual([]);
 await page.locator('.bottom-nav a[href^="/ko/more"]').click();
 await expect(page).toHaveURL(/\/ko\/more(?:\?|$)/);
 await expect.poll(()=>[...requested].sort(),{message:'More starts loading the business screen'}).toEqual(['business-prep','industry-guide']);
 // The CI trace has unfinished 503 bodies from background passenger/week
 // references. Wait for the real preloaded scripts and their dependencies,
 // rather than making unrelated API traffic part of module readiness.
 await expect.poll(()=>({completed:[...completed].sort(),pending:[...pendingScripts].map(request=>request.url()),failures:scriptFailures}),{message:'Both preloaded modules and their script dependencies finish successfully'}).toEqual({completed:['business-prep','industry-guide'],pending:[],failures:[]});
 await page.evaluate(()=>{
  const w=window as unknown as {firstBusinessFrame?:{prep:boolean;guide:boolean}};
  new MutationObserver((_,observer)=>{const view=document.querySelector('.business-view');if(!view)return;observer.disconnect();w.firstBusinessFrame={prep:Boolean(view.querySelector('[data-testid="business-prep"]')),guide:Boolean(view.querySelector('[data-testid="industry-guide"]'))};}).observe(document.body,{childList:true,subtree:true});
 });
 await page.locator('.more-section-links a[href^="/ko/business"]').click();
 await expect(page).toHaveURL(/\/ko\/business(?:\?|$)/);
 await expect(page.getByTestId('business-prep')).toBeVisible();
 await expect(page.getByTestId('industry-guide')).toBeVisible();
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
