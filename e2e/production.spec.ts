import { expect, test } from "@playwright/test";

import {
  FLIGHT_ROWS,
  routeSummary,
  SUBWAY_TREND_FIXTURE,
  SUMMARY_FIXTURE,
} from "./summary-fixture";

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

const localeFonts = [
  ["ko", "KORETAIL Sans Variable"],
  ["en", "KORETAIL Sans Variable"],
  ["zh", "Noto Sans SC Variable"],
  ["ja", "Noto Sans JP Variable"],
] as const;

for (const [locale, primaryFamily] of localeFonts) {
  test(`${locale} uses its primary UI font with supported weights`, async ({ page }) => {
    await page.goto(`/${locale}/business`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    await page.evaluate(async () => document.fonts.ready);

    const family = await page.locator(".app").evaluate((element) =>
      getComputedStyle(element).fontFamily,
    );
    expect(family.split(",")[0]).toContain(primaryFamily);

    const weights = await page.locator("body *").evaluateAll((elements) =>
      [...new Set(elements
        .filter((element) => element.childElementCount === 0 && element.textContent?.trim())
        .map((element) => getComputedStyle(element).fontWeight))]
        .sort(),
    );
    expect(weights).toEqual(["400", "600"]);
  });
}

test("business checklist uses one regular and one strong weight", async ({ page }) => {
  await page.goto("/ko/business");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(".industry-tabs button").first()).toHaveCSS("font-weight", "600");
  await expect(page.locator(".checklist-rows p").first()).toHaveCSS("font-weight", "400");
  await expect(page.locator(".checklist-rows strong").first()).toHaveCSS("font-weight", "600");
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
  // Desktop: the header carries the primary navigation and the phone tab bar
  // is not drawn, so it cannot sit on top of content on a wide screen.
  await expect(page.locator("nav.top-nav")).toBeVisible();
  await expect(page.locator("nav.bottom-nav")).toBeHidden();
  await page.locator("nav.top-nav a").filter({ hasText: "공항" }).click();
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


test("Store Dynamics is truthful and localized in all four languages", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  const expected = {
    ko: ["점포 현황", "과거 자료", "총 점포", "174개", "일반 점포 160개", "프랜차이즈 14개", "이번 분기 변화", "개업 10개", "폐업 5개", "2026년 2분기", "공식 과거자료", "KORETAIL 수집", "분기 기준 공식 과거 자료이며, 현재 영업 중인 점포의 실시간 수가 아닙니다."],
    en: ["Store openings and closures", "Historical", "Total stores", "174 stores", "Non-franchise stores 160 stores", "Franchise stores 14 stores", "Change this quarter", "Opened 10 stores", "Closed 5 stores", "Q2 2026", "official historical record", "KORETAIL retrieval", "Official quarterly historical data, not a real-time count of stores currently operating."],
    zh: ["店铺开业与歇业", "历史资料", "店铺总数", "174家", "非加盟店 160家", "加盟店 14家", "本季度变化", "开业 10家", "歇业 5家", "2026年第2季度", "官方历史资料", "KORETAIL采集", "官方季度历史资料，并非当前营业店铺的实时数量。"],
    ja: ["店舗の開業・廃業", "過去資料", "総店舗数", "174店", "非フランチャイズ店舗 160店", "フランチャイズ店舗 14店", "今四半期の変化", "開業 10店", "廃業 5店", "2026年第2四半期", "公式過去資料", "KORETAIL取得", "四半期基準の公式過去資料であり、現在営業中の店舗のリアルタイム件数ではありません。"],
  } as const;
  for (const locale of Object.keys(expected) as Array<keyof typeof expected>) {
    await page.goto(`/${locale}/myeongdong`);
    const card = page.locator('[data-signal-key="store-dynamics"]');
    await expect(card).toBeVisible();
    for (const phrase of expected[locale]) await expect(card).toContainText(phrase);
    await expect(card).toContainText("명동 남대문 북창동 다동 무교동 관광특구");
    await expect(card).toContainText("OA-15577");
    // Phase B v1 is counts only: no area-wide 개업률/폐업률 may be invented
    // from the summed counts and shown as if it were the official rate.
    await expect(card).not.toContainText("%");
    // The official Korean trade-area name keeps its source language for
    // assistive technology, wherever the redesign puts it.
    await expect(card.locator('.store-dynamics-scope [lang="ko"]')).toContainText("명동 남대문 북창동 다동 무교동 관광특구");
    // The spreadsheet grid is gone: the total is the headline, set by type
    // rather than by a bordered cell. The unit is localized, so match the count.
    await expect(card.locator(".store-dynamics-total strong")).toContainText("174");
    await expect(card.locator(".store-dynamics-counts")).toHaveCount(0);
  }
});

test("Store Dynamics stays grouped, ordered after sales, and unclipped at every required width", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  for (const width of [390, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/ko/myeongdong");
    const sales = page.locator('[data-signal-key="sales"]');
    const card = page.locator('[data-signal-key="store-dynamics"]');
    await expect(sales).toBeVisible();
    await expect(card).toBeVisible();
    const order = await page.locator("[data-signal-key]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-signal-key")));
    expect(order.indexOf("store-dynamics")).toBeGreaterThan(order.indexOf("sales"));
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await expect(card.locator(".store-dynamics-meta")).toBeVisible();
    await expect(card.locator(".store-dynamics-meta")).toContainText("현재 영업 중인 점포의 실시간 수가 아닙니다.");
    await expect(card.locator(".store-dynamics-meta")).toContainText("OA-15577");
    for (const selector of [
      ".store-dynamics-content",
      ".store-dynamics-scope",
      ".store-dynamics-total",
      ".store-dynamics-composition",
      ".store-dynamics-change",
      ".store-dynamics-meta",
    ]) {
      const clipped = await card.locator(selector).evaluateAll((nodes) => nodes.some((node) => node.scrollWidth > node.clientWidth + 1));
      expect(clipped, `${selector} must not clip horizontally at ${width}px`).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("airport summary keeps forecast, flights, gate and checkpoints truthful on mobile", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  // 첫 줄은 지금 시간대의 공식 예상 출국객, 대기는 짧은 보조 줄.
  await expect(page.locator(".airport-current-brief")).toContainText("공식 예상 출국객");
  await expect(page.locator(".airport-current-brief")).toContainText("대기 최장 T2 출국장 1B 60+분");
  await expect(page.locator(".airport-current-brief")).toContainText("출발 운항 561편");
  await expect(page.locator(".airport-current-brief")).not.toContainText("출발 561편");
  await expect(page.locator(".airport-current-brief")).toContainText("전주 동요일 비교 자료 없음");
  await expect(page.locator(".airport-today-grid")).not.toBeVisible();
  await page.locator(".airport-summary-details > summary").click();
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
  await expect(metricFreshness.first()).toContainText(/수집/);
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
 * The official forecast chart explains the four numbers directly above it, so
 * it reads immediately after "한눈에 보기" — ahead of the live checkpoint and
 * gate detail, which answer a different question.
 */
test("terminal briefing shows one labelled card per terminal and names the longest observed wait in four languages", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  const expected = {
    ko: { title: "지금 주목할 곳", attention: "T2 · 관측된 대기가 가장 긴 터미널", queue: "관측", next: "공식 예상", flights: "집계" },
    en: { title: "Where to watch now", attention: "T2 · Longest observed wait", queue: "observed", next: "official forecast", flights: "counted" },
    zh: { title: "现在值得关注的地方", attention: "T2 · 观测等候最长的航站楼", queue: "观测", next: "官方预计", flights: "统计" },
    ja: { title: "いま注目する場所", attention: "T2 · 観測された待ちが最も長いターミナル", queue: "観測", next: "公式予想", flights: "集計" },
  } as const;
  for (const locale of Object.keys(expected) as Array<keyof typeof expected>) {
    await page.goto(`/${locale}/airport`);
    await page.locator(".airport-summary-details > summary").click();
    const briefing = page.locator('[data-signal-key="terminal-briefing"]');
    await expect(briefing).toBeVisible();
    await expect(briefing.locator("h3")).toContainText(expected[locale].title);
    // The fixture's T2 checkpoint waits "60+" against T1's 24 minutes, so the
    // pick is T2 and the basis is the observed queue, never a forecast.
    await expect(briefing.locator(".terminal-attention")).toContainText(expected[locale].attention);
    await expect(briefing.locator(".terminal-attention")).toHaveAttribute("data-attention-terminal", "T2");
    const cards = briefing.locator(".terminal-brief-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute("data-terminal", "T1");
    await expect(cards.nth(1)).toHaveAttribute("data-terminal", "T2");
    await expect(cards.nth(1)).toHaveClass(/is-attention/);
    for (const kind of [expected[locale].queue, expected[locale].next, expected[locale].flights]) await expect(cards.nth(1)).toContainText(kind);
    await expect(briefing).not.toContainText(/%|점수|score|指数|スコア/);
  }
  // A single-terminal scope focuses the grid on that terminal; the cards are not repeated there.
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator(".terminal-selector button").filter({ hasText: /^T1$/ }).click();
  await expect(page.getByRole("tab", { name: "T1", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-signal-key="terminal-briefing"]')).toHaveCount(0);
});

test("departure composition is one accessible tab group with gate, airline and registered-country views", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport");
  const composition = page.locator(".airport-composition");
  const tabs = composition.getByRole("tablist", { name: "오늘 출발편 구성 보기" });
  const gateTab = tabs.getByRole("tab", { name: "게이트", exact: true });
  const airlineTab = tabs.getByRole("tab", { name: "항공사", exact: true });
  const countryTab = tabs.getByRole("tab", { name: "등록 국가", exact: true });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(gateTab).toHaveAttribute("aria-selected", "true");
  await expect(gateTab).toHaveAttribute("tabindex", "0");
  await expect(airlineTab).toHaveAttribute("tabindex", "-1");
  await expect(composition.getByRole("tabpanel")).toHaveAttribute("id", "airport-composition-panel-gates");
  await expect(composition.locator(".airport-airline-row, .airport-country-row")).toHaveCount(0);

  await airlineTab.click();
  await expect(airlineTab).toHaveAttribute("aria-selected", "true");
  const airlines = composition.locator(".airport-airlines");
  await expect(airlines).toBeVisible();
  const rows = airlines.locator(".airport-airline-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("KE");
  // The name comes only from the reference table, in every locale — never
  // from a raw per-row provider field (proven unreliable: see
  // lib/airline-ranking.ts). English is shown even on the Korean page.
  await expect(rows.nth(0)).toContainText("Korean Air");
  await expect(rows.nth(0)).toContainText("한국");
  await expect(rows.nth(0)).toContainText("140편");
  await expect(rows.nth(0)).toContainText("25%");
  // A designator the reference table cannot vouch for gets no name and no
  // country — never a guess, and never the raw provider label either.
  await expect(rows.nth(2)).toContainText("RS");
  await expect(rows.nth(2)).toContainText("확인 불가");
  await expect(rows.nth(2)).toContainText("등록 국가 미확인");
  await expect(airlines).toContainText("OpenFlights");

  await countryTab.click();
  await expect(countryTab).toHaveAttribute("aria-selected", "true");
  const countries = composition.locator(".airport-country-row");
  await expect(countries).toHaveCount(2);
  await expect(countries.nth(0)).toContainText("한국");
  await expect(countries.nth(0)).toContainText("2개 항공사");
  await expect(countries.nth(1)).toContainText("등록 국가 미확인");
  await expect(composition.locator(".airport-countries")).toContainText("OpenFlights");
  await expect(composition.locator(".airport-countries")).toContainText("승객의 국적이 아닙니다");
  await expect(composition.locator(".airport-jump-link")).toHaveCount(0);
  await expect(composition.locator(".eyebrow")).toHaveCount(0);

  // Arrow keys wrap through the views and move both focus and selection.
  await countryTab.press("ArrowRight");
  await expect(gateTab).toBeFocused();
  await expect(gateTab).toHaveAttribute("aria-selected", "true");

  // English readers get the reference-table name and a localized region name.
  await page.goto("/en/airport");
  await page.getByRole("tab", { name: "Airlines", exact: true }).click();
  const keRow = page.locator(".airport-airline-row").filter({ hasText: "KE" });
  await expect(keRow).toContainText("Korean Air");
  await expect(keRow).toContainText("South Korea");
  // Terminal scope narrows the ranking to that terminal's own operators.
  await page.goto("/ko/airport");
  // Wait for the hydrated all-terminal list before clicking, so the click reaches React.
  await page.getByRole("tab", { name: "항공사", exact: true }).click();
  await expect(page.locator(".airport-airline-row")).toHaveCount(3);
  await page.locator(".terminal-selector button").filter({ hasText: /^T1$/ }).click();
  await expect(page.locator(".airport-airline-row")).toHaveCount(1);
  await expect(page.locator(".airport-airline-row").first()).toContainText("Asiana Airlines");
  await expect(composition.locator(".airport-composition-scope")).toContainText("제1터미널");
  const terminalRepeats = (await composition.innerText()).match(/제1터미널/g)?.length ?? 0;
  expect(terminalRepeats).toBe(1);
});

test("a day with no stored departures says so instead of blaming gate coverage", async ({ page }) => {
  const empty = {
    ...SUMMARY_FIXTURE,
    airport: {
      ...SUMMARY_FIXTURE.airport,
      departuresTrackedToday: null,
      departuresTrackedTodayByTerminal: {},
      topDepartureGate: null,
      topDepartureGateTerminal: null,
      topDepartureGateFlights: null,
      topDepartureGateByTerminal: {},
      busyDepartureGates: [],
      busyDepartureGatesByTerminal: {},
      airlineRanking: { all: { totalFlights: 0, airlines: [], countries: [], retrievedAt: null }, byTerminal: {}, countrySource: SUMMARY_FIXTURE.airport.airlineRanking.countrySource },
    },
  };
  await page.route("**/api/live/summary*", routeSummary(empty));
  await page.goto("/ko/airport");
  await expect(page.locator(".airport-gates .airport-empty-line")).toContainText("수집이 완료되지 않았습니다");
  await page.getByRole("tab", { name: "항공사", exact: true }).click();
  await expect(page.locator(".airport-airlines .airport-empty-line")).toContainText("수집이 완료되지 않았습니다");
  await page.getByRole("tab", { name: "등록 국가", exact: true }).click();
  const countries = page.locator(".airport-countries");
  await expect(countries.locator(".airport-empty-line")).toContainText("수집이 완료되지 않았습니다");
  await expect(countries.locator(".airport-detail-foot")).toContainText("OpenFlights");
  await expect(countries.locator(".airport-detail-foot")).toContainText("승객의 국적이 아닙니다");
  await page.getByRole("tab", { name: "게이트", exact: true }).click();
  await expect(page.locator(".airport-gates")).not.toContainText("게이트 정보 범위가 충분하지 않아");
});

test("the airport page reads summary -> next -> composition -> observation table, in that order", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  const top = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`${selector} is not rendered`);
    return box.y;
  };
  // 요약 -> 다음 -> 구성 -> 관측 표. 검색대 상세 표는 2026-09-04에 맨 아래로
  // 내렸다(소유자: "잘 안 봐"). 맨 위 요약이 이미 지금 가장 긴 대기를 관측으로
  // 말하므로, 표는 일부러 펼쳐 보는 참고 자료다.
  const brief = await top(".airport-current-brief");
  await expect(page.locator(".airport-today-grid")).not.toBeVisible();
  const grid = await top(".airport-summary-details");
  const forecast = await top(".airport-forecast");
  const composition = await top(".airport-composition");
  const checkpoints = await top(".airport-checkpoints");
  expect(brief).toBeLessThan(grid);
  expect(grid).toBeLessThan(forecast);
  expect(forecast).toBeLessThan(composition);
  // 세 구성 보기는 하나의 탭 묶음 안에 있고, 표는 그 뒤에 남는다.
  expect(composition).toBeLessThan(checkpoints);
  await expect(page.locator(".airport-checkpoints")).toContainText("대기시간");
  await expect(page.getByRole("heading", { name: "공식 예상 출국객 흐름" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "오늘 출발편 구성" })).toBeVisible();
});

/**
 * The summary must say something about departing passengers right now, not
 * only about a queue. It is a forecast, so it says so.
 */
test("the summary states this hour's official expected departing passengers and where it is heading", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  const brief = page.locator(".airport-current-brief");
  await expect(brief).toBeVisible();
  // 강조되는 첫 줄이 지금 시간대의 공식 예상 출국객이다. 대기는 그 아래
  // 보조 줄로 내려갔다 — 검색대 줄 하나가 이 화면에서 가장 중요한
  // 사실은 아니다.
  const headline = brief.locator("strong").first();
  await expect(headline).toContainText("공식 예상 출국객");
  await expect(headline).not.toContainText("대기");
  await expect(brief).toContainText("대기 최장");
  // 예상치를 관측이라고 부르지 않는다.
  await expect(brief).not.toContainText("관측 출국객");
});

/**
 * "From this hour to the end of today" is only shown when the day's official
 * bands are provably complete, and it must be stated as whole bands.
 */
test("remaining expected departures is shown for a complete day and withheld for a partial one", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");
  await page.locator(".airport-summary-details > summary").click();
  await expect(page.getByText("현재 시간대부터 자정까지", { exact: true })).toBeVisible();
  await expect(page.getByText("11,430명", { exact: true })).toBeVisible();
  await expect(page.locator(".airport-current-brief")).toContainText("14:00 이후 시간대 합계 11,430명");

  // Two different times sit on this one card: the window the sum covers
  // (14:00–24:00) and the moment the forecast was fetched (09:05). Both used
  // to read as "기준", so the same number appeared to be dated twice.
  const remainingCard = page.locator(".airport-remaining");
  await expect(remainingCard).toContainText("14:00–24:00 KST 공식 예상 승객 합계");
  await expect(remainingCard).toContainText("09:05 수집");
  await expect(remainingCard).not.toContainText("09:05 기준");
  // Midnight closes today, so it is written 24:00 and never 00:00.
  await expect(remainingCard).not.toContainText("00:00");

  const partial = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
  partial.airport.forecastCoverage = { all: "PARTIAL", byTerminal: { T1: "PARTIAL", T2: "PARTIAL" } };
  partial.airport.todayExpectedPassengersTotal = null;
  partial.airport.peakExpectedTimeBand = null;
  partial.airport.passengerForecastTimeline = [];
  partial.airport.remainingExpectedPassengers = null;
  partial.airport.remainingExpectedPassengersByTerminal = { T1: null, T2: null };
  await page.route("**/api/live/summary*", routeSummary(partial));
  await page.reload();
  await expect(page.getByText("현재 시간대부터 자정까지", { exact: true })).toHaveCount(0);
  await expect(page.getByText("11,430명", { exact: true })).toHaveCount(0);
  await page.locator(".airport-summary-details > summary").click();
  await expect(page.getByText("전체 시간대 확인 불가").first()).toBeVisible();
});

test("home gives deterministic current briefs for all three Seoul areas", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko");
  await expect(page.getByRole("heading", { name: "서울 지금" })).toBeVisible();
  const briefs = page.locator(".home-area-briefs");
  // The metric is named before the number: a bare range beside a congestion
  // word reads as today's visitor count, which is not what this value is.
  await expect(briefs.getByRole("button", { name: /명동/ })).toContainText("현재 추정 인구 23,000–25,000명 · 약간 붐빔");
  await expect(briefs.getByRole("button", { name: /명동/ })).toContainText("오늘 17:00–18:00");
  await expect(briefs.getByRole("button", { name: /명동/ })).toContainText("비 가능성 60%");
  await expect(briefs.getByRole("button", { name: /홍대/ })).toContainText("인근 행사 1건 · 일반축제 · 홍대 거리공연");
  await expect(briefs.getByRole("button", { name: /성수/ })).toContainText("최근 관측 지연");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("Seoul renders compact arrival forecasts in four languages and no departure rows", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  const expected = {
    ko: ["오늘 예상 입국객", "다음 시간대 예상 입국객", "오늘 예상 입국 피크"],
    en: ["Expected arrivals today", "Next-band expected arrivals", "Expected arrival peak today"],
    zh: ["今日预计入境旅客", "下一时段预计入境旅客", "今日预计入境高峰"],
    ja: ["今日の予想入国者数", "次の時間帯の予想入国者数", "今日の予想入国ピーク"],
  } as const;

  for (const [locale, labels] of Object.entries(expected)) {
    await page.goto(`/${locale}`);
    await page.locator(".home-area-briefs button").first().click();
    const rows = page.locator(".signal-groups");
    for (const label of labels) await expect(rows.getByText(label, { exact: true })).toBeVisible();
    await expect(rows).toContainText(locale === "ko" ? "41,300명" : "41,300");
  }

  await page.goto("/ko");
  await page.locator(".home-area-briefs button").first().click();
  const rows = page.locator(".signal-groups");
  await expect(rows).toContainText("서울의 특정 지역과 직접 연결되지 않는 배경 참고");
  await expect(rows).toContainText("실제 서울 방문객 수 아님");
  await expect(rows).not.toContainText("현재 출국장 대기");
  await expect(rows).not.toContainText("예상 출국 승객");
});

test("partial arrival coverage hides the whole-day total and peak", async ({ page }) => {
  const partial = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
  partial.airport.arrivalForecast.todayExpectedPassengersTotal = null;
  partial.airport.arrivalForecast.peakExpectedTimeBand = null;
  partial.airport.arrivalForecast.forecastCoverage = { all: "PARTIAL", byTerminal: { T1: "PARTIAL", T2: "COMPLETE" } };
  await page.route("**/api/live/summary*", routeSummary(partial));
  await page.goto("/ko");
  await page.locator(".home-area-briefs button").first().click();
  const rows = page.locator(".signal-groups");
  await expect(rows.getByText("오늘 예상 입국객", { exact: true })).toHaveCount(0);
  await expect(rows.getByText("오늘 예상 입국 피크", { exact: true })).toHaveCount(0);
  await expect(rows.getByText("다음 시간대 예상 입국객", { exact: true })).toBeVisible();
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
  await page.locator(".airport-summary-details > summary").click();
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByText("47,320명", { exact: true })).toBeVisible();
  await expect(page.getByText("561편", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "T1" }).click();
  await expect(page.locator(".airport-current-brief")).toContainText("대기 최장 출국장 P01 24분");
  await expect(page.getByText("30,100명", { exact: true })).toBeVisible();
  await expect(page.getByText("300편", { exact: true })).toBeVisible();
  await expect(page.locator(".airport-gate-row").first()).toContainText("Gate 27");
  await expect(page.getByText("47,320명", { exact: true })).toHaveCount(0);
  await expect(page.getByText("561편", { exact: true })).toHaveCount(0);
  await expect(page.locator(".airport-gate-row")).toHaveCount(2);
  await expect(page.getByText("출국장 1B", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: "T2" }).click();
  await expect(page.locator(".airport-current-brief")).toContainText("대기 최장 출국장 1B 60+분");
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
  await page.locator(".airport-summary-details > summary").click();
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(".airport-today-grid article").filter({ hasText: "공식 예상 출국객" }).getByText("전체 시간대 확인 불가", { exact: true })).toBeVisible();
  await expect(page.getByText("공식 예상 데이터 일부 누락").first()).toBeVisible();
  await expect(page.locator(".airport-current-brief")).toContainText("공식 예상 승객 일부 누락 · 피크 판단 안 함");
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

test("the business-type checklist is readable, filled in and switches with the tab", async ({ page }) => {
  await page.goto("/ko/business");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.evaluate(async () => document.fonts.ready);
  const section = page.locator(".industry-section");
  await section.scrollIntoViewIfNeeded();

  // The selected tab used to be painted white on the paper background, which
  // made it vanish, and each label was squeezed into a 32px grid column so a
  // six-character Korean name wrapped one character per line.
  const tabs = await page.evaluate(() => {
    const paper = getComputedStyle(document.body).backgroundColor;
    return [...document.querySelectorAll<HTMLElement>(".industry-tabs button")].map((button) => {
      const style = getComputedStyle(button);
      return { text: button.textContent ?? "", color: style.color, paper, height: Math.round(button.getBoundingClientRect().height), active: button.classList.contains("active") };
    });
  });
  expect(tabs).toHaveLength(6);
  for (const tab of tabs) {
    expect(tab.color).not.toBe(tab.paper);
    expect(tab.color).not.toBe("rgb(255, 255, 255)");
    // Two lines at most: per-character wrapping produced a six-line label.
    expect(tab.height).toBeLessThan(64);
  }
  expect(tabs.filter((tab) => tab.active)).toHaveLength(1);

  // Three phase columns, each with rows, rather than one sparse list.
  await expect(page.locator(".checklist-phase")).toHaveCount(3);
  await expect(page.locator(".checklist-rows li")).toHaveCount(6);
  await expect(page.locator(".industry-watch b")).not.toBeEmpty();

  const beauty = await page.locator(".checklist-rows p").first().textContent();
  await page.getByRole("tab", { name: "관광·숙박" }).click();
  await expect(page.locator(".checklist-rows p").first()).not.toHaveText(beauty ?? "");
  await expect(page.locator(".checklist-rows li")).toHaveCount(6);

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("the checklist stacks without overflow on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/ja/business");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.evaluate(async () => document.fonts.ready);
  await page.locator(".industry-section").scrollIntoViewIfNeeded();
  await expect(page.locator(".checklist-phase")).toHaveCount(3);
  // Every row has to fit inside its own box: a label that paints wider than the
  // element it sits in is the readability defect this layout replaced.
  const overflowing = await page.evaluate(() => [...document.querySelectorAll(".industry-tabs button, .checklist-rows p, .checklist-rows strong")]
    .filter((el) => el.scrollWidth > Math.ceil(el.getBoundingClientRect().width) + 1).length);
  expect(overflowing).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("commercial activity and events expose their complete truth without a flat clamped row", async ({ page }) => {
  await page.route("**/api/live/events*", routeSummary({ events: SUMMARY_FIXTURE.areas.myeongdong.events, nextOffset: null }));
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko");
  const commercial = page.locator(".commercial-signal-card");
  await expect(commercial).toContainText("최근 10분 내국인 카드 소비");
  await expect(commercial).toContainText("상태");
  await expect(commercial).toContainText("보통");
  await expect(commercial).toContainText("결제금액");
  await expect(commercial).toContainText("₩1,000,000 ~ ₩1,100,000");
  await expect(commercial).toContainText("14:05 기준 최근 10분");
  await expect(commercial).toContainText("14:07 수집");
  await expect(commercial).toContainText("신한카드 내국인 결제 기반 · 전수 매출 아님 · 외국인 소비 아님");
  await expect(commercial).not.toContainText(/오늘 누적 매출|외국인 매출|명동 전체 매출/);

  const panel = page.locator(".event-signal-panel");
  await expect(panel).toContainText("4건 공식 행사기간 내·예정");
  await expect(panel).toContainText("공식 행사기간만으로 실제 운영 여부나 운영시간을 확인할 수 없습니다. 공식 안내를 확인하세요.");
  await expect(panel.locator(".event-card")).toHaveCount(3);
  await expect(panel.getByRole("button", { name: "수집된 행사 전체 보기" })).toHaveAttribute("aria-expanded", "false");
  await expect(
    panel.getByRole("link", { name: "공식 행사 페이지" }),
    "the representative valid URL is shown while javascript: is rejected",
  ).toHaveCount(1);

  const firstCard = panel.locator(".event-card").first();
  await expect(firstCard).toContainText("선택 날짜가 공식 행사기간에 포함");
  await expect(firstCard).toContainText("8/20–9/10");
  await expect(firstCard).toContainText("중구 명동길 14");
  await expect(firstCard).toContainText("320m");
  await expect(firstCard.locator(".event-preview")).toHaveText("관객과 소통하는 공연형 미술 콘텐츠입니다.");
  const officialLink = firstCard.getByRole("link", { name: "공식 행사 페이지" });
  await expect(officialLink).toHaveAttribute("target", "_blank");
  await expect(officialLink).toHaveAttribute("rel", "noopener noreferrer");
  const details = firstCard.locator("details");
  await expect(details.locator(".event-overview")).not.toBeVisible();
  await details.locator("summary").click();
  await expect(details.locator(".event-overview")).toBeVisible();
  await expect(details.locator(".event-overview")).toHaveText("관객과 소통하는 공연형 미술 콘텐츠입니다. 두 번째 공식 문장도 끝까지 읽을 수 있어야 합니다.");
  expect(await details.locator(".event-overview").evaluate((element) => getComputedStyle(element).webkitLineClamp)).toBe("none");

  await panel.getByRole("button", { name: "수집된 행사 전체 보기" }).click();
  await expect(panel.locator(".event-card")).toHaveCount(4);
  await expect(panel.getByRole("button", { name: "대표 3개만 보기" })).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByRole("link", { name: "공식 행사 페이지" })).toHaveCount(2);
});

test("a transitional cached payload never promises event cards it did not include", async ({ page }) => {
  const transitional = structuredClone(SUMMARY_FIXTURE);
  transitional.areas.myeongdong.eventCount = 13;
  transitional.areas.myeongdong.events = transitional.areas.myeongdong.events.slice(0, 3);
  await page.route("**/api/live/summary*", routeSummary(transitional));
  await page.goto("/ko");

  const panel = page.locator(".event-signal-panel");
  await expect(panel).toContainText("13건 공식 행사기간 내·예정");
  await expect(panel.locator(".event-card")).toHaveCount(3);
  await expect(panel.getByRole("button", { name: "수집된 행사 전체 보기" })).toBeVisible();
});

test("signal groups keep time meaning and value-source geometry at every required width", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/ko");
    await expect(page.locator(".signal-group-title")).toHaveText(["지금", "이동과 외국인 흐름", "오늘과 다음", "과거 상권 정보"]);
    for (const state of ["실시간/최근", "공식 예상", "지연 공개", "과거 자료"]) {
      await expect(page.getByText(state, { exact: true }).first()).toBeVisible();
    }
    const geometry = await page.locator(".signal-row").first().evaluate((row) => {
      const value = row.querySelector<HTMLElement>(".signal-row-value")?.getBoundingClientRect();
      const source = row.querySelector<HTMLElement>(".signal-row-source")?.getBoundingClientRect();
      const content = row.querySelector<HTMLElement>(".signal-row-content")?.getBoundingClientRect();
      return { valueLeft: value?.left ?? -1, sourceLeft: source?.left ?? -2, contentWidth: content?.width ?? 9999 };
    });
    expect(Math.abs(geometry.valueLeft - geometry.sourceLeft)).toBeLessThanOrEqual(2);
    expect(geometry.contentWidth).toBeLessThanOrEqual(820);
    const eventHeading = await page.locator(".event-panel-head").evaluate((head) => {
      const title = head.querySelector<HTMLElement>("h4")?.getBoundingClientRect();
      const count = head.querySelector<HTMLElement>("p")?.getBoundingClientRect();
      return { titleLeft: title?.left ?? -1, countLeft: count?.left ?? 9999 };
    });
    expect(eventHeading.countLeft - eventHeading.titleLeft).toBeLessThanOrEqual(820);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const panelWidth = await page.locator(".event-signal-panel").evaluate((element) => element.getBoundingClientRect().width);
  const cardWidth = await page.locator(".event-card").first().evaluate((element) => element.getBoundingClientRect().width);
  expect(cardWidth).toBeGreaterThanOrEqual(panelWidth - 2);
  for (const control of await page.locator(".event-card summary, .event-list-toggle").all()) {
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("commercial and event controls preserve their meaning in KO EN ZH JA", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  const expected = {
    ko: ["최근 10분 내국인 카드 소비", "수집된 행사 전체 보기", "자세히 보기", "공식 행사 페이지"],
    en: ["Recent 10-minute domestic-card activity", "Browse all collected events", "View details", "Official event page"],
    zh: ["最近10分钟境内消费者银行卡支付", "查看全部已收集活动", "查看详情", "官方活动页面"],
    ja: ["直近10分の国内消費者カード決済", "収集済みの全イベントを見る", "詳細を見る", "公式イベントページ"],
  } as const;
  for (const locale of Object.keys(expected) as Array<keyof typeof expected>) {
    await page.goto(`/${locale}`);
    for (const phrase of expected[locale].slice(0, 3)) await expect(page.getByText(phrase, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: expected[locale][3] }).first()).toBeVisible();
  }
});

/**
 * The chart once collapsed into a 190px strip on Production because its
 * container template had a fixed first track for a label that is not in the
 * markup. That bug was invisible to a probe that injected its own two-child
 * markup, so this measures the REAL rendered DOM.
 */
test("the passenger-flow chart uses the section width on desktop and never scrolls vertically", async ({ page }) => {
  const wide = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
  wide.airport.passengerForecastTimeline = Array.from({ length: 24 }, (_, hour) => ({
    targetStartAt: `2026-08-31T${String(hour).padStart(2, "0")}:00:00+09:00`,
    targetEndAt: hour === 23 ? "2026-09-01T00:00:00+09:00" : `2026-08-31T${String(hour + 1).padStart(2, "0")}:00:00+09:00`,
    expectedPassengers: 1000 + hour * 100,
  }));
  await page.route("**/api/live/summary*", routeSummary(wide));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ko/airport");
  const bars = page.locator(".airport-timeline-bars");
  await expect(bars).toBeVisible();
  const metrics = await bars.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    vertical: el.scrollHeight > el.clientHeight + 1,
    bands: el.children.length,
  }));
  expect(metrics.bands).toBe(24);
  expect(metrics.width).toBeGreaterThan(900);
  expect(metrics.vertical).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobile = await page.locator(".airport-timeline-bars").evaluate((el) => ({
    horizontal: el.scrollWidth > el.clientWidth + 1,
    vertical: el.scrollHeight > el.clientHeight + 1,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(mobile.horizontal).toBe(true);
  expect(mobile.vertical).toBe(false);
  expect(mobile.pageOverflow).toBeLessThanOrEqual(1);
});

/**
 * The fixture's clock is 05:10Z = 14:10 KST, inside the 14:00–15:00 band.
 * Today shows a marker there; a past or future service date shows none,
 * because no "now" exists inside a day the clock is not in.
 */
test("the current-time marker appears on today's chart only", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport");
  const now = page.locator(".airport-timeline-bars p.now");
  await expect(now).toHaveCount(1);
  await expect(now).toHaveAttribute("data-now-label", "현재 시각 14:10");
  await expect(now.locator("span")).toHaveText("14:00");
  await expect(page.locator(".airport-timeline")).toHaveAttribute("aria-label", /현재 시각 14:10/);

  for (const [date, relation] of [["2026-08-30", "PAST"], ["2026-09-01", "FUTURE"]] as const) {
    const other = JSON.parse(JSON.stringify(SUMMARY_FIXTURE));
    other.serviceDateKst = date;
    other.dayRelation = relation;
    other.airport.serviceDateKst = date;
    other.airport.passengerForecastTimeline = SUMMARY_FIXTURE.airport.passengerForecastTimeline.map((band) => ({
      ...band,
      targetStartAt: band.targetStartAt.replace("2026-08-31", date),
      targetEndAt: band.targetEndAt.replace("2026-08-31", date),
    }));
    await page.route("**/api/live/summary*", routeSummary(other));
    await page.goto(`/ko/airport?date=${date}`);
    await expect(page.locator(".airport-timeline-bars")).toBeVisible();
    await expect(page.locator(".airport-timeline-bars p.now")).toHaveCount(0);
  }
});

test("the facility directory browses official stores and never claims a store is open now", async ({ page }) => {
  const facilities = [
    { facilityId: "1", nameKo: "신라면세점", nameEn: "Shilla Duty Free", nameZh: "新罗免税店", nameJa: "新羅免税店", facilityItem: "화장품", largeCategory: "면세점", mediumCategory: "화장품", smallCategory: "향수", categoryGroup: "DUTY_FREE", terminal: "T1", floor: "3층", dutyArea: "DUTY_FREE", arrivalDeparture: "DEPARTURE", locationRaw: "제1여객터미널 3층 면세지역 27번 게이트 부근", locationEn: "T1 3F airside near Gate 27", businessHoursRaw: "07:00~21:00", goodsBrands: "화장품/향수", phone: "032-000-0000", retrievedAt: "2026-09-03T00:00:00.000Z" },
    { facilityId: "2", nameKo: "온누리약국", nameEn: "Onnuri Pharmacy", nameZh: null, nameJa: null, facilityItem: "의약품", largeCategory: "약국", mediumCategory: null, smallCategory: null, categoryGroup: "PHARMACY", terminal: "T1", floor: "1층", dutyArea: "GENERAL", arrivalDeparture: "ARRIVAL", locationRaw: "제1여객터미널 1층 입국장", locationEn: null, businessHoursRaw: null, goodsBrands: null, phone: null, retrievedAt: "2026-09-03T00:00:00.000Z" },
  ];
  await page.route("**/api/airport/facilities*", async (route) => {
    const url = new URL(route.request().url());
    const category = url.searchParams.get("category");
    const rows = category ? facilities.filter((row) => row.categoryGroup === category) : facilities;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ mode: "airport-facilities", facilities: rows, hasMore: false, basis: "OFFICIAL_PUBLISHED_HOURS" }) });
  });
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport");
  // The tab only switches once React has taken over the server-rendered page.
  await expect(page.locator(".app[data-hydrated='true']")).toBeVisible();
  await page.locator(".airport-context-nav button").filter({ hasText: "매장·시설" }).click();
  const directory = page.locator(".airport-facilities");
  await expect(directory).toBeVisible();
  await expect(directory.locator(".facility-card")).toHaveCount(1);
  await expect(directory.locator(".facility-card").first()).toContainText("신라면세점");
  await expect(directory.locator(".facility-card").first()).toContainText("제1여객터미널 3층 면세지역 27번 게이트 부근");
  await expect(directory.locator(".facility-card").first()).toContainText("07:00~21:00");
  // Published hours, never a real-time "open now" claim.
  await expect(directory).toContainText("공식 영업시간 기준");
  await expect(directory).not.toContainText(/지금 영업|영업 중|OPEN NOW/i);
  await expect(directory).toContainText("15095064");
  // Switching category re-queries and a facility with no published hours says so.
  await directory.locator(".facility-filter-row button").filter({ hasText: "약국" }).click();
  await expect(directory.locator(".facility-card")).toHaveCount(1);
  await expect(directory.locator(".facility-card").first()).toContainText("온누리약국");
  await expect(directory.locator(".facility-card").first()).toContainText("확인 불가");
  // English readers get the official English name and location.
  await page.goto("/en/airport");
  await expect(page.locator(".app[data-hydrated='true']")).toBeVisible();
  await page.locator(".airport-context-nav button").filter({ hasText: "STORES" }).click();
  await expect(page.locator(".facility-card").first()).toContainText("Shilla Duty Free");
  await expect(page.locator(".facility-card").first()).toContainText("T1 3F airside near Gate 27");
});

const TOURISM_SUMMARY_FIXTURE = {
  ...SUMMARY_FIXTURE,
  areas: {
    ...SUMMARY_FIXTURE.areas,
    hongdae: {
      ...SUMMARY_FIXTURE.areas.hongdae,
      subwayRidership: {
        referenceDate: "2026-08-30", boardingCount: 31000, alightingCount: 32000,
        selectedStationCount: 1, selectedStations: "홍대입구|2호선",
        retrievedAt: "2026-08-31T01:00:00Z", datasetId: "OA-22723", mappingVersion: "fixture",
        trend: SUBWAY_TREND_FIXTURE({
          previousDay: { baselineDates: ["2026-08-29"], baselineAlightingCount: 31_000, changeTenthsPercent: 32 },
          sameWeekdayLastWeek: { baselineDates: ["2026-08-23"], baselineAlightingCount: 33_000, changeTenthsPercent: -30 },
          recentSevenDayAverage: {
            baselineDates: ["2026-08-29", "2026-08-28", "2026-08-27", "2026-08-26", "2026-08-25", "2026-08-24", "2026-08-23"],
            baselineAlightingCount: 30_000, changeTenthsPercent: 67,
          },
          fourWeekSameWeekdayAverage: {
            baselineDates: ["2026-08-23", "2026-08-16", "2026-08-09", "2026-08-02"],
            baselineAlightingCount: 34_000, changeTenthsPercent: -59,
          },
        }),
      },
    },
    seongsu: {
      ...SUMMARY_FIXTURE.areas.seongsu,
      subwayRidership: {
        referenceDate: "2026-08-30", boardingCount: 41000, alightingCount: 42000,
        selectedStationCount: 1, selectedStations: "성수|2호선",
        retrievedAt: "2026-08-31T01:00:00Z", datasetId: "OA-22723", mappingVersion: "fixture",
        trend: SUBWAY_TREND_FIXTURE({
          previousDay: { baselineDates: ["2026-08-29"], baselineAlightingCount: 40_000, changeTenthsPercent: 50 },
          sameWeekdayLastWeek: { baselineDates: ["2026-08-23"], baselineAlightingCount: 40_000, changeTenthsPercent: 50 },
          recentSevenDayAverage: {
            baselineDates: ["2026-08-29", "2026-08-28", "2026-08-27", "2026-08-26", "2026-08-25", "2026-08-24", "2026-08-23"],
            baselineAlightingCount: 41_000, changeTenthsPercent: 24,
          },
          fourWeekSameWeekdayAverage: {
            baselineDates: ["2026-08-23", "2026-08-16", "2026-08-09", "2026-08-02"],
            baselineAlightingCount: 39_000, changeTenthsPercent: 77,
          },
        }),
      },
      events: [{
        contentId: "seongsu-event", title: "성수 공식 전시", eventStart: "2026-08-20", eventEnd: "2026-09-10",
        distanceM: 240, categoryName: "전시", address: "서울특별시 성동구 성수이로 1", addressDetail: null,
        overview: "성수 지역의 공식 행사 자료입니다.", homepage: null,
      }],
      eventCount: 1,
    },
  },
};

/**
 * Tourism Desk routing is one component over three isolated summary blocks.
 * Station names and counts are deliberately distinct so a route that keeps a
 * previous area's data cannot pass merely because its heading changed.
 */
test("the three Tourism Desk routes render only their selected area's data", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  const areas = [
    {
      id: "myeongdong", name: "명동", station: "명동역 4호선", alightings: "21,000",
      range: "23,000–25,000", event: "명동 공연 예술제",
      otherStations: ["홍대입구역 2호선", "성수역 2호선"], otherEvents: ["홍대 거리공연", "성수 공식 전시"],
    },
    {
      id: "hongdae", name: "홍대", station: "홍대입구역 2호선", alightings: "32,000",
      range: "18,000–20,000", event: "홍대 거리공연",
      otherStations: ["명동역 4호선", "성수역 2호선"], otherEvents: ["명동 공연 예술제", "성수 공식 전시"],
    },
    {
      id: "seongsu", name: "성수", station: "성수역 2호선", alightings: "42,000",
      range: null, event: "성수 공식 전시",
      otherStations: ["명동역 4호선", "홍대입구역 2호선"], otherEvents: ["명동 공연 예술제", "홍대 거리공연"],
    },
  ] as const;

  for (const area of areas) {
    await page.goto(`/ko/tourism-desk/${area.id}`);
    const desk = page.locator(".tourism-desk");
    await expect(desk.getByRole("heading", { level: 1, name: `${area.name} 관광안내` })).toBeVisible();
    await expect(page.locator(".tourism-area-switcher a[aria-current='page']")).toHaveText(area.name);
    await expect(desk).toContainText(area.station);
    await expect(desk.locator(".tourism-subway-primary")).toContainText(area.alightings);
    if (area.range) await expect(desk.locator(".tourism-current-reading")).toContainText(area.range);
    else await expect(desk.locator(".tourism-current-reading")).toHaveCount(0);
    await expect(desk).toContainText(area.event);
    await expect(desk).toContainText("관광객 수가 아닙니다");
    await expect(desk).toContainText("인천공항 입국 예보는 이 지역 방문객이나 관광객 수가 아닙니다");
    for (const other of area.otherStations) await expect(desk).not.toContainText(other);
    for (const other of area.otherEvents) await expect(desk).not.toContainText(other);

    const lines = desk.locator(".tourism-brief-line");
    await expect(lines.first()).toBeVisible();
    const count = await lines.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
    for (let index = 0; index < count; index += 1) {
      await expect(lines.nth(index).locator("small")).not.toBeEmpty();
    }
  }
});

test("Tourism Desk follows the seven-part guide workflow and shows only evidence-backed subway comparisons", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  await page.goto("/ko/tourism-desk/myeongdong");
  const desk = page.locator(".tourism-desk");
  const sectionHeadings = desk.locator(".tourism-guide-section > .tourism-section-head h2");

  await expect(sectionHeadings).toHaveCount(7);
  expect(await sectionHeadings.allInnerTexts()).toEqual([
    "오늘 근무 브리핑",
    "오늘 안내할 것",
    "교통 흐름 참고",
    "지금 지역 상황",
    "관광 흐름 배경 참고",
    "관광객에게 보여주기",
    "자료 기준과 한계",
  ]);

  const briefLines = desk.locator(".tourism-shift-brief .tourism-brief-line");
  await expect(briefLines).toHaveCount(5);
  await expect(briefLines.nth(0)).toContainText("현재 명동");
  await expect(briefLines.nth(4)).toContainText("지난주 같은 요일 대비 +12.4%");

  const comparisons = desk.locator(".tourism-subway-comparisons li");
  await expect(comparisons).toHaveCount(4);
  await expect(comparisons.nth(0)).toContainText("지난주 같은 요일 대비");
  await expect(comparisons.nth(0)).toContainText("+12.4%");
  await expect(comparisons.nth(1)).toContainText("최근 7일 평균 대비");
  await expect(comparisons.nth(1)).toContainText("+8.1%");
  await expect(comparisons.nth(1)).toContainText("정확히 직전 7일");
  await expect(comparisons.nth(2)).toContainText("전일 대비");
  await expect(comparisons.nth(2)).toContainText("+4.2%");
  await expect(comparisons.nth(3)).toContainText("최근 4주 같은 요일 평균 대비");
  await expect(comparisons.nth(3)).toContainText("+10.2%");
  await expect(desk.locator(".tourism-subway-secondary")).toContainText("2026년 8월 30일");
  await expect(desk.locator(".tourism-subway")).toContainText("고유 방문객 수나 이 지역 전체 방문객 수가 아닙니다");
});

test("Tourism Desk treats missing trend, stale realtime and all-null purpose data as unavailable evidence", async ({ page }) => {
  const missingTrend = JSON.parse(JSON.stringify(TOURISM_SUMMARY_FIXTURE));
  delete missingTrend.areas.hongdae.subwayRidership.trend;
  missingTrend.areas.hongdae.foreignPurposeMobility = {
    referenceDate: "2026-07-31",
    retrievedAt: "2026-08-29T01:00:00Z",
    datasetId: "OA-22378",
    mappingVersion: "fixture",
    shopping: null,
    tourism: null,
  };
  await page.route("**/api/live/summary*", routeSummary(missingTrend));
  await page.goto("/ko/tourism-desk/hongdae");
  const desk = page.locator(".tourism-desk");
  await expect(desk.locator(".tourism-subway-primary")).toContainText("32,000");
  await expect(desk.locator(".tourism-subway-history")).toHaveText("비교 이력 축적 중");
  await expect(desk.getByRole("heading", { name: "외국인 목적별 이동" })).toHaveCount(0);

  const stale = JSON.parse(JSON.stringify(TOURISM_SUMMARY_FIXTURE));
  stale.areas.myeongdong.realtime.freshness = "STALE";
  await page.unroute("**/api/live/summary*");
  await page.route("**/api/live/summary*", routeSummary(stale));
  await page.goto("/ko/tourism-desk/myeongdong");
  await expect(page.locator(".tourism-current-reading")).toHaveCount(0);
  await expect(page.locator(".tourism-shift-brief")).not.toContainText("현재 명동");
  await expect(page.locator(".tourism-shift-brief .tourism-brief-line")).toHaveCount(4);
});

test("Tourism event cards state official-period truth and copy only the allowlisted official facts", async ({ page, context }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  await page.goto("/ko/tourism-desk/myeongdong");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });

  const cards = page.locator(".tourism-event");
  await expect(cards).toHaveCount(3);
  const first = cards.first();
  await expect(first.locator(".tourism-event-status")).toHaveText("공식 행사기간에 오늘 포함");
  await expect(first).toContainText("2026-08-20 – 2026-09-10");
  await expect(first).toContainText("서울특별시 중구 명동길 14 · 1층");
  await expect(first).toContainText("한국관광공사 TourAPI");
  await expect(page.locator(".tourism-event-caveat")).toContainText("실제 운영 중인지");
  await expect(page.locator(".tourism-events")).not.toContainText("진행 중");

  await first.getByRole("button", { name: "정보 복사: 명동 공연 예술제" }).click();
  await expect(first.getByRole("status")).toHaveText("복사했습니다");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("행사명: 명동 공연 예술제");
  expect(copied).toContain("공식 행사기간: 2026-08-20 – 2026-09-10");
  expect(copied).toContain("주소: 서울특별시 중구 명동길 14 · 1층");
  expect(copied).toContain("공식 안내: https://example.org/event-one");
  expect(copied).toContain("출처: 한국관광공사 TourAPI");
  expect(copied).toContain("실제 운영 여부나 운영시간을 뜻하지 않습니다");
  expect(copied).not.toContain("관객과 소통");
  expect(copied).not.toContain("공연: ");

  const unsafe = cards.filter({ hasText: "도심 전시" });
  await expect(unsafe.getByRole("link", { name: /공식 안내 확인/ })).toHaveCount(0);
});

test("Visitor Show keeps the URL and official Korean proper name while supporting four languages and focus restoration", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/tourism-desk/myeongdong");
  const launch = page.locator(".tourism-visitor-launches li").filter({ hasText: "명동 공연 예술제" })
    .getByRole("button", { name: "이 행사 보여주기: 명동 공연 예술제" });
  const before = page.url();
  await launch.click();

  const dialog = page.locator("dialog.tourism-visitor-show");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "표시 언어" }).getByRole("button")).toHaveCount(4);
  await dialog.getByRole("button", { name: "English" }).click();
  await expect(dialog.getByRole("heading", { level: 2, name: "Visitor information" })).toBeVisible();
  await expect(dialog.locator("dd[lang='ko']").first()).toHaveText("명동 공연 예술제");
  await expect(dialog).toContainText("An official foreign-language name has not been verified");
  expect(page.url()).toBe(before);

  const overflow = await dialog.evaluate((element) => ({
    dialog: element.scrollWidth - element.clientWidth,
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.dialog).toBeLessThanOrEqual(1);
  expect(overflow.page).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launch).toBeFocused();
  expect(page.url()).toBe(before);

  await launch.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeVisible();
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
  await expect(launch).toBeFocused();
  expect(page.url()).toBe(before);
});

test("Tourism area links support keyboard, browser history and locale-preserving URLs", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  await page.goto("/ko/tourism-desk/myeongdong");
  const hongdae = page.locator(".tourism-area-switcher a").filter({ hasText: "홍대" });
  await expect(hongdae).toHaveAttribute("href", "/ko/tourism-desk/hongdae");
  await hongdae.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ko\/tourism-desk\/hongdae$/);
  await expect(page.getByRole("heading", { level: 1, name: "홍대 관광안내" })).toBeVisible();
  await expect(page.locator(".tourism-desk")).toContainText("홍대입구역 2호선");

  const language = page.locator(".language-control select");
  await expect(language).toHaveValue("ko");
  await language.selectOption("en");
  await expect(page).toHaveURL(/\/en\/tourism-desk\/hongdae$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hongdae Guide Desk" })).toBeVisible();
  await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", /\/en\/tourism-desk\/hongdae$/);

  // History is checked from a fresh Korean route so the language-switch
  // pushState entry is not mistaken for an area-navigation entry.
  await page.goto("/ko/tourism-desk/myeongdong");
  await page.locator(".tourism-area-switcher a").filter({ hasText: "홍대" }).click();
  await expect(page).toHaveURL(/\/ko\/tourism-desk\/hongdae$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/ko\/tourism-desk\/myeongdong$/);
  await expect(page.getByRole("heading", { level: 1, name: "명동 관광안내" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/ko\/tourism-desk\/hongdae$/);
  await expect(page.getByRole("heading", { level: 1, name: "홍대 관광안내" })).toBeVisible();
});

test("desktop navigation promotes Guide Desk in the exact localized order", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 1280, height: 900 });
  const expected = {
    ko: ["서울", "공항", "매장", "예측", "관광안내", "기록", "소개", "더보기"],
    en: ["Seoul", "Airport", "Business", "Outlook", "Guide Desk", "Records", "About", "More"],
    zh: ["首尔", "机场", "门店", "预测", "旅游咨询", "记录", "关于", "更多"],
    ja: ["ソウル", "空港", "店舗", "予測", "観光案内", "記録", "紹介", "その他"],
  } as const;

  for (const locale of Object.keys(expected) as Array<keyof typeof expected>) {
    await page.goto(`/${locale}/tourism-desk/myeongdong`);
    const nav = page.locator("nav.top-nav");
    await expect(nav).toBeVisible();
    expect(await nav.locator("a").allInnerTexts()).toEqual([...expected[locale]]);
    await expect(nav.locator("a[aria-current='page']")).toHaveText(expected[locale][4]);
    await expect(page.locator("nav.bottom-nav")).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${locale} desktop header must not overflow`).toBeLessThanOrEqual(1);
  }
});

test("mobile More explains usage without the removed promotion and retains its Tourism footer link", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/myeongdong");

  const bottom = page.locator("nav.bottom-nav");
  await expect(bottom).toBeVisible();
  await expect(bottom.locator("a")).toHaveCount(5);
  await expect(bottom).not.toContainText("관광안내");
  await bottom.locator("a").filter({ hasText: "더보기" }).click();
  await expect(page).toHaveURL(/\/ko\/more$/);

  await expect(page.locator(".tourism-link-block")).toHaveCount(0);
  await expect(page.locator(".site-usage-guide h2")).toHaveText("누가, 어떻게 쓰면 좋을까요?");
  const tourismLink = page.locator(".footer-links a").filter({ hasText: "관광안내 데스크" });
  await expect(tourismLink).toBeVisible();
  await expect(tourismLink).toHaveAttribute("href", "/ko/tourism-desk/myeongdong");
  await tourismLink.click();
  await expect(page).toHaveURL(/\/ko\/tourism-desk\/myeongdong$/);
  await expect(page.getByRole("heading", { level: 1, name: "명동 관광안내" })).toBeVisible();
  await expect(bottom.locator("a[aria-current='location']")).toHaveText("더보기");
  await expect(page.locator(".footer-links a").filter({ hasText: "관광안내 데스크" })).toHaveAttribute("href", "/ko/tourism-desk/myeongdong");
});

test("the obsolete area-page Tourism promotion is gone", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  for (const area of ["myeongdong", "hongdae", "seongsu"]) {
    await page.goto(`/ko/${area}`);
    await expect(page.locator(".desk-entry")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("관광안내 데스크 브리핑 보기");
  }
});

test("Tourism area navigation has no horizontal overflow at mobile and tablet widths", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(TOURISM_SUMMARY_FIXTURE));
  for (const width of [390, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ko/tourism-desk/seongsu");
    await expect(page.locator(".tourism-area-switcher")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px Tourism page must not overflow`).toBeLessThanOrEqual(1);
    const switcherOverflow = await page.locator(".tourism-area-switcher").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(switcherOverflow, `${width}px area switcher must not overflow`).toBeLessThanOrEqual(1);
  }
});


/**
 * 한 개의 margin 숫자만 재는 대신, 제목부터 실제 행까지의 간격과 넓은
 * 화면의 행 폭을 함께 잰다. 그래야 8px 뒤에 96px짜리 자식 헤드가 다시
 * 등장하는 이전 회귀를 잡을 수 있다.
 */
test("the composition module has intentional spacing and compact rows from mobile through wide desktop", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  for (const width of [390, 430, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ko/airport");

    const composition = page.locator(".airport-composition");
    await expect(composition).toBeVisible();
    await expect(composition.getByRole("heading", { name: "오늘 출발편 구성" })).toBeVisible();
    await expect(composition.locator(".airport-gate-row").first()).toBeVisible();

    const geometry = await composition.evaluate((element) => {
      const title = element.querySelector("h3")!.getBoundingClientRect();
      const scope = element.querySelector(".airport-composition-scope")!.getBoundingClientRect();
      const intro = element.querySelector(".airport-composition-head > div > p:not(.airport-composition-scope)")!.getBoundingClientRect();
      const truth = element.querySelector(".airport-composition-head small")!.getBoundingClientRect();
      const head = element.querySelector(".airport-composition-head")!.getBoundingClientRect();
      const tabs = element.querySelector("[role=tablist]")!.getBoundingClientRect();
      const panel = element.querySelector("[role=tabpanel]")!.getBoundingClientRect();
      const panelHeading = element.querySelector(".airport-composition-panel-head")!.getBoundingClientRect();
      const list = element.querySelector(".airport-gate-list")!.getBoundingClientRect();
      const row = element.querySelector(".airport-gate-row")!.getBoundingClientRect();
      return {
        titleToScope: scope.top - title.bottom,
        scopeToIntro: intro.top - scope.bottom,
        introToTruth: truth.top - intro.bottom,
        headToTabs: tabs.top - head.bottom,
        tabsToPanel: panel.top - tabs.bottom,
        headingToList: list.top - panelHeading.bottom,
        panelWidth: panel.width,
        rowWidth: row.width,
        minHeight: getComputedStyle(element).minHeight,
        overflow: element.scrollWidth - element.clientWidth,
      };
    });
    expect(geometry.titleToScope).toBeGreaterThanOrEqual(0);
    expect(geometry.titleToScope).toBeLessThanOrEqual(8);
    expect(geometry.scopeToIntro).toBeLessThanOrEqual(12);
    expect(geometry.introToTruth).toBeLessThanOrEqual(8);
    expect(geometry.headToTabs).toBeLessThanOrEqual(22);
    expect(geometry.tabsToPanel).toBeLessThan(28);
    expect(geometry.headingToList).toBeLessThan(24);
    expect(geometry.panelWidth).toBeLessThanOrEqual(862);
    expect(geometry.rowWidth).toBeLessThanOrEqual(862);
    expect(geometry.minHeight).toBe("0px");
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

/**
 * 예보 차트는 지금 시간대에서 열린다.
 *
 * 하루가 화면에 다 안 들어가서 늘 00:00 에서 열렸고, 오후에 보는 사람은
 * 새벽 막대를 보고 직접 끌어야 했다.
 */
test("the forecast chart opens scrolled to the current hour", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/airport");

  const bars = page.locator(".airport-timeline-bars");
  await expect(bars).toBeVisible();
  const now = bars.locator("p.now");
  await expect(now).toBeVisible();

  // 현재 시간대 막대가 보이는 영역 안에 들어와 있다.
  const inView = await bars.evaluate((element) => {
    const current = element.querySelector<HTMLElement>("p.now");
    if (!current) return false;
    const left = current.offsetLeft - element.scrollLeft;
    return left >= 0 && left + current.clientWidth <= element.clientWidth + 1;
  });
  expect(inView).toBe(true);
});

/**
 * "앱처럼 설치하기" — the owner asked for a button beside the date and a
 * guide that a first-time reader can actually follow.
 *
 * The install itself belongs to the browser and cannot be driven from a
 * test, so what is checked here is everything KORETAIL is responsible for:
 * the button is reachable in the header, the guide opens with real steps
 * for both phones, and it closes again.
 */
test("the header offers an install guide with real steps for Galaxy and iPhone", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const button = page.locator(".topbar .install-app-button");
  await expect(button).toBeVisible();
  await button.click();

  const dialog = page.locator(".install-modal");
  await expect(dialog).toBeVisible();
  // What it is, said before how to do it.
  await expect(dialog).toContainText("플레이스토어나 앱스토어에서 내려받는 앱은 아니며");
  // Both phones, with the step that actually trips people up.
  for (const heading of ["갤럭시 · 크롬", "갤럭시 · 삼성 인터넷", "아이폰 · 사파리", "컴퓨터 · 크롬 / 엣지"]) {
    await expect(dialog.locator(".install-section h3", { hasText: heading })).toHaveCount(1);
  }
  await expect(dialog).toContainText("'앱 설치'를 누릅니다");
  await expect(dialog).toContainText("'홈 화면에 추가'를 찾습니다");
  await expect(dialog).toContainText("공유 버튼");
  // And it never promises offline use, because there is no service worker.
  await expect(dialog).toContainText("열 때마다 인터넷 연결이 필요합니다");

  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toHaveCount(0);
});

test("the install guide keeps keyboard focus inside and restores the trigger", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const trigger = page.locator(".topbar .install-app-button");
  await trigger.focus();
  await trigger.press("Enter");

  const dialog = page.getByRole("dialog", { name: "앱처럼 설치하기" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(dialog).toHaveAttribute("aria-describedby", "install-description");
  await expect(page.locator("#install-description")).toBeVisible();

  const close = dialog.getByRole("button", { name: "닫기" });
  const firstControl = dialog.locator("button:not([disabled])").first();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(firstControl).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("the install guide is written in every locale, not only Korean", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  for (const [locale, marker] of [
    ["en", "iPhone · Safari"],
    ["zh", "iPhone · Safari"],
    ["ja", "iPhone · Safari"],
  ] as const) {
    await page.goto(`/${locale}`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    await page.locator(".topbar .install-app-button").click();
    const dialog = page.locator(".install-modal");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(marker);
    await expect(dialog).not.toContainText("앱처럼 설치하기");
  }
});

/**
 * Detection puts the reader's own device first and hides nothing.
 *
 * A wrong guess (an old user agent, a rewritten one, a reader installing
 * for someone else's phone) must cost an extra scroll, never the steps.
 */
test("the guide leads with the reader's own device and still lists the others", async ({ browser }) => {
  for (const [userAgent, first] of [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "아이폰 · 사파리"],
    ["Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", "갤럭시 · 크롬"],
  ] as const) {
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();
    await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
    await page.goto("/ko");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    await page.locator(".topbar .install-app-button").click();
    const headings = page.locator(".install-modal .install-section h3");
    await expect(headings.first()).toHaveText(first);
    await expect(headings, "every section stays on screen whatever the device is").toHaveCount(6);
    await context.close();
  }
});

/** The manifest and icons an install depends on are actually served. */
test("the manifest and its install icons are served", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = await manifest.json();
  expect(body.display).toBe("standalone");
  for (const icon of body.icons) {
    const response = await page.request.get(icon.src);
    expect(response.status(), `${icon.src} must be served`).toBe(200);
  }
  expect((await page.request.get("/apple-touch-icon.png")).status()).toBe(200);
});
