import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
const enabledBuild = process.env.NEXT_PUBLIC_GA4_ENABLED === 'true';
const blockGoogle=/https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com)\//;
const pageViews=(page:import('@playwright/test').Page)=>page.evaluate(() => ((window as Window & {dataLayer?: IArguments[]}).dataLayer ?? []).map(x=>Array.from(x)).filter(x=>x[0]==='event'&&x[1]==='page_view'));
// Owner decision 2026-10-14 (docs/approvals/ga4-default-on-20261014.json): usage analytics is on by
// default and can be turned off on 더보기; EU/EEA/UK/Swiss time zones, GPC and DNT start off.
test.describe('Seoul time zone', () => {
  test.use({ timezoneId: 'Asia/Seoul' });
  test('usage analytics starts on, counts each safe page once and stops immediately after withdrawal', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Never execute Google's SDK or send even a test event to Google
    await page.route(blockGoogle, route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
    await page.route('**/api/live/summary*', route => route.fulfill({json:SUMMARY_FIXTURE}));
    await page.setViewportSize({width:390,height:844});
    await page.goto('/ko/more?email=private#private');
    const choice = page.getByRole('checkbox',{name:'선택적 이용 통계'});
    await expect(choice).toBeEnabled();
    await expect(choice).toBeChecked();
    if (!enabledBuild) {
      await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
      expect(await pageViews(page)).toHaveLength(0);
      await choice.uncheck();
      await page.reload();
      await expect(choice).toBeEnabled();
      await expect(choice).not.toBeChecked();
      return;
    }
    // The first page is counted without any action, with no query, fragment, referrer or title.
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(1);
    await expect.poll(async()=> (await pageViews(page)).length).toBe(1);
    expect(JSON.stringify(await pageViews(page))).not.toContain('private');
    expect((await pageViews(page))[0][2]).toMatchObject({page_location:new URL('/ko/more',page.url()).href,page_referrer:'',page_title:'KORETAIL'});
    await page.locator('.more-section-links a[href="/ko/about"]').click();
    await expect.poll(async()=> (await pageViews(page)).length).toBe(2);
    await page.goBack();
    await expect(choice).toBeVisible();
    await expect.poll(async()=> (await pageViews(page)).length).toBe(3);
    await choice.uncheck();
    await page.locator('.more-section-links a[href="/ko/about"]').click();
    expect(await pageViews(page)).toHaveLength(3);
    await page.reload();
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
  test('Global Privacy Control starts off and loads nothing', async ({ page }) => {
    await page.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{configurable:true,get:()=>true});});
    await page.route(blockGoogle, route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
    await page.route('**/api/live/summary*', route => route.fulfill({json:SUMMARY_FIXTURE}));
    await page.goto('/ko/more');
    const choice = page.getByRole('checkbox',{name:'선택적 이용 통계'});
    await expect(choice).toBeEnabled();
    await expect(choice).not.toBeChecked();
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    expect(await pageViews(page)).toHaveLength(0);
  });
  test('an earlier personal-briefing "no" keeps analytics off', async ({ page }) => {
    const legacyNo=JSON.stringify({version:1,role:'manager',location:'airport',terminal:'all',interests:['passengers'],day:'today',analytics:false});
    await page.route(blockGoogle, route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
    await page.route('**/api/live/summary*', route => route.fulfill({json:SUMMARY_FIXTURE}));
    await page.goto('/ko/more');
    await page.evaluate(value=>localStorage.setItem('koretail-personal-v1',value),legacyNo);
    await page.reload();
    const choice = page.getByRole('checkbox',{name:'선택적 이용 통계'});
    await expect(choice).toBeEnabled();
    await expect(choice).not.toBeChecked();
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
  });
});

test.describe('Europe time zone', () => {
  test.use({ timezoneId: 'Europe/Berlin' });
  test('usage analytics starts off and nothing loads until the visitor turns it on', async ({ page }) => {
    await page.route(blockGoogle, route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
    await page.route('**/api/live/summary*', route => route.fulfill({json:SUMMARY_FIXTURE}));
    await page.goto('/ko/more');
    const choice = page.getByRole('checkbox',{name:'선택적 이용 통계'});
    await expect(choice).toBeEnabled();
    await expect(choice).not.toBeChecked();
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    expect(await pageViews(page)).toHaveLength(0);
    await choice.check();
    if (enabledBuild) await expect.poll(async()=> (await pageViews(page)).length).toBe(1);
    else await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    await page.reload();
    await expect(choice).toBeEnabled();
    await expect(choice).toBeChecked();
  });
});

test.describe('blocked storage', () => {
  test.use({ timezoneId: 'Asia/Seoul' });
  for (const [lang, label] of [['ko','선택적 이용 통계'],['en','Optional usage analytics'],['zh','可选使用统计'],['ja','任意の利用統計']]) test(`consent remains accessible with blocked storage ${lang}`,async({page})=>{
  await page.route(/https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com)\//,route=>route.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.addInitScript(()=>{Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new Error('blocked')}});});
  await page.setViewportSize({width:360,height:800});
  await page.goto(`/${lang}/more`);
  const choice=page.getByRole('checkbox',{name:label});
  await expect(choice).toBeEnabled();
  // On by default; turning it off works with blocked storage and says it applies to this tab only.
  await expect(choice).toBeChecked();
  await choice.focus();await page.keyboard.press('Space');
  await expect(choice).not.toBeChecked();
  await expect(page.locator('.preference-block [role="status"]')).toBeVisible();
  await page.keyboard.press('Space');await expect(choice).toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
});

test.describe('earlier personal-briefing consent', () => {
  // Europe starts off, so a checked box here can only come from the earlier personal-briefing "yes".
  test.use({ timezoneId: 'Europe/Berlin' });
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
});
