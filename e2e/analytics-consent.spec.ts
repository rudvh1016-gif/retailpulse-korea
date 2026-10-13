import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
const enabledBuild = process.env.NEXT_PUBLIC_GA4_ENABLED === 'true';
test('optional analytics is off initially and safe route views stop immediately after withdrawal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Never execute Google's SDK or send even a test event to Google
  await page.route(/https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com)\//, route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.route('**/api/live/summary*', route => route.fulfill({json:SUMMARY_FIXTURE}));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/ko/more?email=private#private');
  const choice = page.getByRole('checkbox',{name:'선택적 이용 통계'});
  await expect(choice).toBeEnabled();
  await expect(choice).not.toBeChecked();
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
  const views = () => page.evaluate(() => ((window as Window & {dataLayer?: IArguments[]}).dataLayer ?? []).map(x=>Array.from(x)).filter(x=>x[0]==='event'&&x[1]==='page_view'));
  await choice.check();
  if (!enabledBuild) {
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    expect(await views()).toHaveLength(0);
    await choice.uncheck();
    return;
  }
  await expect.poll(async()=> (await views()).length).toBe(1);
  expect(JSON.stringify(await views())).not.toContain('private');
  expect((await views())[0][2]).toMatchObject({page_location:new URL('/ko/more',page.url()).href,page_referrer:'',page_title:'KORETAIL'});
  await page.locator('.more-section-links a[href="/ko/about"]').click();
  await expect.poll(async()=> (await views()).length).toBe(2);
  await page.goBack();
  await expect(choice).toBeVisible();
  await expect.poll(async()=> (await views()).length).toBe(3);
  await choice.uncheck();
  await page.locator('.more-section-links a[href="/ko/about"]').click();
  expect(await views()).toHaveLength(3);
  await page.reload();
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const [lang, label] of [['ko','선택적 이용 통계'],['en','Optional usage analytics'],['zh','可选使用统计'],['ja','任意の利用統計']]) test(`consent remains accessible with blocked storage ${lang}`,async({page})=>{
  await page.route(/https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com)\//,route=>route.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.addInitScript(()=>{Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new Error('blocked')}});});
  await page.setViewportSize({width:360,height:800});
  await page.goto(`/${lang}/more`);
  const choice=page.getByRole('checkbox',{name:label});
  await expect(choice).toBeEnabled();
  await choice.focus();await page.keyboard.press('Space');
  await expect(choice).toBeChecked();
  await expect(page.locator('.preference-block [role="status"]')).toBeVisible();
  await page.keyboard.press('Space');await expect(choice).not.toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('withdrawal overrides legacy consent and synchronizes another tab without rewriting preferences',async({page,context})=>{
  const legacy=JSON.stringify({version:1,role:'manager',location:'airport',terminal:'all',interests:['passengers'],day:'today',analytics:true});
  await context.route(/https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com)\//,route=>route.fulfill({status:200,contentType:'application/javascript',body:''}));
  await context.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.goto('/ko/more');
  await page.evaluate(value=>localStorage.setItem('koretail-personal-v1',value),legacy);
  await page.reload();
  await expect(page.getByRole('checkbox',{name:'선택적 이용 통계'})).toBeChecked();
  const other=await context.newPage();await other.goto('/ko/more');
  await expect(other.getByRole('checkbox',{name:'선택적 이용 통계'})).toBeChecked();
  await page.getByRole('checkbox',{name:'선택적 이용 통계'}).uncheck();
  await expect(other.getByRole('checkbox',{name:'선택적 이용 통계'})).not.toBeChecked();
  expect(await page.evaluate(()=>localStorage.getItem('koretail-personal-v1'))).toBe(legacy);
  await page.reload();await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
});
