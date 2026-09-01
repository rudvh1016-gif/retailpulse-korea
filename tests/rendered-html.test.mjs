import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function renderHome() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/ko", { headers: { accept: "text/html", "x-rpk-document-language": "ko" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

/**
 * One unavailable upstream must never take the public API down with it.
 *
 * The collectors write to D1 and the API reads from D1, so a provider outage
 * can only ever mean "some rows are older", never an HTTP 500. This exercises
 * the worst case the request path can reach — no database binding at all —
 * and requires a 200 with honest nulls rather than fabricated zeros.
 */
test("public endpoints stay available and never fabricate zeros when a source is down", async () => {
  const call = async (path) => {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
    const { default: worker } = await import(workerUrl.href);
    return worker.fetch(
      new Request(`http://localhost${path}`, { headers: { accept: "application/json" } }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
  };

  // This harness runs the Worker with no D1 binding at all, which is the
  // "database unreachable" case rather than the "a source is degraded" one.
  // Health must say so over HTTP: answering 200 here is exactly what let the
  // 2026-09-01 quota outage look healthy while the site served no data.
  const healthResponse = await call("/api/health");
  assert.equal(healthResponse.status, 503, "an unreachable database must not be reported as healthy");
  assert.notEqual(healthResponse.status, 500, "it is unavailable, not a crash");
  const healthBody = await healthResponse.json();
  assert.equal(healthBody.app, "ok");
  assert.equal(healthBody.database, "unavailable");
  assert.ok(Array.isArray(healthBody.sources));

  const summaryResponse = await call("/api/live/summary");
  assert.equal(summaryResponse.status, 200, "a degraded source must never turn the live summary into a 500");
  const summary = await summaryResponse.json();
  // Honest absence, never a zero that would read as a real measurement.
  assert.equal(summary.airport.todayExpectedPassengersTotal, null);
  assert.equal(summary.airport.departuresTrackedToday, null);
  assert.equal(summary.airport.remainingExpectedPassengers, null);
  assert.equal(summary.airport.forecastCoverage.all, "UNAVAILABLE");

  // STALE is a real source status, so the health contract must allow it.
  const contracts = await read("../lib/contracts.ts");
  assert.match(contracts, /"LIVE", "STALE"/);
  const collector = await read("../lib/collector.ts");
  assert.match(collector, /export type SourceHealthStatus = "LIVE" \| "STALE" \| "MISSING" \| "ERROR" \| "OFFICIAL_HISTORICAL";/);
  assert.match(collector, /consecutive_failures = CASE WHEN excluded\.status IN \('ERROR', 'STALE'\)/);
});

test("renders the KORETAIL production shell", async () => {
  const response = await renderHome();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /<title>서울 외국인 쇼핑수요 신호 \| KORETAIL<\/title>/i);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.match(html, /지금 서울은/);
  assert.match(html, /KORETAIL/);
});

/**
 * The product must not ship placeholder values dressed as data.
 *
 * Earlier releases shipped a fabricated 0–100 demand index, sample "recommended
 * times", a hardcoded flight list and captions such as "예시 오늘". Each looked
 * exactly like a real reading. This test fails if any of them return.
 */
test("no placeholder or sample values are presented as data anywhere in the product", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const live = await read("../app/live-signals.tsx");
  const data = await read("../app/retailpulse-data.ts");
  const surface = `${page}\n${live}\n${data}`;

  for (const banned of [
    "예시 오늘", "예시 내일", "예시 날짜", "예시 추천", "예시 수요지수", "예시 입력", "예시 데이터",
    "SAMPLE TODAY", "SAMPLE TOMORROW", "SAMPLE DATE", "SAMPLE TIME", "SAMPLE INPUT", "SAMPLE RECOMMENDED TIME",
    "DEMO INDEX", "DEMO DEMAND INDEX", "DEMO FORECAST", "DEMO OBSERVED", "DEMO PREVIEW", "DEMO · NOT LIVE",
    "示例今天", "示例明天", "示例日期", "示例推荐", "演示需求指数", "演示指数",
    "サンプル今日", "サンプル明日", "サンプル日付", "サンプル時間", "デモ需要指数", "デモ指数",
    "demoFlights", "demoDemandCohort", "demoNowAvailable",
  ]) {
    assert.doesNotMatch(surface, new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `"${banned}" must not ship`);
  }

  // The fabricated cohorts themselves are gone from the data module, not merely
  // hidden behind a flag that a later edit could flip back on.
  assert.doesNotMatch(data, /export const demoFlights/);
  assert.doesNotMatch(page, /\{false && </, "dead false-gated UI must be deleted, not left in place");
  assert.doesNotMatch(surface, /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i);
});

test("uses KORETAIL across the public brand surfaces", async () => {
  const publicBrand = [
    await read("../app/retailpulse-app.tsx"),
    await read("../app/layout.tsx"),
    await read("../app/seo-config.ts"),
    await read("../public/manifest.webmanifest"),
  ].join("\n");

  for (const required of ["KORETAIL", "Retail Demand Signals for Korea"]) {
    assert.match(publicBrand, new RegExp(required));
  }
  for (const formerPublicBrand of [
    "RETAILPULSE KOREA", "RetailPulse Pro", "MY RETAILPULSE",
    "RetailPulse에서 할 수 있는 것", "WHAT YOU CAN DO WITH RETAILPULSE",
    "RetailPulse可以做什么", "RetailPulseでできること", "RetailPulse Seoul",
  ]) assert.doesNotMatch(publicBrand, new RegExp(formerPublicBrand, "i"));
});

test("keeps both user-provided Seoul visuals and their accessible descriptions", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  assert.match(page, /\/assets\/seoul-hangang\.jpeg/);
  assert.match(page, /\/assets\/seoul-hanok\.jpeg/);
  assert.match(page, /석양 아래 한강과 남산서울타워가 보이는 서울 전경/);
  assert.match(page, /한옥 지붕 너머로 남산서울타워가 보이는 서울 풍경/);
});

test("keeps the four-language fonts as bounded static assets", async () => {
  const css = await read("../app/globals.css");
  for (const file of [
    "pretendard-variable.woff2",
    "noto-sans-jp-400.woff2",
    "noto-sans-jp-600.woff2",
    "noto-sans-sc-400.woff2",
    "noto-sans-sc-600.woff2",
  ]) {
    assert.match(css, new RegExp(`/fonts/${file.replaceAll(".", "\\.")}`));
    const asset = await stat(new URL(`../public/fonts/${file}`, import.meta.url));
    assert.ok(asset.size > 20_000, `${file} should contain real glyph data`);
    assert.ok(asset.size < 200_000, `${file} should stay outside the Worker and below 200 KB`);
  }
});

test("ships every product surface in four languages without a runtime LLM dependency", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const data = await read("../app/retailpulse-data.ts");
  // Business-type copy lives beside the other domain data rather than in the
  // client component, so the four-language surface spans all three files.
  const guidance = await read("../lib/industry-guidance.ts");
  const product = `${page}\n${data}\n${guidance}`;
  for (const required of [
    "InsightsView", "AirportView", "BusinessView", "BusinessHistoryView",
    "AboutView", "MoreView", "ProModal", "MetricExplainer",
    "AirportTodaySummary", "HomeTodayBrief", "FlightBoard", "DateNavigator",
    "简体中文", "日本語",
  ]) assert.match(page, new RegExp(required));
  for (const feature of [
    "공식 예상 출국객", "OFFICIAL HISTORICAL", "T1", "T2",
    "뷰티·화장품", "패션·잡화", "식음료·카페",
    "INCHEON DEPARTURE HALL CONGESTION", "INCHEON ARRIVAL HALL STATUS",
    "INCHEON DUTY-FREE FACILITIES", "NAVER DATALAB",
  ]) assert.match(product, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("keeps official airport totals exact and does not invent terminal shares", async () => {
  const data = await read("../app/retailpulse-data.ts");
  assert.match(data, /month: "2026-07"/);
  assert.match(data, /all: \{ arrival: 3199990, departure: 3364748 \}/);
  assert.match(data, /T1: \{ arrival: 1554721, departure: 1639145 \}/);
  assert.match(data, /T2: \{ arrival: 1645269, departure: 1725603 \}/);
  assert.match(data, /no proportional allocation is used/i);
});

test("keeps gate and duty-free intelligence within official data boundaries", async () => {
  const live = await read("../app/live-signals.tsx");
  const data = await read("../app/retailpulse-data.ts");
  const pressure = await read("../lib/airport-pressure.ts");
  assert.match(pressure, /flight\.status === "cancelled"/);
  assert.match(pressure, /physicalFlightId/);
  assert.match(pressure, /gateFreshnessMinutes/);
  assert.match(pressure, /options\.gateZones \?\? \[\]/);
  // A gate ranking counts flights; it must never be presented as passenger crowding.
  assert.match(live, /출국장 대기시간과는 다른 정보입니다/);
  assert.match(live, /출국장 체크포인트 관측 · 탑승 게이트 아님/);
  assert.match(data, /T1 checkpoints 1–6 · T2 planned/);
  assert.match(data, /not store footfall/i);
});

test("ships the V5 operational, SEO, roadmap, and QA documents", async () => {
  for (const file of [
    "production-handoff.md", "data-source-matrix.md", "historical-backfill-plan.md",
    "qa-report.md", "qa-report-v5.md", "live-readiness.md", "seo-handoff.md",
    "product-roadmap.md", "gate-retail-data-audit.md", "feature-map-v5-5.md",
    "qa-report-v5-5.md", "qa-report-v5-6.md", "qa-report-v5-7.md", "api-key-audit.md",
    "growth-validation-plan.md", "qa-report-v5-8.md", "competitor-audit.md",
    "forecast-target-registry.md", "forecast-contract.md", "outcome-contract.md",
    "no-leakage-policy.md", "zero-cost-policy.md", "forecast-validation-plan.md",
    "30-60-90-plan.md",
  ]) {
    const body = await read(`../docs/archive/work-v6.1/${file}`);
    assert.ok(body.length > 500, `${file} should contain a substantive handoff`);
  }
});

test("ships localized indexable routes and technical SEO files", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const seo = await read("../app/seo-config.ts");
  const localePage = await read("../app/[locale]/page.tsx");
  const localizedRoute = await read("../app/[locale]/[slug]/page.tsx");
  const robots = await read("../app/robots.ts");
  const sitemap = await read("../app/sitemap.ts");
  for (const locale of ["ko", "en", "zh", "ja"]) assert.match(seo, new RegExp(`\\b${locale}\\b`));
  for (const slug of ["myeongdong", "hongdae", "seongsu", "airport", "business", "history", "more"]) {
    assert.match(seo, new RegExp(slug));
  }
  assert.match(localePage, /generateMetadata/);
  assert.match(localizedRoute, /generateStaticParams/);
  assert.match(robots, /sitemap:/);
  assert.match(sitemap, /seoLocales\.flatMap/);
  assert.match(sitemap, /seoSlugs\.map/);
  assert.match(page, /document\.title = title/);
  assert.match(page, /link\[rel="canonical"\]/);
  assert.match(page, /hreflang="x-default"/);
});

test("labels the S2 signal as delayed official data in all four languages", async () => {
  const signals = await read("../app/live-signals.tsx");
  const route = await read("../app/api/live/summary/route.ts");
  for (const phrase of [
    "단기외국인 생활인구", "Short-stay foreign living population",
    "短期停留外国人生活人口", "短期滞在外国人生活人口",
    "지연 공개", "delayed publication", "延迟发布", "遅延公開",
    "실시간 아님", "not real-time", "非实时", "リアルタイムではありません",
  ]) assert.match(signals, new RegExp(phrase));
  assert.match(signals, /OFFICIAL DATA SIGNALS · KST/);
  assert.doesNotMatch(signals, /OFFICIAL LIVE SIGNALS/);
  assert.match(route, /FROM seoul_foreign_presence_area/);
  assert.match(route, /product_version AS productVersion/);
  assert.match(route, /record_origin AS freshness/);
  assert.match(route, /quality_status AS qualityStatus/);
  assert.ok((route.match(/source_id = \?/g) ?? []).length >= 2);
  assert.ok((route.match(/product_version = \?/g) ?? []).length >= 2);
  assert.ok((route.match(/mapping_version = \?/g) ?? []).length >= 2);
  assert.match(route, /record_origin = 'OFFICIAL_HISTORICAL'/);
  assert.match(route, /quality_status = 'VALID'/);
  assert.match(signals, /if \(block\?\.foreignPresence\)/);
  const foreignBlock = signals.match(/if \(block\?\.foreignPresence\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.ok(foreignBlock.length > 0);
  assert.doesNotMatch(foreignBlock, /trend|delta|arrow|DEMO|↑|↓|%/i);
  assert.match(signals, /maximumFractionDigits: 1/);
});

test("shows T1/T2 airport congestion as separate rows instead of one unlabeled combined total", async () => {
  const signals = await read("../app/live-signals.tsx");
  // The old bug: summing every congestion row (any terminal) into one opaque
  // "airport" total before T2 data could ever exist.
  assert.doesNotMatch(signals, /congestion\.reduce\(\(sum, row\) => sum \+ row\.waitingCount/);
  assert.doesNotMatch(signals, /key:\s*"airport",/);
  assert.match(signals, /congestionByTerminal/);
  assert.match(signals, /for \(const terminal of terminalOrder\)/);
  assert.match(signals, /key: `airport_\$\{terminal\}`/);
  for (const phrase of [
    "현재 출국장 대기", "departure-hall wait now", "出境区现时等候", "出国場の現在の待ち",
  ]) assert.match(signals, new RegExp(phrase));
});

test("A5 passenger forecast is worded as an official forecast, never as current/actual queue data", async () => {
  const signals = await read("../app/live-signals.tsx");
  const route = await read("../app/api/live/summary/route.ts");
  assert.match(route, /passengerForecastRows/);
  assert.match(route, /passengerForecast: upcomingForecast/);
  assert.match(route, /is_aggregate = 1/);
  assert.match(route, /direction = 'departure'/);
  assert.match(signals, /key: `forecast_\$\{forecast\.terminal\}`/);
  assert.match(signals, /text\.passengerForecastLabel\[lang\]\(forecast\.terminal\)/);
  for (const phrase of [
    "다음 시간대 예상 출국 승객", "next-hour expected departures",
    "下一时段预计出境人数", "次の時間帯の予想出国者数",
    "인천공항 공식 예고", "실제 대기인원 아님",
  ]) assert.match(signals, new RegExp(phrase));
  const forecastBlock = signals.match(/for \(const forecast of passengerForecast\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.ok(forecastBlock.length > 0);
  assert.doesNotMatch(forecastBlock, /실시간 승객|현재 대기인원|확정 승객/);
});

test("airport detail UI uses editorial rows, friendly checkpoints and honest partial-state copy", async () => {
  const signals = await read("../app/live-signals.tsx");
  const css = await read("../app/globals.css");
  assert.match(signals, /busyDepartureGatesByTerminal/);
  assert.match(signals, /friendlyCheckpointName\(row\.zone, lang\)/);
  assert.match(signals, /rankCurrentDepartureHallCheckpoints/);
  assert.match(signals, /일부 시간대가 누락되어 하루 전체 합계와 피크는 표시하지 않습니다/);
  assert.match(signals, /className="airport-gate-row"/);
  assert.match(css, /\.airport-gates li/);
});

/**
 * The busiest-gate list must rank several gates, not crown a single winner:
 * one gate out of hundreds of departures says almost nothing on its own.
 */
test("the busiest-gate list is a ranking with terminal, gate and flight count", async () => {
  const signals = await read("../app/live-signals.tsx");
  const summary = await read("../lib/airport-today-summary.ts");
  assert.match(summary, /busyDepartureGates: coverage >= minimumCoverage \? ranked\.slice\(0, 5\) : \[\]/);
  assert.match(signals, /gateList\.map\(\(row, index\)/);
  assert.match(signals, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
  assert.match(signals, /Gate \{row\.gate\}/);
  assert.match(signals, /gateRankHead/);
  // Coverage gating stays: a ranking built on partial gate data is withheld.
  assert.match(signals, /noGateList/);
});

test("current briefs use existing official forecasts and deterministic editorial copy without runtime AI", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const signals = await read("../app/live-signals.tsx");
  const route = await read("../app/api/live/summary/route.ts");
  const brief = await read("../lib/current-brief.ts");
  assert.match(signals, /buildAreaCurrentBrief/);
  assert.match(signals, /buildAirportCurrentBrief/);
  assert.match(signals, /home-area-brief-rows/);
  assert.match(route, /seoul_realtime_forecast/);
  assert.match(route, /realtimeForecast:/);
  assert.match(brief, /umbrellaProbability: 50/);
  assert.match(brief, /checkRainProbability: 30/);
  assert.doesNotMatch(brief, /OpenAI|Anthropic|Gemini|Cloudflare AI/);
  assert.doesNotMatch(page, /20:42 KST|예시 날짜|SAMPLE DATE|示例日期|サンプル日付/);
});

test("each Seoul area view opens with its own current brief built from the same deterministic builder", async () => {
  const signals = await read("../app/live-signals.tsx");
  const css = await read("../app/globals.css");
  assert.match(signals, /className="current-brief area-current-brief"/);
  assert.match(signals, /const areaBrief = buildAreaCurrentBrief\(/);
  assert.match(signals, /const areaBriefCopy = localizeAreaBrief\(areaBrief, lang\)/);
  assert.ok(
    signals.indexOf('className="current-brief area-current-brief"')
      < signals.indexOf('id="live-signals-title"'),
    "area brief must render above the live-signals heading",
  );
  assert.match(signals, /areaBrief\.evidenceTypes\.length > 0 &&/);
  assert.match(css, /\.area-current-brief \{/);
});

/**
 * Seoul publishes a rolling 12-hour forecast, so late in the day every band it
 * publishes lands on tomorrow. The brief must state the day rather than clip
 * the horizon to "today" and report a live forecast as missing.
 */
test("the Seoul brief states which day a forecast peak falls on", async () => {
  const brief = await read("../lib/current-brief.ts");
  const signals = await read("../app/live-signals.tsx");
  assert.match(brief, /dayOffset/);
  assert.match(brief, /export type ForecastDayOffset/);
  assert.doesNotMatch(brief, /kstDay\(row\.targetAt\) === todayKst/, "the horizon must not be clipped to today");
  assert.match(signals, /const dayWord: Record<ForecastDayOffset/);
  for (const phrase of ["오늘", "내일", "tomorrow", "明天", "明日"]) {
    assert.match(signals, new RegExp(phrase));
  }
});

test("the header date comes from the data on screen and long status text never uses the number size", async () => {
  const signals = await read("../app/live-signals.tsx");
  const css = await read("../app/globals.css");
  // The chip renders the service day the server reported, and stays silent
  // without data, so the page can never claim a date it did not receive.
  assert.match(signals, /export function KstTodayChip/);
  assert.match(signals, /if \(!summary\?\.serviceDateKst\) return null;/);
  assert.match(signals, /timeZone: "Asia\/Seoul", month: "long", day: "numeric", weekday: "short"/);

  // A status sentence is not a number. Rendering it at the KPI number size
  // pushed "오늘 전체 시간대 확인 불가" onto a second line and into the next block.
  assert.match(signals, /data-kind=\{expectedTotal === null \? "status" : "value"\}/);
  assert.match(signals, /data-kind=\{peak \? "value" : "status"\}/);
  assert.match(css, /\.airport-today-grid strong\[data-kind="status"\]/);
  const statusRule = css.match(/\.airport-today-grid strong\[data-kind="status"\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(statusRule, /word-break: keep-all/);
  assert.match(statusRule, /line-height: 1\.4/);

  assert.match(signals, /const sharesOneFreshness = distinctFreshness\.length <= 1;/);
  assert.match(signals, /className="metric-freshness"/);
  assert.match(css, /\.airport-today-grid small\.metric-freshness \{[^}]*font-size: 8px/);
});

/**
 * A retrieval moment and a summed window are different questions.
 *
 * Production showed "지금부터 오늘 끝까지 12,933명" stamped "08:42 기준" while
 * the sentence above it said the sum began at 14:00. Both times were true —
 * 08:42 was when the official forecast was fetched, 14:00 was where the sum
 * started — but one word was carrying both meanings, so the card read as a
 * contradiction. Each stamp now names its own kind, and a window is a range.
 */
test("a collection time and a summed window are never worded as the same thing", async () => {
  const signals = await read("../app/live-signals.tsx");
  const brief = await read("../lib/current-brief.ts");

  assert.match(brief, /export type FreshnessKind = "basis" \| "collected" \| "observed" \| "plain";/);
  // Retrievals say retrieval; provider observations say observation.
  assert.match(signals, /formatHumanFreshness\(value, nowIso, lang, "collected"\)/);
  assert.match(signals, /formatHumanFreshness\(row\.observedAt, nowIso, lang, "observed"\)/);

  // The remaining card states the band it actually summed.
  assert.match(signals, /function formatRemainingWindow/);
  assert.match(signals, /airportTodayText\.remainingNote\[lang\]\(formatRemainingWindow\(remaining\)\)/);
  // Midnight ends today; rendering it as 00:00 reads like a day starting.
  assert.match(signals, /end === "00:00" \? "24:00" : end/);
  assert.doesNotMatch(signals, /현재 시간대부터 24:00까지/,
    "the window must be the real band, not a phrase the reader has to resolve");
});

/**
 * The official forecast chart explains the four numbers immediately above it,
 * so it belongs directly under "한눈에 보기" rather than below the live
 * checkpoint and gate sections, which answer a different question.
 */
test("the official passenger-flow section is rendered directly under the at-a-glance grid", async () => {
  const signals = await read("../app/live-signals.tsx");
  const grid = signals.indexOf('className="airport-today-grid"');
  const forecast = signals.indexOf('className="airport-detail-section airport-forecast"');
  const checkpoints = signals.indexOf('className="airport-detail-section airport-checkpoints"');
  const gates = signals.indexOf('className="airport-detail-section airport-gates"');
  assert.ok(grid > 0 && forecast > 0 && checkpoints > 0 && gates > 0);
  assert.ok(grid < forecast, "the forecast chart must follow the at-a-glance grid");
  assert.ok(forecast < checkpoints, "the forecast chart must precede current checkpoints");
  assert.ok(checkpoints < gates, "checkpoints keep their place ahead of the gate ranking");
});

test("timestamps state what they mean and a forecast band never borrows observation wording", async () => {
  const signals = await read("../app/live-signals.tsx");
  // Foreign presence carries an OBSERVATION time published with delay, so it
  // goes through the human freshness formatter (today / yesterday / older).
  assert.match(signals, /formatHumanFreshness\(block\.foreignPresence\.referenceAt/);
  // The passenger forecast row describes a TARGET band, not a retrieval moment.
  assert.match(signals, /formatKstBand\(forecast\.targetStartAt, forecast\.targetEndAt\)/);
  const forecastBlock = signals.match(/for \(const forecast of passengerForecast\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.doesNotMatch(forecastBlock, /formatHumanFreshness/, "a target band is not an 'as of' moment");
});

test("applies a user-defined month range to airport and business history", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const css = await read("../app/globals.css");
  assert.match(page, /function MonthRangePicker/);
  assert.match(page, /name="startMonth"/);
  assert.match(page, /name="endMonth"/);
  assert.match(page, /onApply=\{\(nextStart, nextEnd\) =>/);
  assert.match(page, /if \(!invalid\) onApply\(start, end\)/);
  assert.match(page, /setHistoryPeriod\("custom"\)/);
  assert.match(page, /setPeriod\("custom"\)/);
  assert.match(page, /const invalid = end < start/);
  assert.match(page, /rangeStartRow\.month !== rangeEndRow\.month/);
  assert.match(page, /startRow\.month !== endRow\.month/);
  assert.match(page, /선택 기간 월평균/);
  assert.match(css, /\.month-range/);
  assert.match(css, /overflow-x: auto/);
});

test("keeps developer readiness history out of the public product", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const live = await read("../app/live-signals.tsx");
  const matrix = await read("../docs/archive/work-v6.1/data-source-matrix.md");
  assert.doesNotMatch(page, /LIVE RUNTIME DATA API/);
  assert.doesNotMatch(page, /현재 직접 호출 0개/);
  assert.match(page, /fetch\("\/api\/beta-signups"/);
  assert.match(live, /fetch\(url, \{ headers: \{ accept: "application\/json" \} \}\)/);
  assert.doesNotMatch(page, /fetch\(\s*["']https?:/i);
  assert.match(matrix, /방문 시 직접 호출하는 외부 관광·공항·서울 데이터 API \| \*\*0개\*\*/);
});

/**
 * Accuracy has to be earned prospectively. The screen must not show a scoreboard,
 * and it must not present institutional forecasts as KORETAIL's own track record.
 */
test("publishes no forecast accuracy and explains the absence in plain language", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const plan = await read("../docs/archive/work-v6.1/growth-validation-plan.md");
  assert.match(page, /예측 성적표는 아직 없습니다/);
  assert.match(page, /결과가 나오기 전에 저장해 둔 예측만으로 성적을 계산합니다/);
  assert.match(plan, /OFFICIAL_HISTORICAL.*BACKFILLED.*FORECAST_CAPTURED/s);
  // No scoreboard, and none of the jargon a general reader cannot parse.
  for (const banned of [
    "FORECAST SCOREBOARD", "MAE · LAST 30", "BASELINE BEATEN", "기준모델 우위",
    "FORWARD PREDICTIONS", "FAST VERIFIED", "DEEP VERIFIED", "NOT VERIFIED",
    "TARGET_A", "TARGET_B", "TARGET_C", "TARGET_D",
  ]) assert.doesNotMatch(page, new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `"${banned}" must not ship`);
});

/** Every insights metric must say what it is, what high means, its source, and why to look. */
test("each insights metric ships a plain-language explanation", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  assert.match(page, /function MetricExplainer/);
  for (const label of ["무엇인가요", "높으면", "출처", "왜 보나요"]) {
    assert.match(page, new RegExp(label));
  }
  for (const label of ["What it is", "When it is high", "Source", "Why look at it"]) {
    assert.match(page, new RegExp(label));
  }
  // Used by more than one metric, not a one-off decoration.
  assert.ok((page.match(/<MetricExplainer/g) ?? []).length >= 3, "explanations must cover the insight metrics");
});

/** Date navigation must be driven by the server's KST day and bounded to stored days. */
test("date navigation offers yesterday, today, tomorrow and a bounded picker", async () => {
  const signals = await read("../app/live-signals.tsx");
  const route = await read("../app/api/live/summary/route.ts");
  assert.match(signals, /export function DateNavigator/);
  for (const phrase of ["어제", "오늘", "내일", "날짜 선택", "Yesterday", "Tomorrow", "Pick a date"]) {
    assert.match(signals, new RegExp(phrase));
  }
  assert.match(signals, /type="date"/);
  assert.match(signals, /min=\{min\}/);
  assert.match(signals, /max=\{max\}/);
  // Shortcuts come from the server's today, never the device clock.
  assert.match(signals, /const today = summary\.todayKst/);
  assert.doesNotMatch(signals, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  // The API scopes day-bound blocks to the requested service date.
  assert.match(route, /searchParams\.get\("date"\)/);
  assert.match(route, /isValidKstDay\(requestedDateRaw\) \? requestedDateRaw : kstToday/);
  assert.match(route, /dateAvailability/);
  assert.match(signals, /export function DateScopeNote/);
});

/** The flight board must be the official record, not a fixture. */
test("the flight board renders stored official flight rows from its own endpoint", async () => {
  const signals = await read("../app/live-signals.tsx");
  const flightsRoute = await read("../app/api/live/flights/route.ts");
  const summaryRoute = await read("../app/api/live/summary/route.ts");
  assert.match(signals, /export function FlightBoard/);
  assert.match(signals, /fetch\(url, \{ headers: \{ accept: "application\/json" \} \}\)/);
  assert.match(signals, /\/api\/live\/flights/);
  assert.match(flightsRoute, /FROM airport_flights/);
  assert.match(flightsRoute, /flight_number AS flightNumber/);
  assert.match(flightsRoute, /checkin_counter AS checkinCounter/);
  // The board reads far more rows than anything else, so it must never be
  // folded back into the summary every visitor loads.
  assert.doesNotMatch(summaryRoute, /flight_number AS flightNumber/);
  // No hardcoded flight identity anywhere in the client.
  assert.doesNotMatch(signals, /KE901|OZ102|LJ201|7C1101/);
});

test("persists consented beta interest in D1 without a public list endpoint", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const route = await read("../app/api/beta-signups/route.ts");
  const schema = await read("../db/schema.ts");
  const hosting = JSON.parse(await read("../.openai/hosting.json"));
  const migration = await read("../drizzle/0000_daffy_tempest.sql");
  assert.match(page, /function BetaSignup/);
  assert.match(page, /signup-consent/);
  assert.match(page, /signup-honeypot/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(route, /onConflictDoUpdate/);
  assert.match(schema, /beta_signups/);
  assert.match(migration, /CREATE TABLE `beta_signups`/);
  assert.equal(hosting.d1, "DB");
});

test("keeps the source catalog visible and honest about what each source is", async () => {
  const data = await read("../app/retailpulse-data.ts");
  const audit = await read("../docs/archive/work-v6.1/api-key-audit.md");
  assert.match(data, /INCHEON ARRIVAL HALL STATUS/);
  assert.match(data, /status: "AUTOMATION_REVIEW"/);
  assert.match(data, /Same data\.go\.kr project key/);
  assert.match(audit, /프로젝트 서비스키 1개 \+ API별 활용신청 3건/);
});

/** The About page is for a customer, so it must not read like engineering notes. */
test("the About page explains the product without developer jargon", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  assert.match(page, /function AboutView/);
  for (const question of [
    "KORETAIL은 무엇인가요", "누구를 위한 서비스인가요",
    "서울에서는 무엇을 보나요", "공항에서는 무엇을 보나요",
    "어떤 데이터를 쓰나요", "실시간·예상·과거는 어떻게 다른가요",
    "무엇을 주의해야 하나요",
  ]) assert.match(page, new RegExp(question));
  const about = page.match(/function AboutView[\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(about.length > 1000);
  for (const jargon of ["modelVersion", "featureVersion", "predictionHash", "recordOrigin", "dataCutoff", "isAggregate"]) {
    assert.doesNotMatch(about, new RegExp(jargon), `About must not expose "${jargon}"`);
  }
});

/**
 * Reader-facing copy stays in plain language.
 *
 * The product used to label whole screens "펄스" / "PULSE" and "인사이트" —
 * loanwords a first-time visitor has to decode before they can read a single
 * number. Screens are named for what they actually hold instead.
 */
test("no loanword jargon is used as reader-facing copy", async () => {
  const page = await read("../app/retailpulse-app.tsx");
  const live = await read("../app/live-signals.tsx");
  const seo = await read("../app/seo-config.ts");
  // Only quoted copy is checked. Internal identifiers such as RetailPulseProps
  // are technical names the brand decision deliberately leaves in place.
  const copy = [page, live, seo]
    .flatMap((source) => source.match(/"[^"\n]*"/g) ?? [])
    .join("\n");
  for (const jargon of [
    "펄스", "PULSE", "Pulse",
    "인사이트", "インサイト", "洞察",
    "시그널", "메트릭", "스코어", "인덱스", "대시보드",
  ]) {
    assert.doesNotMatch(copy, new RegExp(jargon), `"${jargon}" must not appear in reader-facing copy`);
  }
  // The screen it replaced is still reachable and named plainly.
  for (const label of ['forecast: "기록"', 'forecast: "Records"', 'forecast: "记录"', 'forecast: "記録"']) {
    assert.ok(page.includes(label), `${label} should name the records screen`);
  }
});

/** Styles for deleted components must not linger as dead payload. */
test("no stylesheet rules survive for components that no longer exist", async () => {
  const css = await read("../app/globals.css");
  for (const dead of [
    ".pulse-panel", ".pulse-line", ".pulse-meta", ".airport-pulse", ".business-pulse",
    ".share-pulse", ".demo-label", ".day-switch", ".compact-ranking", ".quick-actions",
    ".feature-discovery", ".forecast-lab", ".verification-counts", ".confidence-strip",
    ".decision-grid", ".target-registry", ".airline-intelligence",
  ]) {
    assert.doesNotMatch(css, new RegExp(dead.replace(".", "\\.")), `${dead} styles a component that was removed`);
  }
});
