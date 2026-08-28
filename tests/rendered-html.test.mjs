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

test("renders the KORETAIL production shell", async () => {
  const response = await renderHome();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /<title>서울 외국인 쇼핑수요 신호 \| KORETAIL<\/title>/i);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.match(html, /내일 서울은/);
  assert.match(html, /데모 데이터/);
});

test("uses KORETAIL across the public brand surfaces", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const seo = await readFile(new URL("../app/seo-config.ts", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
  const publicBrand = `${page}\n${layout}\n${seo}\n${manifest}`;

  for (const required of [
    "KORETAIL",
    "Retail Demand Signals for Korea",
    "KORETAIL에서 할 수 있는 것",
    "WHAT YOU CAN DO WITH KORETAIL",
    "KORETAIL可以做什么",
    "KORETAILでできること",
    "MY KORETAIL",
    "KORETAIL PRO",
  ]) assert.match(publicBrand, new RegExp(required));

  for (const formerPublicBrand of [
    "RETAILPULSE KOREA",
    "RetailPulse Pro",
    "MY RETAILPULSE",
    "RetailPulse에서 할 수 있는 것",
    "WHAT YOU CAN DO WITH RETAILPULSE",
    "RetailPulse可以做什么",
    "RetailPulseでできること",
    "RetailPulse Seoul",
  ]) assert.doesNotMatch(publicBrand, new RegExp(formerPublicBrand, "i"));
});

test("keeps both user-provided Seoul visuals and their accessible descriptions", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  assert.match(page, /\/assets\/seoul-hangang\.jpeg/);
  assert.match(page, /\/assets\/seoul-hanok\.jpeg/);
  assert.match(page, /석양 아래 한강과 남산서울타워가 보이는 서울 전경/);
  assert.match(page, /한옥 지붕 너머로 남산서울타워가 보이는 서울 풍경/);
});

test("keeps the four-language fonts as bounded static assets", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
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

test("includes all MVP surfaces without a runtime LLM dependency", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/retailpulse-data.ts", import.meta.url), "utf8");
  const product = `${page}\n${data}`;
  for (const required of [
    "ForecastView",
    "AirportView",
    "BusinessView",
    "BusinessHistoryView",
    "HistoryView",
    "MoreView",
    "ProModal",
    "StatePreview",
    "简体中文",
    "日本語",
    "HomeRankings",
    "HomeAirportNow",
    "GlobalSearch",
    "area-why",
  ]) assert.match(page, new RegExp(required));
  for (const businessFeature of [
    "오늘 예상 출국객",
    "내일 예상 출국",
    "공항 과거 흐름",
    "OFFICIAL HISTORICAL",
    "AIRLINE INTELLIGENCE",
    "게이트 주변 예상 혼잡",
    "INCHEON DEPARTURE HALL CONGESTION",
    "INCHEON ARRIVAL HALL STATUS",
    "INCHEON DUTY-FREE FACILITIES",
    "T1",
    "T2",
    "뷰티·화장품",
    "패션·잡화",
    "식음료·카페",
    "SKT GEOVISION PUZZLE",
    "KT PLIP / BIGSIGHT",
    "NAVER DATALAB",
  ]) assert.match(product, new RegExp(businessFeature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(product, /\b\d+\.\d+[KMB]\b/);
  assert.doesNotMatch(product, /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/i);
});

test("keeps official airport totals exact and does not invent terminal shares", async () => {
  const data = await readFile(new URL("../app/retailpulse-data.ts", import.meta.url), "utf8");
  assert.match(data, /month: "2026-07"/);
  assert.match(data, /all: \{ arrival: 3199990, departure: 3364748 \}/);
  assert.match(data, /T1: \{ arrival: 1554721, departure: 1639145 \}/);
  assert.match(data, /T2: \{ arrival: 1645269, departure: 1725603 \}/);
  assert.match(data, /no proportional allocation is used/i);
});

test("keeps gate and duty-free intelligence within official data boundaries", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/retailpulse-data.ts", import.meta.url), "utf8");
  const pressure = await readFile(new URL("../lib/airport-pressure.ts", import.meta.url), "utf8");
  assert.match(pressure, /flight\.status === "cancelled"/);
  assert.match(pressure, /physicalFlightId/);
  assert.match(pressure, /gateFreshnessMinutes/);
  assert.match(pressure, /options\.gateZones \?\? \[\]/);
  assert.match(page, /가짜 게이트 범위나 사람 수를 표시하지 않습니다/);
  assert.match(page, /A4.*T1 출국장 혼잡만 보조 근거/s);
  assert.match(data, /T1 checkpoints 1–6 · T2 planned/);
  assert.match(data, /not store footfall/i);
});

test("ships the V5 operational, SEO, roadmap, and QA documents", async () => {
  for (const file of [
    "production-handoff.md",
    "data-source-matrix.md",
    "historical-backfill-plan.md",
    "qa-report.md",
    "qa-report-v5.md",
    "live-readiness.md",
    "seo-handoff.md",
    "product-roadmap.md",
    "gate-retail-data-audit.md",
    "feature-map-v5-5.md",
    "qa-report-v5-5.md",
    "qa-report-v5-6.md",
    "qa-report-v5-7.md",
    "api-key-audit.md",
    "growth-validation-plan.md",
    "qa-report-v5-8.md",
    "competitor-audit.md",
    "forecast-target-registry.md",
    "forecast-contract.md",
    "outcome-contract.md",
    "no-leakage-policy.md",
    "zero-cost-policy.md",
    "forecast-validation-plan.md",
    "30-60-90-plan.md",
  ]) {
    const body = await readFile(new URL(`../docs/archive/work-v6.1/${file}`, import.meta.url), "utf8");
    assert.ok(body.length > 500, `${file} should contain a substantive handoff`);
  }
});

test("locks V6.1 positioning and an honest prospective track record", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const registry = await readFile(new URL("../docs/archive/work-v6.1/forecast-target-registry.md", import.meta.url), "utf8");
  const leakage = await readFile(new URL("../docs/archive/work-v6.1/no-leakage-policy.md", import.meta.url), "utf8");
  const cost = await readFile(new URL("../docs/archive/work-v6.1/zero-cost-policy.md", import.meta.url), "utf8");
  assert.match(page, /FOREIGN VISITOR RETAIL INTELLIGENCE · SEOUL/);
  assert.match(page, /function ForecastLab/);
  assert.match(page, /FORWARD PREDICTIONS/);
  assert.match(page, /FAST VERIFIED/);
  assert.match(page, /DEEP VERIFIED/);
  assert.match(page, /BASELINE BEATEN/);
  for (const id of ["TARGET_A", "TARGET_B", "TARGET_C", "TARGET_D"]) assert.match(`${page}\n${registry}`, new RegExp(id));
  assert.match(leakage, /eventTime/);
  assert.match(leakage, /availableTime/);
  assert.match(leakage, /ingestionTime/);
  assert.match(cost, /automatic overage/i);
});

test("ships localized indexable routes and technical SEO files", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const seo = await readFile(new URL("../app/seo-config.ts", import.meta.url), "utf8");
  const localePage = await readFile(new URL("../app/[locale]/page.tsx", import.meta.url), "utf8");
  const localizedRoute = await readFile(new URL("../app/[locale]/[slug]/page.tsx", import.meta.url), "utf8");
  const robots = await readFile(new URL("../app/robots.ts", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
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

test("ships the V5.5 command center and progressive information architecture", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const surface of [
    "HomeRankings",
    "HomeAirportNow",
    "QuickActions",
    "FeatureDiscovery",
    "SUMMARY / WHY / HISTORY / GOOD TO KNOW / DATA",
    "airport-context-nav",
    "business-reading-map",
    "historical-highlights",
    "KORETAIL에서 할 수 있는 것",
  ]) assert.match(`${page}\n${await readFile(new URL("../docs/archive/work-v6.1/feature-map-v5-5.md", import.meta.url), "utf8")}`, new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(page, /\["today", "airport", "business", "forecast", "more"\]/);
  assert.match(page, /\["now", "next", "flights", "history", "airlines"\]/);
  assert.match(page, /현재 \$\{terminal\} 실시간 출국 수치는 공식 연결 전/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 365px\)/);
});

test("keeps V5.5 expanded copy available in all four languages", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  for (const phrase of [
    "서울 지역 비교",
    "SEOUL AREA PULSE",
    "首尔地区比较",
    "ソウルのエリア比較",
    "빠른 실행",
    "QUICK ACTIONS",
    "快捷入口",
    "クイック操作",
    "多语种说明",
  ]) assert.match(page, new RegExp(phrase));
  assert.doesNotMatch(page, /多语种 안내/);
});

test("applies a user-defined month range to airport and business history", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /function MonthRangePicker/);
  assert.match(page, /name="startMonth"/);
  assert.match(page, /name="endMonth"/);
  assert.match(page, /new FormData\(event\.currentTarget\)/);
  assert.match(page, /onApply\(nextStart, nextEnd\)/);
  assert.match(page, /setHistoryPeriod\("custom"\)/);
  assert.match(page, /setPeriod\("custom"\)/);
  assert.match(page, /start > end/);
  assert.match(page, /start < min \|\| end > max/);
  assert.match(page, /rangeStartRow\.month !== rangeEndRow\.month/);
  assert.match(page, /startRow\.month !== endRow\.month/);
  assert.match(page, /SELECTED PERIOD TOTAL/);
  assert.match(page, /SELECTED-PERIOD TERMINAL MIX/);
  assert.match(page, /선택 기간 월평균/);
  assert.match(css, /\.month-range-picker/);
  assert.match(css, /overflow-x: auto/);
});

test("states the current runtime API truth without counting font assets as data APIs", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const matrix = await readFile(new URL("../docs/archive/work-v6.1/data-source-matrix.md", import.meta.url), "utf8");
  assert.match(page, /LIVE RUNTIME DATA API/);
  assert.match(page, /현재 직접 호출 0개/);
  assert.match(page, /웹폰트 요청은 화면 자산이며 관광·공항 데이터 API가 아닙니다/);
  assert.match(page, /fetch\("\/api\/beta-signups"/);
  assert.doesNotMatch(page, /fetch\(\s*["']https?:/i);
  assert.match(matrix, /방문 시 직접 호출하는 외부 관광·공항·서울 데이터 API \| \*\*0개\*\*/);
  assert.match(matrix, /공식 Historical 집계 \| \*\*2개 Source\*\*/);
});

test("removes fabricated forecast performance and requires prospective evidence", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const plan = await readFile(new URL("../docs/archive/work-v6.1/growth-validation-plan.md", import.meta.url), "utf8");
  assert.match(page, /function ForecastVerification/);
  assert.match(page, /공개할 예측 정확도가 아직 없습니다/);
  assert.match(page, /30 .*결과일 \+ 연속 4주/);
  assert.match(page, /90 .*일 이상 \+ 기준모델 우위/);
  assert.match(plan, /OFFICIAL_HISTORICAL.*BACKFILLED.*FORECAST_CAPTURED/s);
  assert.doesNotMatch(page, /FORECAST SCOREBOARD · DEMO/);
  assert.doesNotMatch(page, /MAE · LAST 30/);
  assert.doesNotMatch(page, /CONFIDENCE <strong>74%/);
  assert.doesNotMatch(page, /<strong>71%<\/strong>/);
});

test("makes sample demand and unavailable airport pressure impossible to mistake for live data", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const live = await readFile(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/retailpulse-data.ts", import.meta.url), "utf8");
  const pressure = await readFile(new URL("../lib/airport-pressure.ts", import.meta.url), "utf8");
  for (const phrase of ["예시 수요지수", "DEMO DEMAND INDEX", "演示需求指数", "デモ需要指数"]) assert.match(page, new RegExp(phrase));
  assert.match(page, /같은 예시값 분포 안에서 낮음·보통·높음/);
  assert.match(page, /실시간 공항 데이터 연결 준비 중/);
  assert.match(page, /가짜 게이트 범위나 사람 수를 표시하지 않습니다/);
  assert.doesNotMatch(page, /<WhatChanged/);
  assert.doesNotMatch(page, /HISTORY · 4-WEEK COMPARISON/);
  assert.match(live, /현재 예시 수요지수 계산에는 포함되지 않으며/);
  assert.match(data, /export const demoFlights/);
  assert.doesNotMatch(data, /export const flights/);
  assert.match(pressure, /physicalFlightId/);
  assert.match(pressure, /flight\.status === "cancelled"/);
  assert.match(pressure, /kind: "exactGate" \| "gateZone" \| "terminal"/);
});

test("persists consented beta interest in D1 without a public list endpoint", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/beta-signups/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_daffy_tempest.sql", import.meta.url), "utf8");
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

test("separates the number of secrets from API applications and removes fake freshness", async () => {
  const page = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/retailpulse-data.ts", import.meta.url), "utf8");
  const audit = await readFile(new URL("../docs/archive/work-v6.1/api-key-audit.md", import.meta.url), "utf8");
  assert.match(page, /세 개의 별도 키가 아닙니다/);
  assert.match(page, /API APPLICATIONS<\/span><strong>3/);
  assert.match(page, /가짜 업데이트 시각을 표시하지 않습니다/);
  assert.doesNotMatch(page, /Updated 12m ago|Updated 35m ago|Updated 3h ago|Updated 8m ago/);
  assert.match(data, /INCHEON ARRIVAL HALL STATUS/);
  assert.match(data, /status: "AUTOMATION_REVIEW"/);
  assert.match(data, /Same data\.go\.kr project key/);
  assert.match(audit, /프로젝트 서비스키 1개 \+ API별 활용신청 3건/);
  assert.match(audit, /무제한 무료/);
});
