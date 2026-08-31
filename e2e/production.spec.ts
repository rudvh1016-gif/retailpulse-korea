import { expect, test } from "@playwright/test";

const locales = [
  ["ko", "ko"],
  ["en", "en"],
  ["zh", "zh-CN"],
  ["ja", "ja"],
] as const;

for (const [locale, htmlLang] of locales) {
  test(`${locale} is server-rendered with the correct document language`, async ({ page }) => {
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", htmlLang);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".brand")).toContainText("KORETAIL");
    await expect(page.locator(".brand")).not.toContainText(/RetailPulse/i);
  });
}

test("project-local Korean, Japanese and Chinese fonts load", async ({ page }) => {
  await page.goto("/ja");
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 16px "Noto Sans JP Variable"', "日本語 ページ"))).toBe(true);

  await page.goto("/zh");
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 16px "Noto Sans SC Variable"', "简体中文 签到"))).toBe(true);

  await page.goto("/ko");
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('420 16px "Pretendard Variable"', "리테일펄스 특별"))).toBe(true);
});

for (const width of [320, 375, 390, 430, 768]) {
  test(`mobile ${width}px has no page-level horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/ko/airport");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator(".brand")).toContainText("KORETAIL");
    await expect(page.locator("nav.bottom-nav")).toBeVisible();
  });
}

test("primary navigation, terminal filter, back and refresh work", async ({ page }) => {
  await page.goto("/ko");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator("nav.bottom-nav a").filter({ hasText: "공항" }).click();
  await expect(page).toHaveURL(/\/ko\/airport$/);
  await page.getByRole("tab", { name: "T2" }).click();
  await page.locator(".airport-context-nav").getByRole("button", { name: "항공편" }).click();
  await expect(page.getByRole("heading", { name: /항공편·도시 검색/ })).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
});

/**
 * The product must never present a placeholder as a reading. Earlier releases
 * shipped a fabricated demand index and "예시 오늘" captions; this asserts the
 * live pages carry none of them, in every locale.
 */
test("no sample or demo placeholder text is visible in any locale", async ({ page }) => {
  const banned = /예시 수요지수|예시 오늘|예시 내일|예시 날짜|예시 추천|DEMO INDEX|DEMO DEMAND INDEX|SAMPLE DATE|SAMPLE TIME|SAMPLE TODAY|示例日期|示例今天|演示需求指数|サンプル日付|サンプル今日|デモ需要指数/;
  for (const [locale] of locales) {
    for (const path of ["", "/airport", "/business", "/forecast", "/about", "/more"]) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator("body")).not.toContainText(banned);
    }
  }
});

test("airport truth labels are complete in all four locales", async ({ page }) => {
  const intro = {
    ko: "공식 예상 출국객, 실제 출발 운항, 현재 출국장 대기를 서로 섞지 않고 따로 보여줍니다.",
    en: "Official expected departures, physical departing flights and current departure-hall waits—kept separate, never blended.",
    zh: "分别显示官方预计出境人数、实际出发航班与当前出境区等候，互不混用。",
    ja: "公式予想出国者・実出発便・現在の出国場待ちを混ぜずに分けて表示します。",
  } as const;
  for (const locale of Object.keys(intro) as Array<keyof typeof intro>) {
    await page.goto(`/${locale}/airport`);
    await expect(page.getByText(intro[locale], { exact: true })).toBeVisible();
  }
});

const AREA_BLOCK = (overrides: Record<string, unknown> = {}) => ({
  realtimeForecast: [], weather: [], events: [], eventCount: 0,
  observedSeries: [], sales: null, foreignPresence: null, realtime: null,
  ...overrides,
});

const SUMMARY_FIXTURE = {
  mode: "live-summary",
  generatedAt: "2026-08-31T05:10:00Z",
  todayKst: "2026-08-31",
  serviceDateKst: "2026-08-31",
  dayRelation: "TODAY",
  dateAvailability: {
    airportFlights: ["2026-08-29", "2026-08-30", "2026-08-31"],
    airportPassengerForecast: ["2026-08-31", "2026-09-01"],
    seoulObserved: ["2026-08-30", "2026-08-31"],
  },
  sources: [],
  areas: {
    myeongdong: AREA_BLOCK({
      realtime: { congestionLevel: 3, congestionLabel: "약간 붐빔", populationMin: 23000, populationMax: 25000, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      realtimeForecast: [{ targetAt: "2026-08-31T17:00:00+09:00", congestionLevel: 4, congestionLabel: "붐빔", populationMin: 27000, populationMax: 29000, issuedAt: "2026-08-31T14:00:00+09:00", retrievedAt: "2026-08-31T14:05:00+09:00" }],
      weather: [{ targetAt: "2026-08-31T18:00:00+09:00", precipitationProbability: 60, temperatureTenthC: 270, conditionCode: "rain" }],
    }),
    hongdae: AREA_BLOCK({
      realtime: { congestionLevel: 2, congestionLabel: "보통", populationMin: 18000, populationMax: 20000, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
      realtimeForecast: [{ targetAt: "2026-08-31T19:00:00+09:00", congestionLevel: 3, congestionLabel: "약간 붐빔", populationMin: 22000, populationMax: 24000, issuedAt: "2026-08-31T14:00:00+09:00", retrievedAt: "2026-08-31T14:05:00+09:00" }],
      weather: [{ targetAt: "2026-08-31T18:00:00+09:00", precipitationProbability: 20, temperatureTenthC: 260, conditionCode: "cloudy" }],
      events: [{ title: "홍대 거리공연", eventStart: "2026-08-31", eventEnd: null, distanceM: 300 }],
      eventCount: 1,
    }),
    seongsu: AREA_BLOCK({
      realtime: { congestionLevel: 1, congestionLabel: "여유", populationMin: 12000, populationMax: 14000, observedAt: "2026-08-31T14:05:00+09:00", freshness: "STALE" },
      weather: [{ targetAt: "2026-08-31T15:00:00+09:00", precipitationProbability: 10, temperatureTenthC: 310, conditionCode: "clear" }],
    }),
  },
  airport: {
    congestion: [
      { terminal: "T1", zone: "P01", waitTimeMinutes: 24, waitTimeRaw: "24", waitingCount: 81, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      { terminal: "T1", zone: "P02", waitTimeMinutes: 10, waitTimeRaw: "10", waitingCount: 42, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      { terminal: "T2", zone: "DG1_B", waitTimeMinutes: 61, waitTimeRaw: "60+", waitingCount: 43, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
      { terminal: "T2", zone: "DG1_A", waitTimeMinutes: 11, waitTimeRaw: "11", waitingCount: 35, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
    ],
    currentBusiestDepartureHallByTerminal: {
      T1: { terminal: "T1", zone: "P01", waitTimeMinutes: 24, waitTimeRaw: "24", waitingCount: 81, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      T2: { terminal: "T2", zone: "DG1_B", waitTimeMinutes: 61, waitTimeRaw: "60+", waitingCount: 43, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
    },
    departuresTrackedToday: 561,
    departuresTrackedTodayByTerminal: { T1: 300, T2: 261 },
    departuresTrackedTodayRetrievedAt: "2026-08-31T12:00:00+09:00",
    topDepartureGate: "27",
    topDepartureGateTerminal: "T1",
    topDepartureGateFlights: 18,
    topDepartureGateByTerminal: { T1: { gate: "27", flights: 18 }, T2: { gate: "5", flights: 12 } },
    busyDepartureGates: [
      { terminal: "T1", gate: "27", flights: 18 },
      { terminal: "T2", gate: "5", flights: 12 },
      { terminal: "T1", gate: "31", flights: 10 },
    ],
    busyDepartureGatesByTerminal: {
      T1: [{ terminal: "T1", gate: "27", flights: 18 }, { terminal: "T1", gate: "31", flights: 10 }],
      T2: [{ terminal: "T2", gate: "5", flights: 12 }],
    },
    topDepartureGateRetrievedAt: "2026-08-31T12:00:00+09:00",
    topDepartureGateRetrievedAtByTerminal: { T1: "2026-08-31T12:00:00+09:00", T2: "2026-08-31T12:05:00+09:00" },
    gateCoverageRatio: 0.76,
    gateCoverageRatioByTerminal: { T1: 0.8, T2: 0.7 },
    serviceDateKst: "2026-08-31",
    periodStartAt: "2026-08-31T00:00:00+09:00",
    periodEndAt: "2026-08-31T23:59:59+09:00",
    latestRetrievedAt: "2026-08-31T14:08:00+09:00",
    todayExpectedPassengersTotal: 47320,
    todayExpectedPassengersByTerminal: { T1: 30100, T2: 17220 },
    remainingExpectedPassengers: { expectedPassengers: 11430, fromAt: "2026-08-31T14:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 2 },
    remainingExpectedPassengersByTerminal: {
      T1: { expectedPassengers: 3500, fromAt: "2026-08-31T15:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 1 },
      T2: { expectedPassengers: 2900, fromAt: "2026-08-31T16:00:00+09:00", toAt: "2026-09-01T00:00:00+09:00", bands: 1 },
    },
    passengerForecastRetrievedAt: "2026-08-31T09:05:00+09:00",
    passengerForecastRetrievedAtByTerminal: { T1: "2026-08-31T09:00:00+09:00", T2: "2026-08-31T09:05:00+09:00" },
    peakExpectedTimeBand: { targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 6320 },
    peakExpectedTimeBandByTerminal: {
      T1: { targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 3500 },
      T2: { targetStartAt: "2026-08-31T16:00:00+09:00", targetEndAt: "2026-08-31T17:00:00+09:00", expectedPassengers: 2900 },
    },
    peakExpectedPassengers: 6320,
    peakExpectedPassengersByTerminal: { T1: 3500, T2: 2900 },
    passengerForecastTimeline: [
      { targetStartAt: "2026-08-31T14:00:00+09:00", targetEndAt: "2026-08-31T15:00:00+09:00", expectedPassengers: 5110 },
      { targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 6320 },
    ],
    passengerForecastTimelineByTerminal: {
      T1: [{ targetStartAt: "2026-08-31T15:00:00+09:00", targetEndAt: "2026-08-31T16:00:00+09:00", expectedPassengers: 3500 }],
      T2: [{ targetStartAt: "2026-08-31T16:00:00+09:00", targetEndAt: "2026-08-31T17:00:00+09:00", expectedPassengers: 2900 }],
    },
    forecastCoverage: { all: "COMPLETE", byTerminal: { T1: "COMPLETE", T2: "COMPLETE" } },
    scheduled: [],
    passengerForecast: [],
  },
};

const FLIGHT_ROWS = [
  { flightNumber: "KE703", airlineCode: "KE", airportCode: "NRT", direction: "departure", terminal: "T2", gate: "252", checkinCounter: "E", status: "출발", scheduledAt: "2026-08-31T09:20:00+09:00" },
  { flightNumber: "OZ102", airlineCode: "OZ", airportCode: "NRT", direction: "departure", terminal: "T1", gate: "31", checkinCounter: "C", status: "출발", scheduledAt: "2026-08-31T08:10:00+09:00" },
  { flightNumber: "KE704", airlineCode: "KE", airportCode: "NRT", direction: "arrival", terminal: "T2", gate: "251", checkinCounter: null, status: "도착", scheduledAt: "2026-08-31T13:30:00+09:00" },
];

const routeSummary = (payload: unknown) => async (route: { fulfill: (options: { contentType: string; body: string }) => Promise<void> }) =>
  route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });

test("airport summary keeps forecast, flights, gate and checkpoints truthful on mobile", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await expect(page.locator(".airport-current-brief")).toContainText("지금 전체 공항에서 대기가 가장 긴 곳은 T2 출국장 1B, 60+분입니다");
  await expect(page.locator(".airport-current-brief")).toContainText("15:00–16:00가 오늘 피크입니다");
  await expect(page.locator(".airport-current-brief")).toContainText("출발 561편");
  await expect(page.getByText("공식 예상 출국객", { exact: true })).toBeVisible();
  await expect(page.getByText("47,320명", { exact: true })).toBeVisible();
  await expect(page.getByText("561편", { exact: true })).toBeVisible();
  await expect(page.getByText(/실제 운항편 기준 · 승객 수 아님/)).toBeVisible();
  const topGateRow = page.locator(".airport-gate-row").first();
  await expect(topGateRow).toContainText("T1");
  await expect(topGateRow).toContainText("Gate 27");
  await expect(topGateRow).toContainText("18편");
  await expect(page.getByText(/출국장 체크포인트 관측 · 탑승 게이트 아님/)).toBeVisible();
  const t2Group = page.locator(".airport-checkpoint-terminal").filter({ hasText: "제2터미널" });
  const busiestCheckpoint = t2Group.locator("article.is-busiest");
  await expect(busiestCheckpoint).toContainText("출국장 1B");
  await expect(busiestCheckpoint).toContainText("대기시간");
  await expect(busiestCheckpoint).toContainText("60+분");
  await expect(busiestCheckpoint).toContainText("대기인원");
  await expect(busiestCheckpoint).toContainText("43명");
  // Internal zone codes stay out of the reader-facing name.
  await expect(page.locator(".airport-checkpoints")).not.toContainText("DG1_B");
  await expect(page.getByText("운항 집중 게이트", { exact: true })).toBeVisible();
  await expect(page.locator(".airport-gate-row")).toHaveCount(3);
  await expect(page.locator(".airport-period-label")).toContainText(/2026.*08.*31/);

  // This fixture collects the passenger forecast (09:05) and the flight/gate
  // data (12:00) at different times, so the freshness must stay on each card.
  // A single shared section line would hide which number came from which
  // moment, so it must be absent exactly when the times disagree.
  const metricFreshness = page.locator(".airport-today-grid .metric-freshness");
  await expect(metricFreshness.first()).toContainText(/기준/);
  await expect(page.locator(".airport-today-grid article").nth(0)).toContainText("09:05");
  await expect(page.locator(".airport-today-grid article").nth(2)).toContainText("12:00");
  await expect(page.locator(".airport-section-freshness")).toHaveCount(0);

  // A status sentence must not be rendered at the KPI number size.
  const statusStrong = page.locator('.airport-today-grid strong[data-kind="status"]').first();
  if (await statusStrong.count()) {
    const size = await statusStrong.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeLessThanOrEqual(15);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

/**
 * "From this hour to the end of today" is only shown when the day's official
 * bands are provably complete, and it must be stated as whole bands.
 */
test("remaining expected departures is shown for a complete day and withheld for a partial one", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await expect(page.getByText("지금부터 오늘 끝까지", { exact: true })).toBeVisible();
  await expect(page.getByText("11,430명", { exact: true })).toBeVisible();
  await expect(page.locator(".airport-current-brief")).toContainText("14:00부터 오늘 끝까지 예상 11,430명");
  await expect(page.getByText(/현재 시간대부터 24:00까지 공식 예상 승객 합계/)).toBeVisible();

  const partial = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
  partial.airport.forecastCoverage = { all: "PARTIAL", byTerminal: { T1: "PARTIAL", T2: "PARTIAL" } };
  partial.airport.todayExpectedPassengersTotal = null;
  partial.airport.peakExpectedTimeBand = null;
  partial.airport.passengerForecastTimeline = [];
  partial.airport.remainingExpectedPassengers = null;
  partial.airport.remainingExpectedPassengersByTerminal = { T1: null, T2: null };
  await page.route("**/api/live/summary*", routeSummary(partial));
  await page.reload();
  await expect(page.getByText("지금부터 오늘 끝까지", { exact: true })).toHaveCount(0);
  await expect(page.getByText("11,430명", { exact: true })).toHaveCount(0);
  await expect(page.getByText("전체 시간대 확인 불가").first()).toBeVisible();
});

test("home gives deterministic current briefs for all three Seoul areas", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko");
  await expect(page.getByRole("heading", { name: "서울 지금" })).toBeVisible();
  const briefs = page.locator(".home-area-briefs");
  await expect(briefs.getByRole("button", { name: /명동/ })).toContainText("약간 붐빔 · 23,000–25,000명");
  await expect(briefs.getByRole("button", { name: /명동/ })).toContainText("오늘 17:00–18:00");
  await expect(briefs.getByRole("button", { name: /명동/ })).toContainText("비 가능성 60%");
  await expect(briefs.getByRole("button", { name: /홍대/ })).toContainText("인근 행사 1건 · 홍대 거리공연");
  await expect(briefs.getByRole("button", { name: /성수/ })).toContainText("최근 관측 지연");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

/**
 * Seoul publishes a rolling 12-hour forecast, so in the evening every band it
 * publishes falls on tomorrow. The brief must say so rather than claim no
 * forecast exists — the bug this replaced reported "unavailable" while twelve
 * official bands were stored.
 */
test("a forecast peak that falls after midnight is shown and labelled tomorrow", async ({ page }) => {
  const evening = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
  evening.generatedAt = "2026-08-31T13:55:00Z"; // 22:55 KST
  evening.areas.myeongdong.realtimeForecast = [
    { targetAt: "2026-09-01T00:00:00+09:00", congestionLevel: 2, congestionLabel: "보통", populationMin: 10000, populationMax: 12000 },
    { targetAt: "2026-09-01T04:00:00+09:00", congestionLevel: 4, congestionLabel: "붐빔", populationMin: 30000, populationMax: 33000 },
  ];
  await page.route("**/api/live/summary*", routeSummary(evening));
  await page.goto("/ko");
  const myeongdong = page.locator(".home-area-briefs").getByRole("button", { name: /명동/ });
  await expect(myeongdong).toContainText("내일 04:00–05:00");
  await expect(myeongdong).not.toContainText("확인할 수 없습니다");
});

test("selecting T1 or T2 changes every top metric, not just the current departure hall", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByText("47,320명", { exact: true })).toBeVisible();
  await expect(page.getByText("561편", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "T1" }).click();
  await expect(page.locator(".airport-current-brief")).toContainText("지금 제1터미널에서 대기가 가장 긴 곳은 출국장 P01, 24분입니다");
  await expect(page.getByText("30,100명", { exact: true })).toBeVisible();
  await expect(page.getByText("300편", { exact: true })).toBeVisible();
  await expect(page.locator(".airport-gate-row").first()).toContainText("Gate 27");
  await expect(page.getByText("47,320명", { exact: true })).toHaveCount(0);
  await expect(page.getByText("561편", { exact: true })).toHaveCount(0);
  await expect(page.locator(".airport-gate-row")).toHaveCount(2);
  await expect(page.getByText("출국장 1B", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: "T2" }).click();
  await expect(page.locator(".airport-current-brief")).toContainText("지금 제2터미널에서 대기가 가장 긴 곳은 출국장 1B, 60+분입니다");
  await expect(page.getByText("17,220명", { exact: true })).toBeVisible();
  await expect(page.getByText("261편", { exact: true })).toBeVisible();
  await expect(page.getByText("30,100명", { exact: true })).toHaveCount(0);
  await expect(page.locator(".airport-gate-row")).toHaveCount(1);
  await expect(page.getByText("출국장 1B", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "전체" }).click();
  await expect(page.getByText("47,320명", { exact: true })).toBeVisible();
});

test("incomplete A5 daily coverage never renders as a full-day total or peak", async ({ page }) => {
  const partial = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
  partial.airport.todayExpectedPassengersTotal = null;
  partial.airport.todayExpectedPassengersByTerminal = { T1: null, T2: 17220 };
  partial.airport.peakExpectedTimeBand = null;
  partial.airport.peakExpectedTimeBandByTerminal.T1 = null;
  partial.airport.passengerForecastTimelineByTerminal.T1 = [];
  partial.airport.remainingExpectedPassengers = null;
  partial.airport.remainingExpectedPassengersByTerminal = { T1: null, T2: partial.airport.remainingExpectedPassengersByTerminal.T2 };
  partial.airport.forecastCoverage = { all: "PARTIAL", byTerminal: { T1: "PARTIAL", T2: "COMPLETE" } };
  await page.route("**/api/live/summary*", routeSummary(partial));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(".airport-today-grid article").filter({ hasText: "공식 예상 출국객" }).getByText("전체 시간대 확인 불가", { exact: true })).toBeVisible();
  await expect(page.getByText("공식 예상 데이터 일부 누락").first()).toBeVisible();
  await expect(page.locator(".airport-current-brief")).toContainText("피크는 판단하지 않습니다");
  await expect(page.getByText(/일부 시간대가 누락되어 하루 전체 합계와 피크는 표시하지 않습니다/)).toBeVisible();
  await expect(page.locator(".airport-timeline")).toHaveCount(0);
  await expect(page.getByText("47,320명", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: "T2" }).click();
  await expect(page.getByText("17,220명", { exact: true })).toBeVisible();
});

/** 어제 / 오늘 / 내일 / 날짜 선택 must drive the request and stay bounded. */
test("date navigation switches the service date and explains what a date cannot show", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/live/summary*", async (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date");
    requested.push(date ?? "default");
    const payload = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
    if (date) {
      payload.serviceDateKst = date;
      payload.dayRelation = date < "2026-08-31" ? "PAST" : "FUTURE";
      if (date === "2026-08-30") {
        // Yesterday has flights on record but no official passenger forecast.
        payload.airport.todayExpectedPassengersTotal = null;
        payload.airport.peakExpectedTimeBand = null;
        payload.airport.passengerForecastTimeline = [];
        payload.airport.remainingExpectedPassengers = null;
        payload.airport.forecastCoverage = { all: "UNAVAILABLE", byTerminal: {} };
      }
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
  });

  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(".date-nav")).toBeVisible();
  await expect(page.getByRole("button", { name: "오늘" })).toHaveClass(/active/);

  await page.getByRole("button", { name: "어제" }).click();
  await expect.poll(() => requested.includes("2026-08-30")).toBe(true);
  await expect(page.getByRole("button", { name: "어제" })).toHaveClass(/active/);
  await expect(page.locator(".date-scope-note")).toContainText("지난 날짜는 기록으로만 봅니다");
  await expect(page.locator(".date-scope-note")).toContainText("공식 예상 승객 없음");
  await expect(page.getByText("47,320명", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "내일" }).click();
  await expect.poll(() => requested.includes("2026-09-01")).toBe(true);

  // The free picker is bounded to the days that actually hold rows.
  const picker = page.locator('.date-nav-picker input[type="date"]');
  await expect(picker).toHaveAttribute("min", "2026-08-29");
  await expect(picker).toHaveAttribute("max", "2026-09-01");
});

test("the flight board lists official flight rows and filters by search and terminal", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.route("**/api/live/flights*", routeSummary({
    mode: "live-flights",
    generatedAt: "2026-08-31T05:10:00Z",
    serviceDateKst: "2026-08-31",
    flights: FLIGHT_ROWS,
  }));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator(".airport-context-nav").getByRole("button", { name: "항공편" }).click();
  await expect(page.locator(".flight-rows li")).toHaveCount(2);
  await expect(page.getByText("KE703")).toBeVisible();
  await expect(page.getByText("게이트 252")).toBeVisible();

  await page.getByRole("button", { name: "도착" }).click();
  await expect(page.locator(".flight-rows li")).toHaveCount(1);
  await expect(page.getByText("KE704")).toBeVisible();

  await page.getByRole("button", { name: "출발" }).click();
  await page.getByRole("searchbox").fill("OZ");
  await expect(page.locator(".flight-rows li")).toHaveCount(1);
  await expect(page.getByText("OZ102")).toBeVisible();

  await page.getByRole("searchbox").fill("");
  await page.getByRole("tab", { name: "T1" }).click();
  await expect(page.locator(".flight-rows li")).toHaveCount(1);
  await expect(page.getByText("OZ102")).toBeVisible();
});

test("insights explains every metric instead of leading with a bare index", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/forecast");
  await expect(page.locator(".metric-explainer").first()).toBeVisible();
  for (const label of ["무엇인가요", "높으면", "출처", "왜 보나요"]) {
    await expect(page.locator(".metric-explainer").first().getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "예측 성적표는 아직 없습니다" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/NOT VERIFIED|BASELINE BEATEN|기준모델 우위|TARGET_A/);
});

test("the About page answers a first-time visitor's questions", async ({ page }) => {
  await page.goto("/ko/about");
  await expect(page.getByRole("heading", { name: "KORETAIL은 무엇인가요?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "누구를 위한 서비스인가요?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "실시간·예상·과거는 어떻게 다른가요?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "무엇을 주의해야 하나요?" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/modelVersion|predictionHash|recordOrigin|dataCutoff/);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("blocked localStorage does not break the application", async ({ context, page }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  await page.goto("/ja/business");
  await expect(page.locator("h1")).toBeVisible();
});

test("large values and long CJK labels remain contained", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/ja/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("button", { name: "履歴" }).click();
  await expect(page.getByText(/3,364,748/).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goto("/zh/business");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("unknown routes return a useful 404", async ({ page }) => {
  const response = await page.goto("/ko/not-a-real-page");
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).toContainText(/찾지 못|찾을 수|not found|ページ|未找到/i);
});
