import { expect, test } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { airportSides } from '../lib/airport-sides-summary';

const date = '2026-08-31';
const base = {scheduledAt:date+'T10:00:00+09:00',retrievedAt:date+'T01:00:00Z',status:'scheduled',direction:'departure',airportCode:'NRT'};
const flights = [
  {...base,physicalFlightId:'t1',flightNumber:'KE1',terminal:'T1',gate:'1'},
  {...base,physicalFlightId:'conc',flightNumber:'KE2',terminal:'CONCOURSE',gate:null},
  {...base,physicalFlightId:'t2',flightNumber:'KE3',terminal:'T2',gate:'215'},
  {...base,physicalFlightId:'unknown',flightNumber:'KE4',terminal:null,gate:null},
];

for (const width of [320,390,430]) test(`airport mobile selectors and gate text ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  await page.clock.install({time:new Date('2026-10-04T03:00:00Z')});
  const summary={...SUMMARY_FIXTURE,airport:{...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],flights,[],false,false)}};
  await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',basis:'OFFICIAL_DEPARTURE_SCHEDULE',flights,truncated:false,retrievedAt:base.retrievedAt}}));
  await page.goto('/ko/airport');

  const top=page.locator('.airport-view > .terminal-selector');
  await expect(top.getByRole('tab').first()).toContainText('T1·T2');
  await expect(top.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
  const overview=page.getByTestId('airport-departure-overview');
  await overview.scrollIntoViewIfNeeded();
  const map=page.getByTestId('departure-map');
  await expect(map).toBeVisible();
  await expect(overview.getByTestId('departure-map-section')).toHaveCount(0);
  await expect(map.locator(':scope > .terminal-selector')).toHaveCount(0);
  const buildingTabs=top.getByRole('tab');
  await expect(buildingTabs.first()).toContainText('T1·T2');
  await expect(buildingTabs.last()).toHaveText('탑승동');
  const label=await buildingTabs.last().evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),button=el.getBoundingClientRect();return {lines:range.getClientRects().length,textWidth:text.width,buttonWidth:button.width};});
  expect(label.lines).toBe(1);expect(label.textWidth).toBeLessThanOrEqual(label.buttonWidth);
  expect((await buildingTabs.last().boundingBox())!.height).toBeLessThanOrEqual(44);

  const zones=page.getByTestId('map-zone-countries');
  const total=()=>zones.locator('[data-side][data-total]').evaluateAll(nodes=>nodes.reduce((sum,node)=>sum+Number(node.getAttribute('data-total')),0));
  await expect.poll(total).toBe(4);
  for (const [index,count] of [[1,1],[2,1],[3,1],[0,4]] as const) {
    await buildingTabs.nth(index).focus();
    await page.keyboard.press('Space');
    await expect(buildingTabs.nth(index)).toHaveAttribute('aria-selected','true');
    await expect.poll(total).toBe(count);
    if(index===3)await expect(page.getByTestId('concourse-unsupported')).toBeVisible();
  }

  const presets=map.locator(':scope > .date-nav-shortcuts button');
  await expect(presets).toHaveText(['하루 전체','1시간','3시간','6시간','직접 선택']);
  await presets.nth(1).click();
  await expect(presets.nth(1)).toHaveAttribute('aria-pressed','true');
  await presets.last().click();
  await expect(map.getByTestId('map-from')).toBeVisible();
  await map.getByTestId('map-from').selectOption('11');
  await map.getByTestId('map-to').selectOption('12');
  await expect.poll(total).toBe(0);
  if (width===320) {
    // Read one layout frame: separate protocol calls can straddle the browser's scroll adjustment.
    const boxes=await presets.evaluateAll(buttons=>buttons.map(button=>{const b=button.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,height:b.height};}));
    for(const box of boxes){expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);expect(box.height).toBeGreaterThanOrEqual(48);}
    expect(boxes.at(-1)!.y).toBeGreaterThan(boxes[0]!.y);
  }

  await expect(page.locator('.gate-leader-zones > section[data-side="UNVERIFIED"]')).toHaveCount(0);
  const unknown=page.getByTestId('gate-unverified-details');
  await expect(unknown.locator('summary')).toHaveText('※ 위치 미확인 1편');
  await expect(unknown).not.toHaveAttribute('open','');
  await expect(unknown.locator('li')).toHaveCount(0);
  await unknown.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(unknown.locator('li')).toHaveCount(1);
  await expect(unknown.locator('li')).toContainText('KE2');
  await page.keyboard.press('Space');
  await expect(unknown).not.toHaveAttribute('open','');
  await top.getByRole('tab',{name:'T2',exact:true}).click();
  await expect(top.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(unknown).toHaveCount(0);
  await top.getByRole('tab').first().click();
  await page.locator('.airport-context-nav').getByRole('button',{name:'입국',exact:true}).click();
  await expect(top.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
  await expect(top.getByRole('tab').first()).toContainText('T1·T2');
  await expect(page.locator('.airport-arrival-brief')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for (const lang of ['en','zh','ja'] as const) test(`building labels remain contained in ${lang}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',basis:'OFFICIAL_DEPARTURE_SCHEDULE',flights,truncated:false,retrievedAt:base.retrievedAt}}));
  await page.goto(`/${lang}/airport`);
  const map=page.getByTestId('departure-map');
  await expect(map).toBeVisible();
  await expect(map.locator(':scope > .terminal-selector')).toHaveCount(0);
  await expect(page.locator('.airport-view > .terminal-selector').getByRole('tab').last()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
