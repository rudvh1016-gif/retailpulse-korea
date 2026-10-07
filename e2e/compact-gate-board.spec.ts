import { expect, test, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { airportSides } from '../lib/airport-sides-summary';

const date = '2026-08-31';
const gateCounts = [['246', 7], ['247', 7], ['249', 4], ['250', 4], ['251', 4], ['252', 4], ['255', 7], ['245', 1], ['253', 2]] as const;
const records = gateCounts.flatMap(([gate, count]) => Array.from({length: count}, (_, i) => ({
  physicalFlightId: `${gate}-${i}`, flightNumber: `TEST${gate}${i}`, terminal: 'T2', gate,
  direction: 'departure', scheduledAt: `${date}T09:00:00+09:00`, retrievedAt: `${date}T03:00:00Z`, status: 'scheduled', airportCode: 'NRT',
})));

test.use({hasTouch: true});

async function open(page: Page, width: number, lang = 'ko', unknown = false) {
  await page.setViewportSize({width, height: 900});
  await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
  const flights = unknown ? [...records, {...records[0], physicalFlightId: 'unknown', flightNumber: 'TEST999', gate: '999'}] : [...records].reverse();
  await page.route('**/api/live/summary*', routeSummary({...SUMMARY_FIXTURE, airport: {...SUMMARY_FIXTURE.airport, sides: airportSides(date, 'TODAY', [], flights, [], false, false)}}));
  await page.route('**/api/live/flights*', route => route.fulfill({json: {mode: 'live-flights', basis: 'COLLECTED_FLIGHT_RECORDS', flights, truncated: false, retrievedAt: `${date}T03:00:00Z`}}));
  await page.goto(`/${lang}/airport?terminal=T2`);
  const board = page.getByTestId('gate-pillar-model');
  await expect(board.locator('.gate-leader-zones .gate-pillar')).toHaveCount(3);
  await board.scrollIntoViewIfNeeded();
  return board;
}

for (const width of [320, 390, 430, 1280]) test(`three gate representatives retain all records with text-only disclosure ${width}`, async ({page}) => {
  const board = await open(page, width);
  const zones = board.locator('.gate-leader-zones > section');
  expect(await zones.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-side')))).toEqual(['WEST', 'CENTER', 'EAST']);
  const cards = board.locator('.gate-leader-zones .gate-pillar');
  expect(await cards.evaluateAll(nodes => nodes.map(n => [n.getAttribute('data-gate'), n.getAttribute('data-flights')]))).toEqual([['246', '7'], ['249', '4'], ['255', '7']]);
  await expect(zones.nth(0).locator('.gate-zone-heading')).toContainText('공동 최다 2곳');
  await expect(zones.nth(1).locator('.gate-zone-heading')).toContainText('공동 최다 4곳');
  await expect(zones.nth(2).locator('.gate-zone-heading small')).toHaveCount(0);
  const boxes = await zones.evaluateAll(nodes => nodes.map(n => {const r = n.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right};}));
  expect(new Set(boxes.map(b => b.y)).size).toBe(1);
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].x);
  expect(boxes[1].right).toBeLessThanOrEqual(boxes[2].x);
  for (const label of await board.locator('.gate-visual-name').all()) {
    expect(Number.parseFloat(await label.evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    await expect(label).toHaveCSS('color', 'rgb(0, 0, 0)');
  }
  const images = board.locator('img');
  await expect(images).toHaveCount(3);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el:HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  await board.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 180));
  await board.screenshot({path:`test-results/compact-board-${width}.png`});
  const disclosure = board.getByTestId('gate-all-list');
  const summary = disclosure.locator('summary');
  await expect(summary).toContainText('다른 탑승구 보기');
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(disclosure.locator('input')).toHaveCount(0);
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await summary.focus();
  await expect(summary).toBeFocused();
  expect(await summary.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open');
  for (const [gate, count] of gateCounts) await expect(disclosure.locator('.gate-full-list li').filter({hasText:`T2 · ${gate} ·`})).toContainText(`${count}편`);
  await expect(disclosure.locator('img')).toHaveCount(0);
  await disclosure.screenshot({path:`test-results/compact-list-${width}.png`});
  await page.keyboard.press('Space');
  await expect(disclosure).not.toHaveAttribute('open');
  await summary.tap();
  await expect(disclosure).toHaveAttribute('open');
  await disclosure.locator('[data-zone=CENTER]').click();
  const centerRows = disclosure.locator('.gate-full-list li');
  await expect(centerRows).toHaveCount(4);
  await centerRows.filter({hasText:'250'}).getByRole('button').click();
  await expect(board.getByTestId('gate-selected').locator('li')).toHaveCount(4);
  await expect(board.getByTestId('gate-selected').locator('img')).toHaveCount(0);
  await disclosure.locator('[data-zone=ALL]').click();
  await disclosure.locator('input').fill('247');
  await expect(disclosure.locator('.gate-full-list li')).toHaveCount(1);
  await expect(disclosure.locator('.gate-full-list li')).toContainText('7편');
  await disclosure.locator('input').fill('');
  const more = disclosure.locator('.airport-flight-more');
  while (await more.count()) await more.click();
  const allRows = disclosure.locator('.gate-full-list li');
  const listedTotal = await disclosure.locator('[role=status]').innerText();
  expect(await allRows.count()).toBe(Number(listedTotal.split('/')[1].trim()));
  expect(await allRows.count()).toBeGreaterThan(20);
  await expect(board.locator('img')).toHaveCount(3);
  await summary.tap();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await board.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('unpositioned gate records remain accessible without a fourth image', async ({page}) => {
  const board = await open(page, 320, 'ko', true);
  await expect(board.getByTestId('gate-unverified-count')).toHaveText('위치 미확인: 1편');
  await board.getByTestId('gate-all-list').locator('summary').click();
  await board.locator('[data-zone=UNVERIFIED]').click();
  await expect(board.locator('.gate-full-list li')).toHaveCount(1);
  await expect(board.locator('.gate-full-list li')).toContainText('999');
  await board.locator('.gate-full-list button').click();
  await expect(board.getByTestId('gate-selected')).toContainText('TEST999');
  await expect(board.locator('img')).toHaveCount(3);
});
