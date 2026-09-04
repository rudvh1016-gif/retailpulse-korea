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
