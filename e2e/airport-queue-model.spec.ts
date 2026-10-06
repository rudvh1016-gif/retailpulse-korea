import { test, expect } from '@playwright/test';
import { routeSummary, SUMMARY_FIXTURE } from './summary-fixture';

function queues() {
  const summary = structuredClone(SUMMARY_FIXTURE);
  const base = summary.airport.congestion.find(row => row.terminal === 'T2')!;
  const rows = ['DG2_B', 'DG2_A', 'DG2_C', 'DG2_D', 'DG1_A', 'DG1_B', 'DG1_D', 'DG1_C'].map((zone, index) => ({
    ...base, zone, waitTimeMinutes: index === 0 ? 11 : index === 1 ? 9 : 6,
    waitTimeRaw: index === 0 ? '11' : index === 1 ? '9' : '6',
    waitingCount: [308, 289, 271, 269, 112, 110, 110, 109][index],
  }));
  summary.airport.congestion = [...summary.airport.congestion.filter(row => row.terminal === 'T1'), ...rows];
  summary.airport.currentBusiestDepartureHallByTerminal.T2 = rows[0];
  return summary;
}

for (const lang of ['ko', 'en', 'zh', 'ja']) for (const width of [320, 390, 430, 1280]) {
  test(`checkpoint cards preserve values and keyboard folding: ${lang} ${width}`, async ({ page }) => {
    await page.setViewportSize({width, height:900});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/live/summary**', routeSummary(queues()));
    await page.goto(`/${lang}/airport?terminal=T2`);
    const section = page.locator('.airport-checkpoints');
    const cards = section.locator('article');
    await expect(cards).toHaveCount(1);
    const toggle = section.getByRole('button');
    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded','true');
    await expect(cards).toHaveCount(8);
    await expect(cards.first()).toContainText('2B');
    await expect(cards.first().locator('b')).toContainText('11');
    await expect(cards.first().locator('p')).toContainText('308');
    await expect(cards.nth(1).locator('p')).toContainText('289');
    await expect(cards.first()).toContainText('14:06');
    await expect(section.locator('.airport-checkpoint-terminal h4')).toHaveCount(1);
    await expect(section.locator('.airport-checkpoint-terminal h4')).toContainText('T2');
    await cards.first().scrollIntoViewIfNeeded();
    await expect.poll(()=>cards.first().locator('img').evaluate((image:HTMLImageElement)=>image.complete && image.naturalWidth>0)).toBe(true);
    const geometry = await cards.evaluateAll(elements => elements.map(element => {
      const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,right:rect.right};
    }));
    expect(geometry[1].y).toBe(geometry[0].y);
    if(width >= 821) expect(geometry[3].y).toBe(geometry[0].y);
    expect(await section.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    expect(geometry.every(rect=>rect.x>=0 && rect.right<=width)).toBe(true);
    expect(await cards.first().locator('strong').evaluate(element=>getComputedStyle(element).fontSize)).toBe('13px');
    if(lang==='ko') await section.screenshot({path:`test-results/queue-model-${width}.png`,style:'header, .bottom-nav, .airport-context-nav { visibility: hidden !important; }'});
    await toggle.click(); await toggle.click();
    await expect(cards).toHaveCount(8);
    await toggle.focus(); await page.keyboard.press('Space');
    await expect(cards).toHaveCount(1);
    await expect(toggle).toBeFocused();
    await page.locator('.airport-view > .terminal-selector').getByRole('tab',{name:'T1',exact:true}).click();
    await expect(section.locator('.airport-checkpoint-terminal h4')).toContainText('T1');
    await expect(cards.first()).toContainText('24');
    await expect(cards.first()).not.toContainText('308');
  });
}

test('raw ranges, stale rows, missing values and confirmed zero stay distinct', async ({page})=>{
  const summary=queues();
  Object.assign(summary.airport.congestion.find(row=>row.zone==='DG2_A')!, {waitTimeMinutes:61,waitTimeRaw:'60+',waitingCount:null,freshness:'STALE'});
  Object.assign(summary.airport.congestion.find(row=>row.zone==='DG2_C')!, {waitTimeMinutes:null,waitTimeRaw:null,waitingCount:null});
  Object.assign(summary.airport.congestion.find(row=>row.zone==='DG2_D')!, {waitTimeMinutes:0,waitTimeRaw:'0',waitingCount:0});
  await page.route('**/api/live/summary**',routeSummary(summary));
  await page.goto('/ko/airport?terminal=T2');
  const section=page.locator('.airport-checkpoints');await section.getByRole('button').click();
  const row=(name:string)=>section.locator('article').filter({has:page.getByText(`출국장 ${name}`,{exact:true})});
  await expect(row('2A')).toContainText('60+분');
  await expect(row('2A')).toContainText('지연됨');
  await expect(row('2C')).toContainText('확인 불가');
  await expect(row('2C')).not.toContainText('0명');
  await expect(row('2D')).toContainText('0분');
  await expect(row('2D')).toContainText('0명');
});
