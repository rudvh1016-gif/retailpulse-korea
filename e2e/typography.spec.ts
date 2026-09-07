import { expect, test } from "@playwright/test";

import { lookupAirline } from "../lib/airline-country";
import { AIRLINE_REGISTRY, type AirlineRegistryEntry } from "../lib/airline-registry";
import { tofuCharacters } from "./font-glyphs";
import { MYEONGDONG_CONTEXT, routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";

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
  // A current observation needs no essay about the forecast below it.
  await expect(environment).not.toContainText("기상청 예보라서");

  // Forecast guide: the existing sentence, plus the appended clause.
  const guide = page.locator(".signal-row", { hasText: "날씨" }).first();
  await expect(guide).toContainText("미세먼지는");
  await expect(guide).toContainText("바람은");

  // Humidity and wind are MEASURED right above. Printing KMA's forecast of
  // the same two values a few lines down is the overlap the owner reported,
  // so while the observation is current the forecast row leaves them out.
  await expect(environment).toContainText("습도 44%");
  await expect(guide).not.toContainText("습도 65%");
  await expect(guide).not.toContainText("바람 2.5m/s");
});

/**
 * "주변환경관측과 날씨의 온도가 다른 게 이해가 안 가고 겹쳐."
 *
 * Both numbers were right. Seoul's sensor really had recorded 29.4°C, and
 * KMA really did forecast 27°C for the current hour — but the observation was
 * from the previous afternoon, because that collector had stopped succeeding,
 * and the screen still called it "지금". A stale reading labelled as current,
 * sitting directly above a live forecast, is what turns two honest sources
 * into one broken-looking weather block.
 */
test("a stale observation is stamped with the time it was taken and explains the forecast beneath it", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary({
    ...SUMMARY_FIXTURE,
    areas: {
      ...SUMMARY_FIXTURE.areas,
      myeongdong: {
        ...SUMMARY_FIXTURE.areas.myeongdong,
        context: {
          ...MYEONGDONG_CONTEXT,
          // Yesterday afternoon: the collector stopped succeeding after this.
          weather: { ...MYEONGDONG_CONTEXT.weather, observedAt: "2026-08-30T14:50:00+09:00" },
        },
      },
    },
  }));
  await page.goto("/ko/myeongdong");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const environment = page.locator(".context-environment");
  // The one word that caused the confusion must be gone from the number.
  await expect(environment).not.toContainText("지금 29.4°C");
  await expect(environment).toContainText("08-30 14:50 관측 29.4°C");
  // And the screen says, in one line, why the row below disagrees.
  await expect(environment).toContainText("23시간 20분 전 관측된 값입니다");
  await expect(environment).toContainText("기상청 예보라서 숫자가 다릅니다");

  // With no current measurement to defer to, KMA is the only source for
  // humidity and wind, so they come back rather than silently vanishing.
  const guide = page.locator(".signal-row", { hasText: "날씨" }).first();
  await expect(guide).toContainText("습도 65%");
  await expect(guide).toContainText("바람 2.5m/s");
});

/**
 * "소비업종 정보 버튼이 갑자기 또 사라졌어."
 *
 * Nothing was deleted. The expand control only has work to do above three
 * categories, and on the night the owner looked Seoul had published exactly
 * one. An absent button is indistinguishable from a removed feature, so the
 * count is now stated whatever the provider published.
 */
test("the category count is on screen even when Seoul publishes a single category", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary({
    ...SUMMARY_FIXTURE,
    areas: {
      ...SUMMARY_FIXTURE.areas,
      myeongdong: {
        ...SUMMARY_FIXTURE.areas.myeongdong,
        context: { ...MYEONGDONG_CONTEXT, categories: MYEONGDONG_CONTEXT.categories.slice(0, 1) },
      },
    },
  }));
  await page.goto("/ko/myeongdong");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  await expect(page.locator(".context-category-list li")).toHaveCount(1);
  await expect(page.locator(".context-category-count"))
    .toHaveText("서울시가 지금 공개한 업종 1개를 모두 표시했습니다");
  // There is genuinely nothing to expand, so no control is offered — but the
  // reader is told why, which is the whole difference from a deleted feature.
  await expect(page.locator(".context-more .event-list-toggle")).toHaveCount(0);
});

test("the count stays truthful while the full list is collapsed and expanded", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/myeongdong");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const count = page.locator(".context-category-count");
  await expect(count).toHaveText("서울시가 지금 공개한 업종 12개 중 3개를 표시했습니다");
  await page.locator(".context-more .event-list-toggle").click();
  await expect(count).toHaveText("서울시가 지금 공개한 업종 12개를 모두 표시했습니다");
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

/**
 * 게이트 순위를 한눈에 — the ranking drawn as a chart.
 *
 * Owner request, 2026-09-06: "게이트별 항공편을 순위별로 차트로 … 한눈에
 * 어떤 항공편이 주로 많이 나가는지 보여지면 좋겠어." Five numbers in a
 * column answer "how many" but not "which one dominates"; a bar scaled to
 * the leader answers it without reading a single digit.
 *
 * The bar is measured against the BUSIEST gate, not against the day's total
 * departures — a share-of-total scale would flatten all five into slivers —
 * and the note under the chart says so, because a reader who assumes
 * "share of all flights" would misread every row but the first.
 */
test("the busiest-gate ranking is drawn as a chart scaled to its leader", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  const rows = page.locator(".airport-gate-chart .airport-gate-row");
  await expect(rows.first()).toBeVisible();

  const bars = await page.evaluate(() => Array.from(
    document.querySelectorAll<HTMLElement>(".airport-gate-chart .airport-gate-row"),
  ).map((row) => ({
    flights: Number((row.querySelector("b")?.textContent ?? "").replace(/[^0-9]/g, "")),
    width: row.querySelector<HTMLElement>(".airport-gate-bar")!.getBoundingClientRect().width,
    track: row.getBoundingClientRect().width,
  })));

  expect(bars.length).toBeGreaterThan(1);
  // Rank 01 fills the row; it is the scale everything else is read against.
  expect(bars[0].width / bars[0].track).toBeGreaterThan(0.98);
  // Every bar is proportional to its own count, and never longer than the leader's.
  for (const bar of bars) {
    const expected = bar.flights / bars[0].flights;
    expect(Math.abs(bar.width / bars[0].width - expected)).toBeLessThan(0.03);
  }
  // Ranked descending, so the chart and the numbers can never disagree.
  for (let i = 1; i < bars.length; i += 1) expect(bars[i].flights).toBeLessThanOrEqual(bars[i - 1].flights);

  await expect(page.locator(".airport-gate-chart-note")).toContainText("전체 출발편 중 비중이 아닙니다");
});

/**
 * The chart costs nothing to run.
 *
 * A phone renders this, so the bars must be plain CSS width set at render:
 * no chart library, no post-paint measurement, no second request. If a
 * future change reaches for a canvas or a layout pass, this fails.
 */
/**
 * A charting library is recognised by a PATH SEGMENT, never by a substring.
 *
 * This used to test the whole URL against /chart|d3|.../i, which quietly means
 * "any URL containing the two characters d3 anywhere". Vite stamps every dev
 * module with a dep hash, and on 2026-09-06 CI drew `?v=a2fd3205` — so every
 * one of the sixty framework modules matched, and the guard failed with a wall
 * of vinext URLs and nothing to do with charts. Any edit that reshuffles the
 * bundle can produce such a hash, so this was a trap waiting on a coin flip.
 *
 * Matching a delimiter-bounded token inside a path segment keeps every real
 * import caught — /node_modules/d3/…, chart.umd.js, echarts/index.js — while a
 * hex hash cannot spell one by accident.
 */
const CHART_LIBRARY_TOKENS = new Set([
  "chart", "charts", "chartjs", "d3", "plotly", "echarts", "highcharts",
  "recharts", "apexcharts", "nivo", "victory", "billboard", "amcharts",
]);

function loadsChartLibrary(rawUrl: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl;
  }
  return pathname.toLowerCase().split("/").some((segment) =>
    segment.split(/[.\-_@]/).some((token) => CHART_LIBRARY_TOKENS.has(token)));
}

test("the gate chart adds no script, no library and no request", async ({ page }) => {
  // The matcher itself is worth asserting: it is the reason this guard means
  // anything, and the reason it stopped crying wolf at a dep hash.
  expect(loadsChartLibrary("http://x/node_modules/d3/dist/d3.js")).toBe(true);
  expect(loadsChartLibrary("http://x/node_modules/chart.js/dist/chart.umd.js")).toBe(true);
  expect(loadsChartLibrary("http://x/node_modules/echarts/index.js")).toBe(true);
  expect(loadsChartLibrary("http://x/node_modules/.vite/deps/chunk-CO3PsZeE.js?v=a2fd3205")).toBe(false);
  expect(loadsChartLibrary("http://x/node_modules/vinext/dist/utils/hash.js?v=a2fd3205")).toBe(false);

  const extraRequests: string[] = [];
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  page.on("request", (request) => {
    if (loadsChartLibrary(request.url())) extraRequests.push(request.url());
  });
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(".airport-gate-chart .airport-gate-row").first()).toBeVisible();

  expect(extraRequests, `a charting library was loaded: ${extraRequests.join(", ")}`).toEqual([]);
  // Drawn by CSS width alone — no canvas, no svg, no inline script.
  expect(await page.locator(".airport-gate-chart canvas, .airport-gate-chart svg").count()).toBe(0);
  const widthsAreInline = await page.evaluate(() => Array.from(
    document.querySelectorAll<HTMLElement>(".airport-gate-bar"),
  ).every((bar) => /^\d+(\.\d+)?%$/.test(bar.style.width)));
  expect(widthsAreInline, "each bar's width is a plain percentage set at render").toBe(true);
});

/**
 * 입국 on every date the owner can pick: 오늘 · 과거 · 자료 없는 날.
 *
 * Owner report, 2026-09-07: "입국 정보가 안 보여 오늘 내일 과거 봐도".
 *
 * Production was checked before writing these. Arrival rows are stored
 * exactly like departure rows — 24 aggregate bands per terminal for every
 * date that has any A5 data at all (2026-08-31 … 2026-09-06, T1 and T2) —
 * so there is no arrival-shaped data bug. The screen was blank on 09-07
 * because that DAY has no rows: collection has failed 30 times running
 * since 09-05. The gap was that the screen did not say so.
 */
const arrivalOnlyFixture = (overrides: Record<string, unknown>) => ({
  ...SUMMARY_FIXTURE, ...overrides,
});

test("입국 renders the stored forecast on a past date, not only today", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(arrivalOnlyFixture({
    dayRelation: "PAST",
    serviceDateKst: "2026-08-30",
    // A past day has no "now" band; the day total has to carry the headline.
    generatedAt: "2026-08-31T05:10:00Z",
  })));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator(".airport-context-nav").getByRole("button", { name: "입국", exact: true }).click();

  const brief = page.locator(".airport-arrival-brief");
  await expect(brief).toBeVisible();
  // A past day has no current hour, so the day total is also the only thing
  // that could lead — and it correctly says 선택일, not 금일.
  await expect(brief.locator("h2")).toContainText("선택일 전체 공식 예상 입국객");
  await expect(brief).toContainText("41,300명");
  await expect(brief).not.toContainText("금일 전체");
  await expect(page.locator(".airport-forecast .airport-timeline-bars p")).toHaveCount(2);
  await expect(page.locator(".airport-arrival-terminals")).toContainText("25,700명");
});

/**
 * 출국처럼 — the day's total leads, in bold.
 *
 * The arrival screen opened with the current hour and put the day's figure in
 * a plain list line underneath, while the departure screen next to it led with
 * its day total in bold. The same question got a different answer depending on
 * which tab you were on, and the owner asked for the pair to match.
 */
test("입국 leads with the day's total in bold, above the current hour", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(arrivalOnlyFixture({})));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator(".airport-context-nav").getByRole("button", { name: "입국", exact: true }).click();

  const brief = page.locator(".airport-arrival-brief");
  const heading = brief.locator("h2");
  await expect(heading).toContainText("금일 전체 공식 예상 입국객");
  await expect(heading).toContainText("41,300명");

  // The current hour keeps its own bold line, one step down, directly after.
  const current = brief.locator(".airport-arrival-current");
  await expect(current).toContainText("공식 예상 입국객");
  const weight = await current.evaluate((node) => Number(getComputedStyle(node).fontWeight));
  expect(weight, "the current hour must still read as a headline fact").toBeGreaterThanOrEqual(600);

  // Order and hierarchy, measured rather than assumed.
  const [headingBox, currentBox] = await Promise.all([heading.boundingBox(), current.boundingBox()]);
  expect(headingBox && currentBox && currentBox.y > headingBox.y, "the total sits above the current hour").toBe(true);
  const headingSize = await heading.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  const currentSize = await current.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  expect(headingSize).toBeGreaterThan(currentSize);

  // The total must not also appear as a list line: it moved, it was not copied.
  await expect(brief.locator(".airport-arrival-lines")).not.toContainText("금일 전체 공식 예상 입국객");
});

test("입국 says WHY it is empty when collection is behind, instead of just 확인 불가", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(arrivalOnlyFixture({
    sources: [{ sourceId: "INCHEON_PASSENGER_FORECAST", status: "STALE", retrievedAt: "2026-08-29T13:43:00.000Z" }],
    airport: {
      ...SUMMARY_FIXTURE.airport,
      arrivalForecast: {
        ...SUMMARY_FIXTURE.airport.arrivalForecast,
        todayExpectedPassengersTotal: null,
        todayExpectedPassengersByTerminal: {},
        peakExpectedTimeBand: null,
        peakExpectedTimeBandByTerminal: {},
        passengerForecastTimeline: [],
        passengerForecastTimelineByTerminal: {},
        forecastCoverage: { all: "UNAVAILABLE", byTerminal: { T1: "UNAVAILABLE", T2: "UNAVAILABLE" } },
      },
    },
  })));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator(".airport-context-nav").getByRole("button", { name: "입국", exact: true }).click();

  const brief = page.locator(".airport-arrival-brief");
  await expect(brief).toContainText("수집이 밀려 있습니다");
  await expect(brief).toContainText("공급자가 자료를 내지 않은 것이 아닙니다");
  // The bare label alone would blame the airport for our own outage.
  await expect(brief.locator("h2")).not.toHaveText("확인 불가");
});

/**
 * Stored FLIGHT records are a departure fact. Announcing "저장된 운항 기록
 * 없음" above 입국 described something that screen never shows.
 */
test("the date note above 입국 never reports missing flight records", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(arrivalOnlyFixture({
    dateAvailability: { airportFlights: [], airportPassengerForecast: ["2026-08-31"], seoulObserved: ["2026-08-31"] },
  })));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

  // On 출국 the missing flight record is real and must still be reported.
  await expect(page.locator(".date-scope-note")).toContainText("저장된 운항 기록 없음");

  await page.locator(".airport-context-nav").getByRole("button", { name: "입국", exact: true }).click();
  await expect(page.locator(".date-scope-note")).toHaveCount(0);
});

/**
 * Korean wrapping, measured on the rendered line boxes.
 *
 * The owner photographed "약간 붐" ending a line and "빔" starting the next,
 * and asked for it to be fixed everywhere: "다른것들도 점검해서 이런거없게해".
 *
 * An honest note about what this suite can and cannot prove. Chromium — the
 * only engine Playwright can run here — never splits spaced Korean mid-word,
 * measured across six widths and five word-break/overflow-wrap combinations.
 * The screenshot is an iPhone, and WebKit does apply UAX#14 to Hangul, which
 * is what `word-break: keep-all` exists to stop. So this file CANNOT reproduce
 * the original symptom, and a test that claimed to would be lying.
 *
 * What it does instead is guard the two things that are real here:
 *   · the headline no longer wraps at all at phone widths, which is what
 *     actually removes the symptom on every engine, and
 *   · no line anywhere ends mid-word, which stays true if the suite is ever
 *     run on another engine and catches a genuine regression in Chromium too.
 * The keep-all declaration itself is pinned in tests/rendered-html.test.mjs,
 * where a CSS assertion belongs.
 */
const HANGUL = /[가-힣]/;

async function renderedLines(page: import("@playwright/test").Page, selector: string) {
  return page.evaluate((sel) => {
    const out: { text: string; lines: string[] }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      // Only a single text node can be walked this way: an element built from
      // several children would overrun the range. Those are covered by their
      // own children appearing in the same selector list.
      if (el.childNodes.length !== 1) continue;
      const node = el.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const text = node.textContent ?? "";
      if (!text.trim()) continue;
      const range = document.createRange();
      const lines: string[] = [];
      let start = 0;
      let lastTop: number | null = null;
      for (let i = 1; i <= text.length; i += 1) {
        range.setStart(node, i - 1);
        range.setEnd(node, i);
        const top = Math.round(range.getBoundingClientRect().top);
        if (lastTop !== null && top !== lastTop) { lines.push(text.slice(start, i - 1)); start = i - 1; }
        lastTop = top;
      }
      lines.push(text.slice(start));
      out.push({ text, lines });
    }
    return out;
  }, selector);
}

test("no Korean line ever breaks in the middle of a word", async ({ page }) => {
  // The owner's own numbers. A six-figure population is the longest form this
  // headline takes, and it is what pushed the line over on their phone.
  await page.route("**/api/live/summary*", routeSummary({
    ...SUMMARY_FIXTURE,
    areas: {
      ...SUMMARY_FIXTURE.areas,
      myeongdong: {
        ...SUMMARY_FIXTURE.areas.myeongdong,
        realtime: {
          congestionLevel: 3, congestionLabel: "약간 붐빔",
          populationMin: 100_000, populationMax: 105_000,
          observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE",
        },
      },
    },
  }));

  // The measured text must be long enough that it MUST wrap at these widths,
  // or the assertion passes vacuously — the headline at its new size fits on
  // one line, which is a different guarantee (pinned by the next test).
  const SELECTOR = [
    ".current-brief > strong",
    ".current-brief > p:not(.eyebrow)",
    ".signal-row-value",
    ".commercial-basis",
    ".section-intro",
    ".airport-arrival-brief h2",
    ".airport-arrival-current",
    ".context-environment small",
    ".holiday-context small",
  ].join(", ");

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/ko/myeongdong", "/ko/airport"]) {
      await page.goto(path);
      await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

      const measured = await renderedLines(page, SELECTOR);
      expect(measured.length, `${path} at ${width}px rendered nothing to measure`).toBeGreaterThan(0);

      for (const { text, lines } of measured) {
        for (let i = 0; i < lines.length - 1; i += 1) {
          // A break AT A SPACE is what correct Korean wrapping looks like; the
          // trailing space belongs to the line that ends. Only a break with no
          // space between two Hangul syllables is the defect.
          if (/\s$/.test(lines[i])) continue;
          const endsWith = lines[i].slice(-1);
          const startsWith = lines[i + 1].slice(0, 1);
          expect(
            HANGUL.test(endsWith) && HANGUL.test(startsWith),
            `${path} at ${width}px split a Korean word across lines: "…${lines[i].slice(-8)}" / "${lines[i + 1].slice(0, 8)}…" in "${text.slice(0, 60)}"`,
          ).toBe(false);
        }
      }
    }
  }
});

test("the area headline fits one line on a phone, at the owner's own numbers", async ({ page }) => {
  // 19px wrapped this string at 390px; 17px carries it on one line from 360px
  // up. The size was reduced deliberately — "글자크기를줄여서라도해결해" — and
  // this pins the result so a later size bump cannot quietly undo it.
  await page.route("**/api/live/summary*", routeSummary({
    ...SUMMARY_FIXTURE,
    areas: {
      ...SUMMARY_FIXTURE.areas,
      myeongdong: {
        ...SUMMARY_FIXTURE.areas.myeongdong,
        realtime: {
          congestionLevel: 3, congestionLabel: "약간 붐빔",
          populationMin: 100_000, populationMax: 105_000,
          observedAt: "2026-08-31T14:07:00+09:00", freshness: "LIVE",
        },
      },
    },
  }));

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ko/myeongdong");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

    const [headline] = await renderedLines(page, ".current-brief > strong");
    expect(headline, `no headline at ${width}px`).toBeTruthy();
    expect(headline.text).toContain("100,000–105,000명 · 약간 붐빔");
    expect(headline.lines.length, `the headline wrapped at ${width}px: ${headline.lines.join(" / ")}`).toBe(1);
  }
});

/**
 * The shell font is requested from the head, and only the one the locale uses.
 *
 * A font referenced only by an @font-face `src` is not discoverable until the
 * stylesheet has been downloaded, parsed, and matched against a laid-out
 * element — three serialized steps before the request starts, on a connection
 * where each one costs a round trip. Preloading it removes that chain.
 *
 * The second half of the assertion matters as much as the first: there are six
 * faces totalling 3.3 MB, and preloading them all would push 3.3 MB at a
 * reader who needs 241 KB of it. Exactly one must be preloaded per locale, and
 * it must be the one `--font-ui` actually resolves to.
 */
test("each locale preloads exactly one shell font, and it is its own", async ({ page }) => {
  const EXPECTED: Record<string, string> = {
    ko: "/fonts/koretail-sans-variable.woff2",
    en: "/fonts/koretail-sans-variable.woff2",
    ja: "/fonts/noto-sans-jp-400.woff2",
    zh: "/fonts/noto-sans-sc-400.woff2",
  };

  for (const [locale, expected] of Object.entries(EXPECTED)) {
    const response = await page.goto(`/${locale}`);
    const html = await response!.text();
    const fontPreloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g)].map((match) => match[0]);

    expect(fontPreloads.length, `/${locale} must preload exactly one face, got ${fontPreloads.length}`).toBe(1);
    expect(fontPreloads[0]).toContain(`href="${expected}"`);
    // Fonts are always fetched in CORS mode; without crossorigin the preload
    // is not reused and the file is downloaded twice.
    expect(fontPreloads[0], "a font preload without crossorigin is fetched twice").toContain("crossorigin");
    expect(fontPreloads[0]).toContain('type="font/woff2"');
  }
});
