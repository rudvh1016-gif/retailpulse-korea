import {test, expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

for(const width of [320,360,390,430,820,1440]) {
 test(`route change explanations retain figures and basis at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
  for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const) await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
  await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
  await page.goto('/ko?date=2026-10-19');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const block=page.locator('.focus-selected-country-changes:not(.focus-return-context)').first();
  const rows=block.locator('.focus-country-change-copy');
  await expect(rows.first()).toBeVisible();
  const n=await rows.count();expect(n).toBeGreaterThan(0);
  await expect(block.locator('small')).toContainText('일 일평균 대비');
  for(const row of await rows.all()){
   await expect(row.locator('b')).toContainText('편');
   await expect(row.locator('.change-rate')).toBeVisible();
   await expect(row.locator('.focus-country-change-short')).toBeVisible({visible:width<=700});
   await expect(row.locator('.focus-country-change-full')).toBeVisible({visible:width>700});
   if(width<=700){
    await expect(row.locator('.focus-country-change-short')).toContainText('기준 일평균보다');
    const sizes=await row.evaluate(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight),scroll:e.scrollWidth,client:e.clientWidth}));
    expect(sizes.height).toBeLessThanOrEqual(sizes.line+1);
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client+1);
   }
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(width===320) {
   await rows.first().evaluate(e=>{(e as HTMLElement).style.fontSize='20px'});
   const sizes=await rows.first().evaluate(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight),scroll:e.scrollWidth,client:e.clientWidth}));
   expect(sizes.height).toBeGreaterThan(sizes.line);
   expect(sizes.scroll).toBeLessThanOrEqual(sizes.client+1);
  }
 });
}
