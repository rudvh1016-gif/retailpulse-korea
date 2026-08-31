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

test("primary navigation, terminal filter, flight search, back and refresh work", async ({ page }) => {
  await page.goto("/ko");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator("nav.bottom-nav a").filter({ hasText: "공항" }).click();
  await expect(page).toHaveURL(/\/ko\/airport$/);
  await page.getByRole("tab", { name: "T2" }).click();
  await page.getByRole("button", { name: "항공편" }).click();
  await page.getByLabel("항공편·도시 검색").fill("KE703");
  await expect(page.getByText("KE703").first()).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
});

test("sample demand and airport unavailable states are explicit and accessible", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko");
  await expect(page.getByText("예시 수요지수", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/확률이나 실시간 수요가 아니며/)).toBeVisible();
  await page.getByText("지수 기준 보기").click();
  await expect(page.getByText(/아래 1\/3은 낮음/)).toBeVisible();
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  expect(consoleErrors.join("\n")).not.toMatch(/hydrated|hydration/i);
  await expect(page.getByText(/최근 4주 평균/)).toHaveCount(0);
  await page.locator("nav.bottom-nav a").filter({ hasText: "공항" }).click();
  await expect(page.locator(".airport-today-grid article").filter({ hasText: "오늘 공식 예상 출국객" }).getByText("확인 불가", { exact: true })).toBeVisible();
  await expect(page.getByText(/오늘 예상 출국객·실제 출발 운항·현재 출국장 흐름을 구분/)).toBeVisible();
  await page.getByRole("button", { name: "다음 흐름" }).click();
  await expect(page.getByText("게이트 주변 예상 혼잡")).toBeVisible();
  await expect(page.getByText(/가짜 게이트 범위나 사람 수를 표시하지 않습니다/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("new demand and airport truth labels are complete in all four locales", async ({ page }) => {
  const labels = {
    ko: ["예시 수요지수", "오늘 예상 출국객·실제 출발 운항·현재 출국장 흐름을 구분해 보여줍니다."],
    en: ["DEMO INDEX", "Official expected passengers, physical departing flights and current departure-hall conditions—kept clearly separate."],
    zh: ["演示指数", "清楚区分今日预计出境人数、实际出发航班与当前出境区状况。"],
    ja: ["デモ指数", "本日の予想出国者・実出発便・現在の出国場状況を明確に分けて表示します。"],
  } as const;
  for (const locale of Object.keys(labels) as Array<keyof typeof labels>) {
    await page.goto(`/${locale}`);
    await expect(page.getByText(labels[locale][0], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/SAMPLE DATE|예시 날짜|示例日期|サンプル日付/)).toHaveCount(0);
    await page.goto(`/${locale}/airport`);
    await expect(page.getByText(labels[locale][1], { exact: true })).toBeVisible();
  }
});

const AIRPORT_TODAY_SUMMARY_FIXTURE = {
  mode: "live-summary",
  generatedAt: "2026-08-31T05:10:00Z",
  areas: {
    myeongdong: {
      realtime: { congestionLevel: 3, congestionLabel: "약간 붐빔", populationMin: 23000, populationMax: 25000, observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE" },
      realtimeForecast: [{ targetAt: "2026-08-31T17:00:00+09:00", congestionLevel: 4, congestionLabel: "붐빔", populationMin: 27000, populationMax: 29000, issuedAt: "2026-08-31T14:00:00+09:00", retrievedAt: "2026-08-31T14:05:00+09:00" }],
      weather: [{ targetAt: "2026-08-31T18:00:00+09:00", precipitationProbability: 60, temperatureTenthC: 270, conditionCode: "rain" }], events: [], sales: null, foreignPresence: null,
    },
    hongdae: {
      realtime: { congestionLevel: 2, congestionLabel: "보통", populationMin: 18000, populationMax: 20000, observedAt: "2026-08-31T14:06:00+09:00", freshness: "LIVE" },
      realtimeForecast: [{ targetAt: "2026-08-31T19:00:00+09:00", congestionLevel: 3, congestionLabel: "약간 붐빔", populationMin: 22000, populationMax: 24000, issuedAt: "2026-08-31T14:00:00+09:00", retrievedAt: "2026-08-31T14:05:00+09:00" }],
      weather: [{ targetAt: "2026-08-31T18:00:00+09:00", precipitationProbability: 20, temperatureTenthC: 260, conditionCode: "cloudy" }], events: [{ title: "행사", eventStart: "2026-08-31", eventEnd: null, distanceM: 300 }], sales: null, foreignPresence: null,
    },
    seongsu: {
      realtime: { congestionLevel: 1, congestionLabel: "여유", populationMin: 12000, populationMax: 14000, observedAt: "2026-08-31T14:05:00+09:00", freshness: "STALE" },
      realtimeForecast: [], weather: [{ targetAt: "2026-08-31T15:00:00+09:00", precipitationProbability: 10, temperatureTenthC: 310, conditionCode: "clear" }], events: [], sales: null, foreignPresence: null,
    },
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

test("airport today summary keeps forecast, flights, gate and checkpoints truthful on mobile", async ({ page }) => {
  await page.route("**/api/live/summary", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(AIRPORT_TODAY_SUMMARY_FIXTURE),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await expect(page.locator(".airport-current-brief")).toContainText("현재 전체 공항에서는 T2 출국장 1B의 대기가 60+분으로 가장 깁니다");
  await expect(page.locator(".airport-current-brief")).toContainText("15:00–16:00가 오늘 가장 붐빌 전망");
  await expect(page.locator(".airport-current-brief")).toContainText("오늘 561편 출발");
  await expect(page.getByText("오늘 공식 예상 출국객", { exact: true })).toBeVisible();
  await expect(page.getByText("47,320명", { exact: true })).toBeVisible();
  await expect(page.getByText("561편", { exact: true })).toBeVisible();
  await expect(page.getByText(/실제 운항편 기준 · 승객 수 아님/)).toBeVisible();
  await expect(page.getByText(/T1 · Gate 27 · 18편/)).toBeVisible();
  await expect(page.getByText(/출국장 체크포인트 관측 · 탑승 게이트 아님/)).toBeVisible();
  await expect(page.getByText("60+분", { exact: true })).toBeVisible();
  await expect(page.getByText("출국장 1B", { exact: true })).toBeVisible();
  await expect(page.getByText("오늘 운항 집중 게이트", { exact: true })).toBeVisible();
  await expect(page.locator(".airport-gate-row")).toHaveCount(3);
  await expect(page.locator(".airport-period")).toContainText(/2026.*08.*31/);
  // Fix 4: the overall label is scoped to "among airport datasets", and each
  // top metric also carries its own collection time.
  await expect(page.getByText(/공항 데이터 중 최근 수집/)).toBeVisible();
  await expect(page.locator(".airport-section-freshness")).toContainText(/기준/);
  await expect(page.getByText(/수집 8\.31|8\.31 .*KST/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("home gives deterministic current briefs for all three Seoul areas without a photo timestamp", async ({ page }) => {
  await page.route("**/api/live/summary", async (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(AIRPORT_TODAY_SUMMARY_FIXTURE) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko");
  await expect(page.getByRole("heading", { name: "서울 오늘 브리핑" })).toBeVisible();
  await expect(page.getByRole("button", { name: /명동/ })).toContainText("약간 붐빔 · 23,000–25,000명");
  await expect(page.getByRole("button", { name: /명동/ })).toContainText("17:00–18:00");
  await expect(page.getByRole("button", { name: /명동/ })).toContainText("비 가능성 60%");
  await expect(page.getByRole("button", { name: /홍대/ })).toContainText("오늘 인근 행사 1건 예정");
  await expect(page.getByRole("button", { name: /성수/ })).toContainText("최근 관측 지연");
  await expect(page.getByText(/20:42 KST|예시 날짜/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("Fix 1: selecting T1 or T2 changes all four top metrics, not just the current departure hall", async ({ page }) => {
  await page.route("**/api/live/summary", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(AIRPORT_TODAY_SUMMARY_FIXTURE),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await expect(page.getByText("47,320명", { exact: true })).toBeVisible();
  await expect(page.getByText("561편", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "T1" }).click();
  await expect(page.locator(".airport-current-brief")).toContainText("현재 제1터미널에서는 출국장 P01의 대기가 24분으로 가장 깁니다");
  await expect(page.getByText("30,100명", { exact: true })).toBeVisible();
  await expect(page.getByText("300편", { exact: true })).toBeVisible();
  await expect(page.getByText(/T1 · Gate 27 · 18편/)).toBeVisible();
  await expect(page.getByText("47,320명", { exact: true })).toHaveCount(0);
  await expect(page.getByText("561편", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Gate 5 · 12편/)).toHaveCount(0);
  await expect(page.locator(".airport-gate-row")).toHaveCount(2);
  await expect(page.getByText("출국장 1B", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: "T2" }).click();
  await expect(page.locator(".airport-current-brief")).toContainText("현재 제2터미널에서는 출국장 1B의 대기가 60+분으로 가장 깁니다");
  await expect(page.getByText("17,220명", { exact: true })).toBeVisible();
  await expect(page.getByText("261편", { exact: true })).toBeVisible();
  await expect(page.getByText(/T2 · Gate 5 · 12편/)).toBeVisible();
  await expect(page.getByText("30,100명", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Gate 27 · 18편/)).toHaveCount(0);
  await expect(page.locator(".airport-gate-row")).toHaveCount(1);
  await expect(page.getByText("출국장 1B", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "전체" }).click();
  await expect(page.getByText("47,320명", { exact: true })).toBeVisible();
});

test("Fix 2: incomplete A5 daily coverage never renders as a full-day total or peak", async ({ page }) => {
  const partial = JSON.parse(JSON.stringify(AIRPORT_TODAY_SUMMARY_FIXTURE));
  partial.airport.todayExpectedPassengersTotal = null;
  partial.airport.todayExpectedPassengersByTerminal = { T1: null, T2: 17220 };
  partial.airport.peakExpectedTimeBand = null;
  partial.airport.peakExpectedTimeBandByTerminal.T1 = null;
  partial.airport.passengerForecastTimelineByTerminal.T1 = [];
  partial.airport.forecastCoverage = { all: "PARTIAL", byTerminal: { T1: "PARTIAL", T2: "COMPLETE" } };
  await page.route("**/api/live/summary", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(partial),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await expect(page.locator(".airport-today-grid article").filter({ hasText: "오늘 공식 예상 출국객" }).getByText("오늘 전체 시간대 확인 불가", { exact: true })).toBeVisible();
  await expect(page.getByText("공식 예상 데이터 일부 누락").first()).toBeVisible();
  await expect(page.locator(".airport-current-brief")).toContainText("오늘 피크는 판단하지 않습니다");
  await expect(page.getByText(/일부 시간대가 누락되어 하루 전체 합계와 피크는 표시하지 않습니다/)).toBeVisible();
  await expect(page.locator(".airport-timeline")).toHaveCount(0);
  await expect(page.getByText("47,320명", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: "T1" }).click();
  await expect(page.locator(".airport-today-grid article").filter({ hasText: "오늘 공식 예상 출국객" }).getByText("오늘 전체 시간대 확인 불가", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "T2" }).click();
  await expect(page.getByText("17,220명", { exact: true })).toBeVisible();
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

test("health endpoints degrade without exposing internal errors", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body.app).toBe("ok");
  expect(JSON.stringify(body)).not.toMatch(/stack|serviceKey|token/i);
});

test("official S2 signal fits a 390px landing page without implying a trend", async ({ page }) => {
  await page.route("**/api/live/summary", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      mode: "live-summary",
      generatedAt: "2026-08-30T00:00:00Z",
      areas: {
        myeongdong: {
          realtime: null,
          weather: [],
          events: [],
          sales: null,
          foreignPresence: {
            value: 15200.5,
            unit: "people",
            referenceAt: "2026-08-28T14:00:00+09:00",
            retrievedAt: "2026-08-30T00:00:00Z",
            productVersion: "OA-23018:Spop250mFornTempDong",
            freshness: "OFFICIAL_HISTORICAL",
            qualityStatus: "VALID",
          },
        },
      },
      airport: { congestion: [], departuresTrackedToday: null },
    }),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko");
  await expect(page.getByText("단기외국인 생활인구", { exact: true })).toBeVisible();
  const koreanRow = page.locator(".live-signal-rows p").filter({ hasText: "단기외국인 생활인구" });
  await expect(koreanRow).toContainText("15,200.5 명");
  await expect(koreanRow).toContainText(/지연 공개.*실시간 아님/);
  await expect(koreanRow).not.toContainText(/↑|↓|DEMO|데모|%/);
  expect(await koreanRow.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  for (const [locale, label, delayed, notRealtime, demo] of [
    ["en", "Short-stay foreign living population", "delayed publication", "not real-time", "Demo"],
    ["zh", "短期停留外国人生活人口", "延迟发布", "非实时", "演示"],
    ["ja", "短期滞在外国人生活人口", "遅延公開", "リアルタイムではありません", "デモ"],
  ] as const) {
    await page.goto(`/${locale}`);
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    const row = page.locator(".live-signal-rows p").filter({ hasText: label });
    await expect(row).toContainText("15,200.5");
    await expect(row).toContainText(delayed);
    await expect(row).toContainText(notRealtime);
    await expect(row).not.toContainText(new RegExp(`↑|↓|${demo}|%`, "i"));
    expect(await row.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("missing S2 data is omitted instead of showing a zero or Demo value", async ({ page }) => {
  await page.route("**/api/live/summary", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      mode: "live-summary",
      generatedAt: "2026-08-30T00:00:00Z",
      areas: { myeongdong: { realtime: null, weather: [], events: [], sales: null, foreignPresence: null } },
      airport: { congestion: [], departuresTrackedToday: null },
    }),
  }));
  await page.goto("/ko");
  await expect(page.getByText("단기외국인 생활인구", { exact: true })).toHaveCount(0);
  await expect(page.locator(".live-signals")).toHaveCount(0);
});
