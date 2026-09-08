import {test,expect,chromium,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {pc,type PersonalLang} from '../lib/personal-copy';
async function fixture(page:Page) {
  await page.route('**/api/live/summary*',async route=>{
    const date=new URL(route.request().url()).searchParams.get('date')??SUMMARY_FIXTURE.todayKst;
    await route.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,dayRelation:date===SUMMARY_FIXTURE.todayKst?'TODAY':'FUTURE',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}}});
  });
}
async function setup(page:Page,lang:PersonalLang='ko',location='airport') {
  const form=page.getByTestId('personal-onboarding');
  await expect(form).toBeVisible();
  await form.locator('[data-role="manager"]').click();
  await form.getByRole('button',{name:pc('next',lang),exact:true}).click();
  await form.locator(`[data-location="${location}"]`).click();
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
