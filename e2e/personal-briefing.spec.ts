import {test,expect,chromium,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {pc,type PersonalLang} from '../lib/personal-copy';
async function fixture(page:Page) {
  await page.route('**/api/live/summary*',async route=>{
    const date=new URL(route.request().url()).searchParams.get('date')??SUMMARY_FIXTURE.todayKst;
    await route.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,dayRelation:date===SUMMARY_FIXTURE.todayKst?'TODAY':date<SUMMARY_FIXTURE.todayKst?'PAST':'FUTURE',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}}});
  });
}
async function setup(page:Page,lang:PersonalLang='ko',location='airport') {
  const form=page.getByTestId('personal-onboarding');
  await expect(form).toBeVisible();
  await form.locator('[data-role="manager"]').click();
  await form.getByRole('button',{name:pc('next',lang),exact:true}).click();
  await form.locator(`[data-location="${location}"]`).click();
  if(location!=='airport') await form.locator('[data-location="airport"]').click();
  if(location==='airport') await form.getByRole('button',{name:'T1',exact:true}).click();
  await form.getByRole('button',{name:pc('next',lang),exact:true}).click();
  await form.getByRole('button',{name:pc('next',lang),exact:true}).click();
  await expect(form.locator('[data-day="tomorrow"]')).toHaveAttribute('aria-pressed','true');
  await form.getByRole('button',{name:pc('finish',lang),exact:true}).click();
  await expect(page.getByTestId('personal-briefing')).toContainText(pc('managerTomorrow',lang));
}
for(const lang of ['ko','en','zh','ja'] as const) for(const width of [390,768,1280,1920]) {
  test(`personal setup and briefing ${lang} ${width}`,async({page})=>{
    await page.setViewportSize({width,height:900});await fixture(page);await page.goto(`/${lang}`);
    await setup(page,lang);
    await expect(page.getByTestId('personal-briefing')).toContainText('2026-09-01');
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.reload();await expect(page.getByTestId('personal-briefing')).toBeVisible();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  });
}
test('reopening with persisted browser state, editing, feedback and reset',async({page,browser})=>{
  await fixture(page);await page.goto('/ko');await setup(page);
  const state=await page.context().storageState();
  const context=await browser.newContext({storageState:state});const reopened=await context.newPage();
  await fixture(reopened);await reopened.goto('/ko');await expect(reopened.getByTestId('personal-briefing')).toBeVisible();
  await reopened.getByRole('button',{name:'도움됐어요',exact:true}).click();
  await reopened.reload();await expect(reopened.getByRole('button',{name:'도움됐어요',exact:true})).toBeDisabled();
  await reopened.getByText('내 설정 보기',{exact:true}).click();
  await reopened.getByRole('button',{name:'설정 변경',exact:true}).click();
  await setup(reopened,'ko','seongsu');
  await expect(reopened.getByTestId('personal-briefing')).toContainText('성수');
  await reopened.getByText('내 설정 보기',{exact:true}).click();
  await reopened.getByRole('button',{name:'처음부터 다시 설정',exact:true}).click();
  await expect(reopened.getByTestId('personal-onboarding')).toBeVisible();
  await context.close();
});

test('multiple locations, terminals and all three days persist and switch to the matching date',async({page})=>{
  await page.setViewportSize({width:390,height:900});await fixture(page);await page.goto('/ko');
  const f=page.getByTestId('personal-onboarding');await f.locator('[data-role="manager"]').click();
  await f.getByRole('button',{name:pc('next','ko'),exact:true}).click();
  await f.locator('[data-location="seongsu"]').click();
  await expect(f.locator('[data-location="airport"]')).toHaveAttribute('aria-pressed','true');
  await f.getByRole('button',{name:'T1',exact:true}).click();await f.getByRole('button',{name:'T2',exact:true}).click();
  await f.getByRole('button',{name:pc('next','ko'),exact:true}).click();
  await expect(f.getByRole('checkbox',{name:pc('weather','ko'),exact:true})).toBeVisible();
  await f.getByRole('button',{name:pc('next','ko'),exact:true}).click();
  await f.locator('[data-day="yesterday"]').click();await f.locator('[data-day="today"]').click();
  for(const day of ['yesterday','today','tomorrow'])await expect(f.locator(`[data-day="${day}"]`)).toHaveAttribute('aria-pressed','true');
  await f.getByRole('button',{name:pc('finish','ko'),exact:true}).click();
  await page.locator('[data-view-day="yesterday"]').click();
  await expect(page.getByTestId('personal-briefing')).toContainText('2026-08-30');
  await page.locator('[data-view-terminal="T2"]').click();
  await expect(page.locator('.personal-place')).toContainText('T2');
  await page.locator('[data-view-location="seongsu"]').click();
  await expect(page.locator('.personal-place')).toContainText('성수');
  await expect(page.locator('.personal-facts')).not.toContainText(pc('flights','ko'));
  await page.reload();
  await expect(page.locator('[data-view-location]')).toHaveCount(2);
  await expect(page.locator('[data-view-day]')).toHaveCount(3);
  await expect(page.locator('[data-view-terminal]')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('corrupt or denied storage leaves setup usable and shows save limitation',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('denied','SecurityError');};});
  await fixture(page);await page.goto('/ko');await setup(page);
  await expect(page.getByText('이 기기에 저장하지 못했어요.',{exact:false})).toBeVisible();
});
test('public detail routes remain directly available without onboarding',async({page})=>{
  await fixture(page);await page.goto('/ko/airport');
  await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  await expect(page.locator('h1')).toBeVisible();
});
test('settings survive closing and relaunching a persistent browser',async({},testInfo)=>{
  const profile=testInfo.outputPath('device-profile');
  let context=await chromium.launchPersistentContext(profile,{headless:true});
  let page=await context.newPage();await fixture(page);await page.goto('http://127.0.0.1:4173/ko');await setup(page);
  await context.close();
  context=await chromium.launchPersistentContext(profile,{headless:true});
  page=await context.newPage();await fixture(page);await page.goto('http://127.0.0.1:4173/ko');
  await expect(page.getByTestId('personal-briefing')).toContainText('내일 영업 브리핑');
  await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  await context.close();
});
test('brand returns to the personal home while Seoul navigation retains the area route',async({page})=>{
  await fixture(page);await page.goto('/ko');await setup(page);
  await page.locator('.top-nav').getByRole('link',{name:'서울',exact:true}).click();
  await expect(page).toHaveURL(/\/ko\/myeongdong$/);
  await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
  await page.getByRole('button',{name:'KORETAIL home',exact:true}).click();
  await expect(page).toHaveURL(/\/ko$/);
  await expect(page.getByTestId('personal-briefing')).toBeVisible();
  await expect(page).toHaveTitle('인천공항·명동·홍대·성수 오늘·내일 브리핑 | KORETAIL');
});

test('mobile briefing can be reopened from airport with one active navigation item',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await fixture(page);await page.goto('/ko');await setup(page);
  const nav=page.locator('nav.bottom-nav');
  await expect(nav.locator('[aria-current="page"]')).toHaveText('내 브리핑');
  await nav.getByRole('link',{name:'공항',exact:true}).click();
  await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
  await nav.getByRole('link',{name:'내 브리핑',exact:true}).click();
  await expect(page.getByTestId('personal-briefing')).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
});
