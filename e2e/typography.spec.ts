import { expect, test } from "@playwright/test";

import { lookupAirline } from "../lib/airline-country";
import { AIRLINE_REGISTRY, type AirlineRegistryEntry } from "../lib/airline-registry";
import { tofuCharacters } from "./font-glyphs";
import { routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";

/**
 * TYPOGRAPHY regression, from the owner's 2026-09-04 review of the install
 * guide: "글씨폰트 글자체 왤케 깨진거마냥 뒤죽박죽이야 통일성줘".
 *
 * Two separate things make text look like a broken mixture of typefaces,
 * and both are invisible to every other test here — the page still renders,
 * still passes its content assertions, and is still pure white:
 *
 *   1. Too many sizes and weights in one panel. Four sizes (22/13/12/11)
 *      across four line heights read as an accident, not a hierarchy.
 *   2. A character the bundled font subset does not carry. The browser
 *      silently draws that ONE character from a fallback font, so a single
 *      symbol comes out at a different width and weight from its
 *      neighbours. The first version of the guide used ≡ and ⬆ for the
 *      Samsung and iOS buttons and an arrow between menu steps; none of the
 *      three is in any bundled subset.
 *
 * The fonts are self-hosted subsets built from the production copy, so (2)
 * is a live risk every time copy is added. These tests measure the real
 * rendered result rather than reading the stylesheet.
 *
 * Coverage is asserted on all four locales now. The static subsets are built
 * from the complete product-copy source, while changeable provider-owned
 * Korean event text is routed to a complete modern-Hangul face.
 */

const openGuide = async (page: import("@playwright/test").Page, locale: string) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto(`/${locale}`);
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.waitForFunction(() => document.fonts.ready.then(() => true));
  await page.locator(".topbar .install-app-button").click();
  const dialog = page.locator(".install-modal");
  await expect(dialog).toBeVisible();
  return dialog;
};

const registeredCountryRepresentatives = (() => {
  const byCountry = new Map<string, AirlineRegistryEntry>();
  for (const entry of Object.values(AIRLINE_REGISTRY)) {
    if (byCountry.has(entry.country)) continue;
    if (lookupAirline(entry.iata)?.country !== entry.country) continue;
    byCountry.set(entry.country, entry);
  }
  return [...byCountry.values()].sort((left, right) => left.country.localeCompare(right.country));
})();

const countryCoverageShare = 1 / registeredCountryRepresentatives.length;
const ALL_REGISTERED_COUNTRIES_FIXTURE = {
  ...SUMMARY_FIXTURE,
  airport: {
    ...SUMMARY_FIXTURE.airport,
    departuresTrackedToday: registeredCountryRepresentatives.length,
    airlineRanking: {
      ...SUMMARY_FIXTURE.airport.airlineRanking,
      all: {
        ...SUMMARY_FIXTURE.airport.airlineRanking.all,
        totalFlights: registeredCountryRepresentatives.length,
        airlines: registeredCountryRepresentatives.map((entry) => ({
          iata: entry.iata,
          registryName: `Coverage carrier ${entry.iata}`,
          country: entry.country,
          countryBasis: "REGISTRY" as const,
          flights: 1,
          share: countryCoverageShare,
        })),
        countries: registeredCountryRepresentatives.map((entry) => ({
          country: entry.country,
          flights: 1,
          airlines: 1,
          share: countryCoverageShare,
        })),
      },
    },
  },
};

const PROVIDER_FONT_FACILITY = {
  facilityId: "9001",
  nameKo: "제1여객터미널 客家旅番福第階",
  nameEn: "Provider Coverage Store",
  nameZh: "香港旅客服务中心 · 김대리 면세점",
  nameJa: "香港旅客サービス · 专业东乐亚侧净凯办务协变场妆库时现疗约线罗货进递邮银际韩预饭 · 김대리 면세점",
  facilityItem: "여객 편의 ∙ 福",
  largeCategory: "면세점",
  mediumCategory: "서비스",
  smallCategory: null,
  categoryGroup: "DUTY_FREE",
  terminal: "T1",
  floor: "第1階",
  dutyArea: "DUTY_FREE",
  arrivalDeparture: "DEPARTURE",
  locationRaw: "제1여객터미널 客家旅番福第階 ∙",
  locationEn: "T1 3F airside",
  businessHoursRaw: "매일 07:00~21:00 ∙ 福",
  goodsBrands: "여행·면세 ∙ 福",
  phone: "032-000-0000",
  retrievedAt: "2026-09-04T00:00:00.000Z",
  mappingMethod: "AMBIGUOUS",
  mappingVersion: "fixture",
  gate: null,
  gateGroup: null,
  checkpointId: null,
  mappingEvidence: null,
};

for (const locale of ["ko", "en", "zh", "ja"] as const) {
  test(`${locale} install guide contains no missing-glyph boxes`, async ({ page }) => {
    const dialog = await openGuide(page, locale);
    expect(await tofuCharacters(dialog)).toEqual([]);
  });

  test(`${locale} Tourism Desk and Visitor Show contain no missing-glyph boxes`, async ({ page }) => {
    await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
    await page.goto(`/${locale}/tourism-desk/myeongdong`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    const desk = page.locator(".tourism-desk");
    expect(await tofuCharacters(desk)).toEqual([]);

    const launch = desk.locator(".tourism-visitor-launches button").first();
    await expect(launch).toBeVisible();
    await launch.click();
    const dialog = page.locator("dialog.tourism-visitor-show");
    await expect(dialog).toBeVisible();
    await dialog.locator(`button[lang="${locale}"]`).click();
    await expect(dialog).toHaveAttribute("lang", locale);
    expect(await tofuCharacters(dialog)).toEqual([]);
  });
}

for (const locale of ["ko", "en", "zh", "ja"] as const) {
  test(`${locale} Airport composition renders every supported registered country without tofu`, async ({ page }) => {
    await page.route("**/api/live/summary*", routeSummary(ALL_REGISTERED_COUNTRIES_FIXTURE));
    await page.goto(`/${locale}/airport`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

    const composition = page.locator(".airport-composition");
    await composition.locator("#airport-composition-tab-airlines").click();
    const airlines = composition.locator(".airport-airlines");
    await expect(airlines.locator(".airport-airline-row")).toHaveCount(registeredCountryRepresentatives.length);
    await expect(airlines.locator(".airport-airline-row em").first()).toHaveCSS("font-weight", "400");
    expect(
      await tofuCharacters(airlines),
      `${locale} airline-view region names must have 400-weight glyphs`,
    ).toEqual([]);

    await composition.locator("#airport-composition-tab-countries").click();
    const countries = composition.locator(".airport-countries");
    await expect(countries.locator(".airport-country-row")).toHaveCount(registeredCountryRepresentatives.length);
    await expect(countries.locator(".airport-country-row strong").first()).toHaveCSS("font-weight", "600");
    expect(await countries.locator(".airport-country-row strong > i").allTextContents())
      .toEqual(registeredCountryRepresentatives.map((entry) => entry.country));
    expect(
      await tofuCharacters(countries),
      `${locale} country-view region names must have 600-weight glyphs`,
    ).toEqual([]);
  });
}

const airportStoreLabel = { ko: "매장·시설", en: "STORES", zh: "店铺·设施", ja: "店舗・施設" } as const;
const airportMyStoreLabel = { ko: "내 매장", en: "MY STORE", zh: "我的店铺", ja: "自分の店舗" } as const;
const facilityNameLanguage = { ko: "ko", en: "en", zh: "zh", ja: "ja" } as const;

for (const locale of ["ko", "en", "zh", "ja"] as const) {
  test(`${locale} Airport directory and selected-store provider text contain no tofu`, async ({ page }) => {
    await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
    await page.route("**/api/airport/facilities*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          mode: "airport-facilities",
          facilities: [PROVIDER_FONT_FACILITY],
          hasMore: false,
          basis: "OFFICIAL_PUBLISHED_HOURS",
        }),
      });
    });
    await page.route("**/api/airport/facility-operations*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ mode: "airport-facility-operations", facility: PROVIDER_FONT_FACILITY, brief: null }),
      });
    });
    await page.goto(`/${locale}/airport`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

    await page.locator(".airport-context-nav button").filter({ hasText: airportStoreLabel[locale] }).click();
    const directory = page.locator(".airport-facilities");
    await expect(directory.locator(".facility-card")).toHaveCount(1);
    await expect(directory.locator(".facility-card h3 .airport-provider-text"))
      .toHaveAttribute("lang", facilityNameLanguage[locale]);
    await expect(directory.locator(".facility-details dd .airport-provider-text").first())
      .toHaveAttribute("lang", locale === "en" ? "en" : "ko");
    expect(await tofuCharacters(directory)).toEqual([]);

    await page.locator(".airport-context-nav button").filter({ hasText: airportMyStoreLabel[locale] }).click();
    await page.locator(".my-store input[type='search']").fill("Provider");
    const result = page.locator(".my-store-results button").first();
    await expect(result).toBeVisible();
    await result.click();
    const selectedStore = page.locator(".my-store-brief");
    await expect(selectedStore).toBeVisible();
    await expect(selectedStore.locator("h3 .airport-provider-text"))
      .toHaveAttribute("lang", facilityNameLanguage[locale]);
    expect(await tofuCharacters(selectedStore)).toEqual([]);
  });
}

/**
 * One scale, deliberately narrow. Sizes and weights are read off the real
 * computed styles, so a stray `font-size: 11px` added later fails here even
 * when the copy and the layout are fine.
 */
test("the install guide uses one type scale and two weights", async ({ page }) => {
  await openGuide(page, "ko");

  const used = await page.evaluate(() => {
    const sizes = new Set<string>();
    const weights = new Set<string>();
    const heights = new Set<string>();
    for (const node of Array.from(document.querySelectorAll(".install-modal *"))) {
      // Only elements that draw text of their own.
      const ownText = Array.from(node.childNodes).some((child) => child.nodeType === 3 && child.textContent?.trim());
      if (!ownText) continue;
      const style = getComputedStyle(node);
      sizes.add(style.fontSize);
      weights.add(style.fontWeight);
      // The ratio, not the pixel value: a 13px and a 20px line share a
      // rhythm when they share a ratio, and differ in px by definition.
      if (node.tagName !== "BUTTON") heights.add((parseFloat(style.lineHeight) / parseFloat(style.fontSize)).toFixed(2));
    }
    return { sizes: [...sizes].sort(), weights: [...weights].sort(), heights: [...heights].sort() };
  });

  // 20px title · 13px anything the reader must read · 12px the note beneath
  // it, plus the 10px eyebrow every panel in the product already uses.
  expect(used.sizes).toEqual(["10px", "12px", "13px", "20px"]);
  // A non-standard weight is synthesised when the variable font has not
  // loaded, and that alone makes a block look like a different typeface.
  expect(used.weights).toEqual(["400", "600"]);
  // Prose shares one rhythm; the title is the only exception.
  expect(used.heights, `line-height ratios in use: ${used.heights.join(", ")}`).toEqual(["1.30", "1.70"]);
});

/**
 * Historical stat values stay on ONE line.
 *
 * The owner's phone broke "2026-07" after the hyphen and dropped the "07"
 * into the paragraph below, and "2026-01 / 2026-03" split at the slash. A
 * period cut in half is not a smaller period, it is a wrong one, so the
 * value never wraps and the LABEL is what gives way. Measured on the real
 * rendered box rather than from the stylesheet, at the widths a phone
 * actually uses.
 */
for (const width of [360, 390, 430] as const) {
  test(`every historical stat value fits on one line · ${width}px`, async ({ page }) => {
    await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ko/forecast");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    const rows = page.locator(".stat-rows b");
    await expect(rows.first()).toBeVisible();

    const wrapped = await page.evaluate(() => {
      const broken: string[] = [];
      for (const value of Array.from(document.querySelectorAll<HTMLElement>(".stat-rows b, .stat-rows i"))) {
        const lines = value.getClientRects().length;
        if (lines > 1) broken.push(`${value.textContent?.trim()} (${lines} lines)`);
      }
      return broken;
    });
    expect(wrapped, `these values are split across lines: ${wrapped.join(" · ")}`).toEqual([]);

    // And nothing escapes the column while staying on one line.
    const overflow = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".stat-rows > div"))
        .filter((row) => row.scrollWidth > row.clientWidth + 1)
        .map((row) => row.textContent?.trim() ?? ""));
    expect(overflow, `these rows overflow their column: ${overflow.join(" · ")}`).toEqual([]);
  });
}

/**
 * The "show all categories" control reads as a control.
 *
 * It used to be a bare full-width underline sitting directly on top of the
 * weather paragraph, so the owner read it as that block's heading and never
 * pressed it. It now has a box of its own, a small "눌러서 펼치기" beside the
 * label, and real space before the block underneath.
 */
test("the category toggle looks pressable and is separated from the weather block", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/ko/myeongdong");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const toggle = page.locator(".operational-context .event-list-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText("업종 12개 전체 보기");
  // The hint the owner asked for, and it is inside the button so tapping
  // the small print works too.
  await expect(toggle.locator(".toggle-hint")).toHaveText("눌러서 펼치기");

  // A box, not a rule: all four borders, so it cannot read as a divider.
  const borders = await toggle.evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
  });
  expect(borders).toEqual(["1px", "1px", "1px", "1px"]);

  // The weather block is its own section: a rule of its own, and real space
  // between the button and its first word. Measured to the TEXT, because
  // that is the distance a reader sees.
  const separation = await page.evaluate(() => {
    const button = document.querySelector(".operational-context .event-list-toggle");
    const weather = document.querySelector<HTMLElement>(".context-environment");
    const heading = weather?.querySelector("strong");
    if (!button || !weather || !heading) return null;
    return {
      toBlock: weather.getBoundingClientRect().top - button.getBoundingClientRect().bottom,
      toText: heading.getBoundingClientRect().top - button.getBoundingClientRect().bottom,
      rule: getComputedStyle(weather).borderTopWidth,
    };
  });
  expect(separation?.rule, "the weather block needs a rule of its own").toBe("1px");
  expect(separation?.toBlock ?? 0).toBeGreaterThanOrEqual(24);
  expect(separation?.toText ?? 0).toBeGreaterThanOrEqual(44);

  // And it actually expands, with the hint following the state.
  await toggle.click();
  await expect(page.locator(".context-category-list li")).toHaveCount(12);
  await expect(toggle.locator(".toggle-hint")).toHaveText("눌러서 접기");
});

/**
 * "왜 자꾸 안 뜨는지 모르겠어" — the screen has to answer that.
 *
 * When the official forecast is missing because KORETAIL has not been able
 * to collect it, saying "이 날짜의 공식 예상 승객 자료 없음" blames the
 * provider for our own outage and leaves the reader with no idea why. On
 * 2026-09-06 production had 25 consecutive collection failures and no row
 * for the next day at all, and the screen looked exactly like a day the
 * airport had chosen not to publish.
 */
test("a stale forecast collection is named as ours, not as the provider having no data", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary({
    ...SUMMARY_FIXTURE,
    // No forecast rows for the day, and health that last succeeded long ago.
    sources: [{ sourceId: "INCHEON_PASSENGER_FORECAST", status: "STALE", retrievedAt: "2026-08-29T13:43:00.000Z" }],
    airport: {
      ...SUMMARY_FIXTURE.airport,
      forecastCoverage: { all: "UNAVAILABLE", byTerminal: { T1: "UNAVAILABLE", T2: "UNAVAILABLE" } },
      passengerForecastTimeline: [],
      passengerForecastTimelineByTerminal: {},
      peakExpectedTimeBand: null,
      peakExpectedTimeBandByTerminal: {},
    },
  }));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const brief = page.locator(".airport-brief, .terminal-brief-card, main").first();
  await expect(brief).toContainText("수집이");
  await expect(brief).toContainText("공급자 자료 없음이 아닙니다");
  await expect(page.locator("main")).not.toContainText("이 날짜의 공식 예상 승객 자료 없음");
});

/**
 * The weather line answers the two questions the numbers never did, and the
 * observation block stops reading as a second, contradictory forecast.
 */
test("the weather guide names dust and wind, and the observation is marked as now", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/myeongdong");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  // Observation: its own numbers, opening with 지금, dust spelled out.
  const environment = page.locator(".context-environment");
  await expect(environment).toContainText("지금 29.4°C");
  await expect(environment).toContainText("미세먼지 좋음");
  await expect(environment).toContainText("초미세먼지 좋음");
  // The raw parenthesised form the owner read as noise is gone.
  await expect(environment).not.toContainText("PM10 7μg/m³ (좋음)");

  // Forecast guide: the existing sentence, plus the appended clause.
  const guide = page.locator(".signal-row", { hasText: "날씨" }).first();
  await expect(guide).toContainText("미세먼지는");
  await expect(guide).toContainText("바람은");
});

/**
 * 출국 / 입국 — the Airport screen's two directions, side by side.
 *
 * "지금" named a TIME, which was never the choice a reader makes here, and
 * the arrival forecast had no way in at all even though the summary already
 * carried it. The arrival screen deliberately shows fewer facts than the
 * departure one: the queue, the busiest gate and the airline mix are
 * departure-only in the official data, so showing them under an arrival
 * heading would be showing departure facts.
 */
test("the airport screen separates 출국 and 입국, and 입국 shows arrival passengers only", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const nav = page.locator(".airport-context-nav");
  await expect(nav).toContainText("출국");
  await expect(nav).toContainText("입국");
  await expect(nav).not.toContainText("지금");

  await nav.getByRole("button", { name: "입국", exact: true }).click();

  const brief = page.locator(".airport-arrival-brief");
  await expect(brief).toBeVisible();
  await expect(brief).toContainText("공식 예상 입국객");
  await expect(brief).toContainText("41,300명");
  // It is a forecast about the airport, never a count of people reaching Seoul.
  await expect(brief).toContainText("서울로 이동하는 인원 수가 아닙니다");

  // The hourly arrival flow, from the same statement the departure page reads.
  await expect(page.locator("#airport-arrival-flow-title")).toContainText("공식 예상 입국객 흐름");
  await expect(page.locator(".airport-forecast .airport-timeline-bars p")).toHaveCount(2);

  // Per terminal, and nothing departure-only anywhere on the screen.
  await expect(page.locator(".airport-arrival-terminals")).toContainText("25,700명");
  await expect(page.locator(".airport-arrival-terminals")).toContainText("15,600명");
  // Scoped to the arrival content: the screen's own intro paragraph names
  // both directions, and that sentence is not an arrival claim.
  const arrivalContent = page.locator(".airport-arrival-brief, .airport-detail-section");
  for (const departureOnly of ["대기 최장", "운항 집중 게이트", "출발 운항"]) {
    await expect(arrivalContent.filter({ hasText: departureOnly })).toHaveCount(0);
  }
});
