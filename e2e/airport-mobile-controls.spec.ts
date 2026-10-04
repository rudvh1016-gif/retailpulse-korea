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
  const map=overview.getByTestId('departure-map');
  const buildingTabs=map.locator(':scope > .terminal-selector button');
  await expect(buildingTabs.first()).toContainText('T1·T2·탑승동');
  await expect(buildingTabs.last()).toHaveText('탑승동');
  expect(await buildingTabs.last().evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap');
  expect((await buildingTabs.last().boundingBox())!.height).toBeLessThanOrEqual(44);

  const zones=page.getByTestId('map-zone-countries');
  const total=()=>zones.locator('[data-side][data-total]').evaluateAll(nodes=>nodes.reduce((sum,node)=>sum+Number(node.getAttribute('data-total')),0));
  await expect.poll(total).toBe(4);
  for (const [index,count] of [[1,1],[2,1],[3,1],[0,4]] as const) {
    await buildingTabs.nth(index).focus();
    await page.keyboard.press('Space');
    await expect(buildingTabs.nth(index)).toHaveAttribute('aria-pressed','true');
    await expect.poll(total).toBe(count);
  }

  const presets=map.locator(':scope > .date-nav-shortcuts button');
  await presets.nth(1).click();
  await expect(presets.nth(1)).toHaveAttribute('aria-pressed','true');
  await presets.last().click();
  await expect(map.getByTestId('map-from')).toBeVisible();
  await map.getByTestId('map-from').selectOption('11');
  await map.getByTestId('map-to').selectOption('12');
  await expect.poll(total).toBe(0);
  if (width===320) {
    const boxes=await Promise.all((await presets.all()).map(button=>button.boundingBox()));
    expect(boxes[0]!.y).toBe(boxes[1]!.y);
    expect(boxes[1]!.y).toBe(boxes[2]!.y);
    expect(boxes[3]!.y).toBe(boxes[4]!.y);
    expect(boxes[3]!.y).toBeGreaterThan(boxes[0]!.y);
  }

  const unknown=page.locator('.gate-leader-zones > section[data-side="UNVERIFIED"]').first();
  await expect(unknown).toBeVisible();
  expect(await unknown.locator('p').evaluate(el=>getComputedStyle(el).borderLeftWidth)).toBe('1px');
  await top.getByRole('tab',{name:'T2',exact:true}).click();
  await expect(top.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');
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
  const map=page.getByTestId('airport-departure-overview').getByTestId('departure-map');
  await expect(map.locator(':scope > .terminal-selector button').last()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
