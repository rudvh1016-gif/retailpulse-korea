import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';
import { airportSides } from '../lib/airport-sides-summary';
import { sidesCopy } from '../lib/airport-sides-copy';
import { industryProfiles } from '../lib/industry-guidance';
import { prepCopy } from '../lib/business-prep-copy';
import { splitCopy } from '../lib/airport-flight-split-copy';

// SUMMARY_FIXTURE is 2026-08-31 14:10 KST (today).
const DATE = '2026-08-31';
const pad = (hour: number) => String(hour).padStart(2, '0');
const hall = (terminal: string, zone: string, hour: number, value: number, aggregate = false) => ({
  terminal, zone, isAggregate: aggregate ? 1 : 0, targetDate: DATE, timeBandRaw: `${pad(hour)}_${hour === 23 ? '24' : pad(hour + 1)}`,
  targetStartAt: `${DATE}T${pad(hour)}:00:00+09:00`, targetEndAt: hour === 23 ? '2026-09-01T00:00:00+09:00' : `${DATE}T${pad(hour + 1)}:00:00+09:00`,
  expectedPassengers: value, retrievedAt: '2026-08-31T04:42:00Z',
});
const HALL_ROWS = Array.from({ length: 24 }, (_, hour) => [
  hall('T1', 't1dg1', hour, 0), hall('T1', 't1dg2', hour, 100 + hour), hall('T1', 't1dg3', hour, 200 + hour),
  hall('T1', 't1dg4', hour, 150), hall('T1', 't1dg5', hour, 50), hall('T1', 't1dg6', hour, 0),
  hall('T1', 't1dgsum1', hour, 500 + 2 * hour, true),
  hall('T2', 't2dg1', hour, 80), hall('T2', 't2dg2', hour, 120 + hour), hall('T2', 't2dgsum2', hour, 200 + hour, true),
]).flat();
const flight = (id: string, terminal: string | null, gate: string, time: string, status = 'scheduled') =>
  ({ physicalFlightId: id, terminal, gate, scheduledAt: `${DATE}T${time}:00+09:00`, status, retrievedAt: '2026-08-31T05:00:00Z' });
const FLIGHTS = [
  flight('A', 'T1', '9', '15:05'), flight('A', 'T1', '9', '15:05'), flight('B', 'T1', '11', '15:40'), flight('C', 'T1', '29', '15:20'),
  flight('D', 'T1', '27', '16:10'), flight('E', 'T1', '13', '17:00'), flight('F', null, '107', '15:30'), flight('G', 'T2', '274', '18:00'),
  flight('H', 'T1', '12', '15:50', 'cancelled'),
];

function fixture(hallsPublic: boolean) {
  return {
    ...SUMMARY_FIXTURE,
    airport: { ...SUMMARY_FIXTURE.airport, sides: airportSides(DATE, 'TODAY', HALL_ROWS, FLIGHTS, [], false, hallsPublic) },
  };
}

async function open(page: Page, { lang = 'ko', width = 390, hallsPublic = false, side = 'EAST', hours = { open: '09:30', close: '18:00' } as { open: string; close: string } | null, mutate = null as null | ((summary: ReturnType<typeof fixture>) => unknown), terminal = 'T1' }: { lang?: string; width?: number; hallsPublic?: boolean; side?: string | null; hours?: { open: string; close: string } | null; mutate?: null | ((summary: ReturnType<typeof fixture>) => unknown); terminal?: string } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((stored) => localStorage.setItem('koretail-business-v1', stored), JSON.stringify({ version: 1, place: 'airport', terminal, side, hours }));
  await page.route('**/api/live/summary*', routeSummary((mutate ? mutate(fixture(hallsPublic)) : fixture(hallsPublic)) as ReturnType<typeof fixture>));
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(`/${lang}/business`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const prep = page.getByTestId('business-prep');
  await expect(prep.getByTestId('airport-sides')).toBeVisible();
  return prep;
}

test('until the notice condition is met, hall sides are withheld and point to the official page; gates are counted', async ({ page }) => {
  const prep = await open(page);
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T1 동편');
  const sides = prep.getByTestId('airport-sides');
  await expect(sides.getByTestId('sides-notice')).toHaveText(sidesCopy.notice.ko);
  await expect(sides.getByTestId('halls-withheld')).toContainText('안내문구 협의');
  await expect(sides.getByTestId('halls-withheld').getByRole('link')).toHaveAttribute('href', 'https://www.airport.kr/ap_ko/883/subview.do');
  // Codeshares once, cancelled apart, the concourse and T2 kept separate.
  await expect(sides.getByTestId('gates-areas')).toHaveText('T1 본관 5편 · T2 1편 · 탑승동 1편 · 터미널 미확인 0편');
  await expect(sides.getByTestId('gates-sides')).toContainText('동편 2편 · 서편 1편 · 중앙 1편 · 위치 미확인 1편');
  await expect(sides).toContainText('결항편은 합계에서 제외했습니다 (1편)');
  // T1 has 4 of 5 flights at a gate with an evidenced side: the east count is partial.
  await expect(sides.getByTestId('gates-coverage')).toHaveText('위치가 확인된 탑승구의 편수 4/5편 (80%) · 위치 미확인 1편: 위치표에 없는 탑승구 1');
  await expect(sides.getByTestId('gates-partial')).toHaveText(sidesCopy.sideCountsNote.ko);
  // So the fact names its own scope and is never "the east side's busiest hour"…
  const facts = prep.getByTestId('prep-facts');
  await expect(facts).toContainText('위치가 확인된 동편 탑승구 항공편 중 가장 많은 시간 15:00–16:00 · 2편 (위치 미확인 1편 제외, 그중 같은 시간 0편 · 동편 전체의 가장 많은 시간은 아직 알 수 없습니다)');
  await expect(facts).not.toContainText('탑승구 기준 출발편이 가장 많은 시간');
  // …and it never becomes a staffing or stock action; the general checklist stays.
  await expect(prep.getByTestId('prep-actions').locator('li[data-rule="GATE_PEAK"]')).toHaveCount(0);
  // The terminal A5 peak is not relabelled as east while the split is withheld.
  await expect(prep.getByTestId('prep-facts')).not.toContainText('동편 출국장');
});

test('with the hall split published: sides add up, hours never split a band, and the day stays whole', async ({ page }) => {
  const prep = await open(page, { hallsPublic: true });
  const sides = prep.getByTestId('airport-sides');
  const east = Array.from({ length: 24 }, (_, hour) => 300 + 2 * hour).reduce((a, b) => a + b, 0);
  const west = 200 * 24;
  await expect(sides.getByTestId('halls-sides')).toContainText(`동편 ${east.toLocaleString('ko-KR')}명 · 서편 ${west.toLocaleString('ko-KR')}명`);
  await expect(sides.getByTestId('halls-compare')).toContainText(`T1 ${(east + west).toLocaleString('ko-KR')}명 (하루 전체)`);
  // 09:30–18:00: 10–17 whole, 09–10 shown apart and never halved.
  const inside = Array.from({ length: 8 }, (_, i) => 300 + 2 * (10 + i)).reduce((a, b) => a + b, 0);
  await expect(sides.getByTestId('halls-hours')).toContainText(`영업시간 안: ${inside.toLocaleString('ko-KR')}명`);
  await expect(sides.getByTestId('halls-hours')).toContainText('경계 시간대 09–10시 318');
  // From now first (14:10 → the 14–15 band), whole day behind a toggle.
  await expect(sides.getByTestId('halls-upcoming').locator('li').first()).toContainText('14–15시');
  await expect(sides.getByTestId('halls-all').locator('li')).toHaveCount(24);
  await expect(prep.getByTestId('prep-facts')).toContainText('동편 출국장 예상 이용객이 가장 많은 시간');
});

test('the side is chosen in the conditions, stored on this device, and whole-terminal is the default', async ({ page }) => {
  const prep = await open(page, { side: null as unknown as string });
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T1');
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.getByTestId('prep-side').getByLabel('서편').check();
  await prep.getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T1 서편');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('koretail-business-v1') ?? 'null')).side).toBe('WEST');
});

test('a stored side that is not east or west is ignored, not guessed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('koretail-business-v1', '{"version":1,"place":"airport","terminal":"T1","side":"NORTH","hours":null}'));
  await page.route('**/api/live/summary*', routeSummary(fixture(false)));
  await page.goto('/ko/business');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('business-prep').getByTestId('prep-place')).toHaveText('명동');
});

test('the staff share names the date, terminal, side, expectation basis and flight basis', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const prep = await open(page, { hallsPublic: true });
  await prep.getByTestId('prep-share').getByRole('button', { name: '문구 복사' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('2026-08-31 (월) · 인천공항 T1 동편');
  expect(text).toContain('동편 출국장 예상 이용객이 가장 많은 시간');
  // The copy text carries the same partial scope as the screen (and the PNG, which renders the same lines).
  expect(text).toContain('위치가 확인된 동편 탑승구 항공편 중 가장 많은 시간 15:00–16:00 · 2편 (위치 미확인 1편 제외');
  expect(text).not.toContain('탑승구 기준 출발편이 가장 많은 시간');
  expect(text).toContain(sidesCopy.notice.ko);
  expect(text).toContain('인천공항 운항 정보 (탑승구 기준 출발편)');
});

test('the whole terminal counts every flight, unknown sides included, and keeps the flight action', async ({ page }) => {
  const prep = await open(page, { side: null as unknown as string });
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T1');
  // 15:00–16:00 has A, B, C (east, east, west) — the unverified 17:00 flight is still in the terminal's day.
  await expect(prep.getByTestId('prep-facts')).toContainText('탑승구 기준 출발편이 가장 많은 시간 15:00–16:00 · 3편 (터미널 전체)');
  await expect(prep.getByTestId('airport-sides').getByTestId('gates-areas')).toContainText('T1 본관 5편');
  const gate = prep.getByTestId('prep-actions').locator('li[data-rule="GATE_PEAK"]');
  await expect(gate).toContainText('예정 출발 시각 기준');
});

test('the added business types sit in the existing selector and drive the gate hint', async ({ page }) => {
  const prep = await open(page, { side: null as unknown as string });
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  const select = prep.locator('.prep-form select').first();
  await expect(select.locator('option')).toHaveCount(8);
  await select.selectOption('luxury');
  await expect(prep.getByTestId('prep-industry')).toHaveText(industryProfiles.luxury.label.ko);
  await expect(prep.getByTestId('prep-actions').locator('li[data-rule="GATE_PEAK"] .prep-industry-hint')).toContainText('대기 고객 응대 방식');
});

for (const lang of ['en', 'zh', 'ja'] as const) {
  test(`the airport sides read in ${lang} without missing glyphs and fit a small phone`, async ({ page }) => {
    const prep = await open(page, { lang, width: 360, hallsPublic: true });
    const sides = prep.getByTestId('airport-sides');
    await sides.locator('details').last().locator('summary').click();
    await expect(sides.getByTestId('sides-notice')).toHaveText(sidesCopy.notice[lang]);
    expect(await tofuCharacters(sides)).toEqual([]);
    expect(await tofuCharacters(prep.getByTestId('prep-facts'))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}

test('Korean at 360px has no overflow and no missing glyph', async ({ page }) => {
  const prep = await open(page, { width: 360, hallsPublic: true });
  expect(await tofuCharacters(prep.getByTestId('airport-sides'))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

// --- east/west flight comparison and the reference passenger split ----------

const T1_EXPECTED = SUMMARY_FIXTURE.airport.passengerForecastTimelineByTerminal.T1.reduce((sum: number, band: { expectedPassengers: number }) => sum + band.expectedPassengers, 0);

test('the comparison is the first thing in the airport block: flights, ratio, and a reference estimate', async ({ page }) => {
  const prep = await open(page, { side: null });
  const sides = prep.getByTestId('airport-sides');
  await expect(sides.locator(':scope > *').first()).toHaveAttribute('data-testid', 'flight-split');
  const card = sides.getByTestId('flight-split');
  await expect(card.locator('h3')).toHaveText('T1 오늘 출발편');
  // Fixture: 2 east, 1 west, 1 centre, 1 unconfirmed of 5 T1 departures (codeshares once, cancelled apart).
  await expect(card.getByTestId('split-flights')).toHaveText('동편 2편 67% · 서편 1편 33% · 중앙 1편 · 위치 미확인 1편(전체의 20%)');
  await expect(card.getByTestId('split-shares')).toHaveText('동·서 위치가 확인된 항공편 기준 (3편): 동편 67% · 서편 33% (동편이 더 많음)');
  // The people are spread over ALL 6 flights of the T1 scope (5 T1 gates + 1 concourse), 100-rounded per group.
  const hundreds = (value: number) => Math.round(value / 100) * 100;
  const fmt = (value: number) => value.toLocaleString('ko-KR');
  await expect(card.getByTestId('split-estimate')).toHaveText(
    `동편 약 ${fmt(hundreds((T1_EXPECTED * 2) / 6))}명 · 서편 약 ${fmt(hundreds(T1_EXPECTED / 6))}명 · 중앙 약 ${fmt(hundreds(T1_EXPECTED / 6))}명 · 위치 미확인 약 ${fmt(hundreds(T1_EXPECTED / 6))}명 · 탑승동 약 ${fmt(hundreds(T1_EXPECTED / 6))}명`,
  );
  await expect(card.getByTestId('split-estimate-basis')).toHaveText(`터미널 전체 예상 ${fmt(T1_EXPECTED)}명 기준 · 같은 범위 출발편 6편(T1 본관 5편 + 탑승동 1편)으로 나눈 추정`);
  await expect(card.getByTestId('split-note')).toHaveText(`${splitCopy.estimateNote.ko} ${splitCopy.concourseNote.ko}`);
  // Hours: each with east/west counts and shares.
  await expect(sides.getByTestId('gates-all').locator('li').first()).toHaveText('15–16시 · 합계 3편 · 동 2편 / 서 1편 (동 67% · 서 33%)');
  // The hall split stays withheld; the estimate is not the hall figure.
  await expect(sides.getByTestId('halls-withheld')).toBeVisible();
});

test('the terminal switch and the side choice change the right things', async ({ page }) => {
  const prep = await open(page, { side: null });
  const card = prep.getByTestId('flight-split');
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.locator('.prep-terminal').first().getByLabel('T2').check();
  await prep.getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(card.locator('h3')).toHaveText('T2 오늘 출발편');
  // T2 has one east flight and none in the west: 100 / 0, nothing assigned by force.
  await expect(card.getByTestId('split-shares')).toContainText('동편 100% · 서편 0%');
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.getByTestId('prep-side').getByLabel('서편').check();
  await prep.getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(card.locator('h3')).toHaveText('T2 오늘 출발편');
  await expect(card.getByTestId('split-flights')).toContainText('동편 1편 100% · 서편 0편 0%');
});

test('screen, copied text and image carry the same lines, and the whole-day lines sit apart from the store hours', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const prep = await open(page, { side: null });
  const card = prep.getByTestId('flight-split');
  const flights = (await card.getByTestId('split-flights').textContent()) as string;
  const shares = (await card.getByTestId('split-shares').textContent()) as string;
  const estimate = (await card.getByTestId('split-estimate').textContent()) as string;
  // The whole-day lines are the card; the "inside your hours" list holds only in-hours facts.
  await expect(prep.getByTestId('prep-facts')).not.toContainText('출발편(하루 전체)');
  await expect(prep.getByTestId('prep-facts')).not.toContainText('항공편 비율로 본 예상 출국객');
  await prep.getByTestId('prep-share').getByRole('button', { name: '문구 복사' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(flights);
  expect(text).toContain(shares);
  expect(text).toContain(estimate);
  expect(text).toContain(splitCopy.estimateNote.ko);
  expect(text).toContain(splitCopy.concourseNote.ko);
  expect(text).toContain('편당 승객 수가 같다는 가정의 참고값');
  expect(text.indexOf('■ 하루 전체 참고 (영업시간과 무관)')).toBeGreaterThan(text.indexOf('■ 영업시간 안에서 확인된 사실'));
  expect(text.indexOf('■ 하루 전체 참고 (영업시간과 무관)')).toBeLessThan(text.indexOf('■ 준비할 일'));
  expect(text).toMatch(/출처: .*인천공항 공식 출국 예상.*인천공항 운항 정보/);
  const download = page.waitForEvent('download');
  await prep.getByTestId('prep-share').getByRole('button', { name: '이미지 저장' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});

test('no estimate without a complete terminal-wide figure; no comparison from old flight records', async ({ page }) => {
  const partial = await open(page, {
    side: null,
    mutate: (summary) => ({ ...summary, airport: { ...summary.airport, forecastCoverage: { all: 'PARTIAL', byTerminal: { T1: 'PARTIAL', T2: 'PARTIAL' } } } }),
  });
  await expect(partial.getByTestId('split-flights')).toBeVisible();
  await expect(partial.getByTestId('split-no-estimate')).toHaveText(splitCopy.noEstimate.ko);
  await expect(partial.getByTestId('split-estimate')).toHaveCount(0);
});

test('old flight records show no comparison', async ({ page }) => {
  const prep = await open(page, {
    side: null,
    mutate: (summary) => {
      const sides = summary.airport.sides;
      return { ...summary, airport: { ...summary.airport, sides: { ...sides, gates: { ...sides.gates, retrievedAt: '2026-08-29T00:00:00Z' } } } };
    },
  });
  const card = prep.getByTestId('flight-split');
  await expect(card).toHaveAttribute('data-state', 'STALE');
  await expect(card).toContainText(splitCopy.unavailable.STALE.ko);
  await expect(prep.getByTestId('prep-facts')).not.toContainText('출발편(하루 전체)');
  // The gate block below does not repeat the old counts either; it only says when they were collected.
  await expect(prep.getByTestId('airport-sides').getByTestId('gates-stale')).toBeVisible();
  await expect(prep.getByTestId('airport-sides').getByTestId('gates-sides')).toHaveCount(0);
  await expect(prep.getByTestId('airport-sides').getByTestId('gates-all')).toHaveCount(0);
});

for (const [lang, width] of [['ko', 360], ['en', 360], ['zh', 360], ['ja', 360], ['ko', 1280]] as const) {
  test(`the comparison fits and has no missing glyph: ${lang} at ${width}px`, async ({ page }) => {
    const prep = await open(page, { lang, width, side: null });
    const card = prep.getByTestId('flight-split');
    await expect(card.getByTestId('split-estimate')).toBeVisible();
    expect(await tofuCharacters(card)).toEqual([]);
    expect(await tofuCharacters(prep.getByTestId('prep-facts'))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const box = await card.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width + 1).toBeTruthy();
  });
}

test('when no flight has a confirmed side the card says so, not that the terminal figure is missing', async ({ page }) => {
  const unconfirmed = [flight('U1', 'T1', '13', '15:05'), flight('U2', 'T1', '13', '15:30'), flight('U3', 'T1', '', '16:10')];
  const prep = await open(page, {
    side: null,
    mutate: (summary) => ({ ...summary, airport: { ...summary.airport, sides: airportSides(DATE, 'TODAY', HALL_ROWS, unconfirmed, [], false, false) } }),
  });
  const card = prep.getByTestId('flight-split');
  await expect(card.getByTestId('split-flights')).toContainText('동편 0편');
  await expect(card.getByTestId('split-shares')).toContainText('비율을 계산하지 않았습니다');
  await expect(card.getByTestId('split-no-estimate')).toHaveText(splitCopy.noConfirmedEstimate.ko);
  await expect(card.getByTestId('split-estimate')).toHaveCount(0);
});

test('the basis panel names both the official text and the official map as evidence', async ({ page }) => {
  const prep = await open(page, { side: null });
  const basis = prep.getByTestId('sides-basis');
  await basis.locator('summary').click();
  await expect(basis).toContainText('공식 지도');
  await expect(basis).toContainText('예상 출국객 참고 추정');
  await expect(basis.getByRole('link', { name: '공항 공식 지도' })).toHaveAttribute('href', /airport\.kr\/geomap/);
});
