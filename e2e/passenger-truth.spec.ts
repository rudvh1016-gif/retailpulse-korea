import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
import { passengerCopy } from '../lib/passenger-copy';
for (const lang of ['ko','en','zh','ja'] as const) {
  for (const tomorrow of [false,true]) test(`${lang} ${tomorrow?'tomorrow':'today'} passenger meaning agrees across personal/full and terminals`, async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    await page.addInitScript(({key,tomorrow})=>localStorage.setItem(key,JSON.stringify({version:1,role:'manager',location:'airport',selectedLocations:['airport'],terminal:'all',selectedTerminals:['all'],interests:['passengers'],day:tomorrow?'tomorrow':'today',selectedDays:tomorrow?['tomorrow','today']:['today','tomorrow'],analytics:false})),{key:PREFERENCE_KEY,tomorrow});
    await page.route('**/api/live/summary*', async route=>{
      const date=new URL(route.request().url()).searchParams.get('date') ?? '2026-08-31';
      await route.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,dayRelation:date>'2026-08-31'?'FUTURE':'TODAY',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date,transferForecast:[{terminal:'T1',serviceDate:date,expectedTransferPassengers:559,retrievedAt:'2026-08-30T08:10:00Z'},{terminal:'T2',serviceDate:date,expectedTransferPassengers:10485,retrievedAt:'2026-08-30T08:10:00Z'}]}}});
    });
    await page.goto(`/${lang}`);await page.locator('.personal-existing > summary').click();
    const personal=page.getByTestId('personal-briefing').locator('.airport-current-brief');
    await expect(personal).toContainText(passengerCopy[tomorrow?'summedSelected':'summedToday'][lang]);
    await expect(personal).toContainText(passengerCopy.arithmeticNote[lang]);
    await expect(personal.getByTestId('transfer-forecast')).toContainText('10,485');
    await expect(personal.locator('.airport-reference-total')).toHaveAttribute('data-basis','ARITHMETIC_ONLY');
    await expect(personal.locator('.airport-reference-total')).toContainText('58,364');
    await expect(personal.locator('.airport-passenger-components')).toContainText('47,320');
    await expect(personal.locator('.airport-passenger-components')).toContainText('11,044');
    const scope=await personal.locator('.departure-hall-scope-note').first().textContent();
    await page.goto(`/${lang}/airport`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated","true");
    if (tomorrow) await page.getByRole('button',{name:{ko:'내일',en:'Tomorrow',zh:'明天',ja:'明日'}[lang],exact:true}).click();
    for (const terminal of ['T1','T2']) {
      await page.getByRole('tab',{name:terminal,exact:true}).click();
      await expect(page.getByRole('tab',{name:terminal,exact:true})).toHaveAttribute('aria-selected','true');
      const full=page.locator('.airport-current-brief');
      await expect(full).toContainText(passengerCopy[tomorrow?'summedSelected':'summedToday'][lang]);
      await expect(full.locator('.departure-hall-scope-note').first()).toContainText(passengerCopy.scope[lang]);
      expect(scope).toContain(passengerCopy.scope[lang]);
      await expect(full).toContainText(passengerCopy.arithmeticNote[lang]);
      await expect(full.locator('.airport-reference-total')).toContainText(terminal==='T1'?'30,659':'27,705');
      await expect(full.locator('.airport-passenger-components')).toContainText(terminal==='T1'?'30,100':'17,220');
      await expect(full.getByTestId('transfer-forecast')).toContainText(terminal==='T1'?'559':'10,485');
      await expect(full.getByTestId('transfer-forecast')).not.toContainText(terminal==='T1'?'10,485':'T1');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  });
  test(`${lang} missing transfer is visible and never zero`,async({page})=>{
    await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
    await page.goto(`/${lang}/airport`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated","true");
    const transfer=page.getByTestId('transfer-forecast');
    await expect(transfer).toContainText(passengerCopy.unavailable[lang]);
    await expect(transfer).not.toContainText(/0(?:명|人| people)/);
    await expect(page.locator('[data-basis="ARITHMETIC_ONLY"]')).toHaveCount(0);
    await expect(page.locator('.passenger-transfer-limitation')).toBeVisible();
  });
}
