import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
import { passengerCopy } from '../lib/passenger-copy';
for (const lang of ['ko','en','zh','ja'] as const) {
  for (const tomorrow of [false,true]) test(`${lang} ${tomorrow?'tomorrow':'today'} passenger meaning agrees across personal/full and terminals`, async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    // Without a fixed clock the fixture's 08-31 bands are months behind the
    // wall clock, so "this hour" is always 확인 불가 and the current-hour cell
    // goes untested. Pin the clock to the payload's own generatedAt, exactly
    // as routeSummary does, so the band the fixture calls "now" really is now.
    await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
    await page.addInitScript(({key,tomorrow})=>localStorage.setItem(key,JSON.stringify({version:1,role:'manager',location:'airport',selectedLocations:['airport'],terminal:'all',selectedTerminals:['all'],interests:['passengers'],day:tomorrow?'tomorrow':'today',selectedDays:tomorrow?['tomorrow','today']:['today','tomorrow'],analytics:false})),{key:PREFERENCE_KEY,tomorrow});
    await page.route('**/api/live/summary*', async route=>{
      const date=new URL(route.request().url()).searchParams.get('date') ?? '2026-08-31';
      await route.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,dayRelation:date>'2026-08-31'?'FUTURE':'TODAY',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date,transferForecast:[{terminal:'T1',serviceDate:date,expectedTransferPassengers:559,retrievedAt:'2026-08-30T08:10:00Z'},{terminal:'T2',serviceDate:date,expectedTransferPassengers:10485,retrievedAt:'2026-08-30T08:10:00Z'}]}}});
    });
    await page.goto(`/${lang}`);
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
    // 숫자 혼용 금지. 한눈에 보기 줄의 칸들은 선택한 터미널 자기 필드만 읽어야
    // 한다. 픽스처는 세 범위를 서로 다른 숫자로 갈라 두었으므로(전체 5,110 /
    // 6,320, T1 3,500, T2 2,900), 탭을 옮겼을 때 앞 범위의 숫자가 남아 있으면
    // 그건 이웃 범위의 값을 빌려 쓴 것이다.
    const glance=page.locator('.airport-glance-strip');
    await expect(glance).toHaveAttribute('data-scope','all');
    if (!tomorrow) await expect(glance).toContainText('5,110');
    await expect(glance).toContainText('6,320');
    for (const terminal of ['T1','T2']) {
      await page.getByRole('tab',{name:terminal,exact:true}).click();
      await expect(page.getByRole('tab',{name:terminal,exact:true})).toHaveAttribute('aria-selected','true');
      await expect(glance).toHaveAttribute('data-scope',terminal);
      await expect(glance).toContainText(terminal==='T1'?'3,500':'2,900');
      for (const foreign of ['5,110','6,320',terminal==='T1'?'2,900':'3,500']) await expect(glance).not.toContainText(foreign);
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
