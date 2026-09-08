import { test, expect, type Locator } from '@playwright/test';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
import { passengerCopy } from '../lib/passenger-copy';
async function expectHeadline(brief: Locator, selected = false) {
  await expect(brief.locator('.airport-brief-total')).toBeVisible();
  const arithmetic = await brief.locator('.airport-brief-total').getAttribute('data-basis') === 'ARITHMETIC_ONLY';
  await expect(brief).toContainText(passengerCopy[arithmetic ? selected ? 'summedSelected' : 'summedToday' : selected ? 'selected' : 'today'].ko);
  await expect(brief).toContainText(passengerCopy[arithmetic ? 'arithmeticNote' : 'limitation'].ko);
  if (arithmetic) await expect(brief.locator('.airport-passenger-components')).toContainText(' + ');
}
for(const width of [390,1280]) test(`production Seoul and airport truth closure ${width}px`, async({page})=>{
  test.setTimeout(180000);
  await page.setViewportSize({width,height:900});
  await page.addInitScript(key=>localStorage.setItem(key,JSON.stringify({version:1,role:'manager',location:'myeongdong',selectedLocations:['myeongdong','hongdae','seongsu','airport'],terminal:'all',selectedTerminals:['all'],interests:['passengers','weather','events','crowding'],day:'today',selectedDays:['today','tomorrow','yesterday'],analytics:false})),PREFERENCE_KEY);
  await page.goto('/ko');
  for(const area of ['myeongdong','hongdae','seongsu']) {
    await page.locator(`[data-view-location="${area}"]`).click();
    await expect(page.locator('.personal-briefing .area-current-brief, [data-testid="personal-briefing"] .area-current-brief').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`production-visual-results/closure-${area}-${width}.png`,fullPage:false});
  }
  await page.locator('[data-view-location="airport"]').click();
  await expectHeadline(page.locator('.airport-current-brief'));
  await page.screenshot({path:`production-visual-results/closure-personal-airport-${width}.png`,fullPage:false});
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  for(const terminal of ['T1','T2']) {
    await page.getByRole('tab',{name:terminal,exact:true}).click();
    await expect(page.getByRole('tab',{name:terminal,exact:true})).toHaveAttribute('aria-selected','true');
    await expectHeadline(page.locator('.airport-current-brief'));
    await page.screenshot({path:`production-visual-results/closure-${terminal}-${width}.png`,fullPage:false});
  }
  const selectedResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/live/summary' && Boolean(url.searchParams.get('date')) && response.ok();
  });
  await page.getByRole('button',{name:'내일',exact:true}).click();
  const selected = await (await selectedResponse).json();
  expect(selected.dayRelation).toBe('FUTURE');
  const tomorrowTotal = selected.airport?.todayExpectedPassengersByTerminal?.T2;
  const tomorrowBrief = page.locator('.airport-current-brief');
  if (typeof tomorrowTotal === 'number') {
    await expectHeadline(tomorrowBrief,true);
    const transfers = (selected.airport.transferForecast ?? []).filter((r: {terminal:string; serviceDate:string}) => r.terminal === 'T2' && r.serviceDate === selected.serviceDateKst);
    const total = transfers.length === 1 && selected.airport.forecastCoverage?.byTerminal.T2 === 'COMPLETE' ? tomorrowTotal + transfers[0].expectedTransferPassengers : tomorrowTotal;
    await expect(tomorrowBrief.locator('.airport-brief-total')).toContainText(`${Math.round(total).toLocaleString('ko-KR')}명`);
  } else {
    // A new KST day can precede the first hourly A5 run. Verify absence truth,
    // not a made-up passenger number merely to satisfy a live-site assertion.
    await expect(tomorrowBrief).toContainText('이 날짜의 공식 예상 승객 자료 없음');
    await expect(tomorrowBrief.locator('.airport-brief-total')).toHaveCount(0);
  }
  await expect(tomorrowBrief.locator('.passenger-transfer-limitation')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.airport-current-brief')).not.toContainText('전체 공식 예상 출국객');
  await page.screenshot({path:`production-visual-results/closure-tomorrow-${width}.png`,fullPage:false});
  for(const path of ['/ko/more','/ko/about']) {
    await page.goto(path);
    await expect(page.getByText(passengerCopy.limitation.ko,{exact:false}).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('공항 승객에는 내국인과 환승객 등이 포함');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
