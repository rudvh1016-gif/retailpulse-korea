import { test, expect } from '@playwright/test';
import { routeSummary, SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
for (const lang of ['ko','en','zh','ja']) for (const width of [360,390,430,1280]) {
  test(`airport-first root preserves Seoul and stored preferences ${lang} ${width}`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
    const stored=JSON.stringify({version:1,role:'manager',location:'hongdae',terminal:'T2',interests:['weather'],day:'today',analytics:false});
    await page.addInitScript(({key,stored})=>localStorage.setItem(key,stored),{key:PREFERENCE_KEY,stored});
    await page.goto(`/${lang}`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
    await expect(page.locator('.airport-today')).toBeVisible();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('nav.bottom-nav a')).toHaveCount(5);
    await expect(page.locator('nav.top-nav a').first()).toHaveAttribute('href',`/${lang}/airport`);
    await expect(page.locator('nav.bottom-nav a').first()).toHaveAttribute('aria-current','page');
    await expect(page.locator('.demand-home')).toHaveCount(0);
    await expect(page.getByTestId('area-demand-card')).toHaveCount(0);
    expect(await page.evaluate(key=>localStorage.getItem(key),PREFERENCE_KEY)).toBe(stored);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    const seoulNavigation = width > 820 ? 'nav.top-nav' : 'nav.bottom-nav';
    await page.locator(`${seoulNavigation} a[href="/${lang}/hongdae"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/hongdae$`));
    await expect(page.locator('.area-current-brief')).toBeVisible();
    await expect(page.getByTestId('area-demand-card')).toBeVisible();
    await page.goBack(); await expect(page.locator('.airport-today')).toBeVisible();
    await page.getByRole('button',{name:'KORETAIL home'}).click();
    await expect(page).toHaveURL(new RegExp(`/${lang}$`));
    await page.getByLabel('Language',{exact:true}).selectOption(lang==='en'?'ko':'en');
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key=>localStorage.getItem(key),PREFERENCE_KEY)).toBe(stored);
  });
}
