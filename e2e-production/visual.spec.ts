import { expect, test } from "@playwright/test";

import { lookupAirline } from "../lib/airline-country";
import { AIRLINE_REGISTRY } from "../lib/airline-registry";
import { tofuCharacters } from "../e2e/font-glyphs";

/**
 * Production visual acceptance: PURE WHITE (computed colour AND sampled
 * pixels) and airline-country visibility, on the live site, KO/EN/ZH/JA,
 * six viewports. Screenshots are kept as artifacts for the report.
 */
const WHITE = "rgb(255, 255, 255)";
const locales = ["ko", "en", "zh", "ja"] as const;
const viewports = [390, 430, 768, 1280, 1440, 1920] as const;
const routes = [
  "", "/myeongdong", "/hongdae", "/seongsu", "/airport", "/business", "/forecast",
  "/tourism-desk/myeongdong", "/tourism-desk/hongdae", "/tourism-desk/seongsu", "/about", "/more",
] as const;
const surfaces = [
  "html", "body", ".app", ".page-shell", ".topbar", ".top-nav", ".bottom-nav",
  ".airport-context-nav", ".hero", ".signal-group", ".terminal-brief-card",
  ".airport-today-grid article", ".airport-detail-section", ".airport-composition",
  ".airport-composition-tabs", ".airport-composition-panel", ".business-pro",
  ".tourism-desk", ".tourism-shift-brief", ".tourism-event", ".tourism-subway",
  ".tourism-current-reading", ".tourism-background-item", ".tourism-link-block",
];
const registeredCountryCodes = [...new Set(Object.values(AIRLINE_REGISTRY)
  .filter((entry) => lookupAirline(entry.iata)?.country === entry.country)
  .map((entry) => entry.country))].sort();

const paintedBackground = async (page: import("@playwright/test").Page, selector: string) => page.evaluate((sel) => {
  const out: string[] = [];
  for (const start of Array.from(document.querySelectorAll(sel)).slice(0, 4)) {
    let node: Element | null = start;
    while (node) {
      const style = getComputedStyle(node);
      const bg = style.backgroundColor;
      if (!(bg === "rgba(0, 0, 0, 0)" || bg === "transparent") || style.backgroundImage !== "none") { out.push(style.backgroundImage !== "none" ? `image` : bg); break; }
      node = node.parentElement;
    }
  }
  return out;
}, selector);

/** Samples a screenshot pixel at (x,y) via canvas; returns [r,g,b]. */
async function samplePixel(page: import("@playwright/test").Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, animations: "disabled" });
  // 1×1 PNG: decode in the page to avoid a native dependency.
  const rgb = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }, png.toString("base64"));
  return rgb as [number, number, number];
}


/**
 * Opens a live route and waits for the rendered shell.
 *
 * Deliberately not `networkidle`: the page keeps polling official data, so
 * the network is never idle for 500ms and the wait times out on a page that
 * is in fact fully painted. One retry covers a transient connection close
 * from the edge, which is a transport hiccup rather than a page fault.
 */
async function openRoute(page: import("@playwright/test").Page, path: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main.page-shell")).toBeVisible();
      // Screenshots must contain the local font, not a transient swap face.
      await page.evaluate(async () => { await document.fonts.ready; });
      // Let the first paint settle so a sampled pixel is the final colour.
      await page.waitForTimeout(400);
      return;
    } catch (error) {
      if (attempt >= 1) throw error;
    }
  }
}

for (const locale of locales) {
  for (const width of viewports) {
    test(`production pure white · ${locale} · ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await openRoute(page, `/${locale}${route}`);
        for (const selector of surfaces) {
          for (const colour of await paintedBackground(page, selector)) {
            expect(colour, `${locale}${route} @${width}px ${selector}`).toBe(WHITE);
          }
        }
        // Pixel samples at safe empty positions: page gutter (left edge, mid
        // height) and the top-right corner of the header, never on text.
        const left = await samplePixel(page, 2, 450);
        const corner = await samplePixel(page, width - 3, 3);
        expect(left, `${locale}${route} gutter pixel`).toEqual([255, 255, 255]);
        expect(corner, `${locale}${route} header corner pixel`).toEqual([255, 255, 255]);
        if (width === 390 || width === 1440) {
          await testInfo.attach(`${locale}${route || "-home"}-${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
        }
      }
    });
  }
}

const tourismAreas = [
  {
    id: "myeongdong",
    name: "명동",
    heading: "명동 관광안내",
    station: "명동역 4호선",
    otherStations: ["홍대입구역 2호선", "성수역 2호선"],
  },
  {
    id: "hongdae",
    name: "홍대",
    heading: "홍대 관광안내",
    station: "홍대입구역 2호선",
    otherStations: ["명동역 4호선", "성수역 2호선"],
  },
  {
    id: "seongsu",
    name: "성수",
    heading: "성수 관광안내",
    station: "성수역 2호선",
    otherStations: ["명동역 4호선", "홍대입구역 2호선"],
  },
] as const;

const tourismSectionHeadings = [
  "오늘 근무 브리핑",
  "오늘 안내할 것",
  "교통 흐름 참고",
  "지금 지역 상황",
  "관광 흐름 배경 참고",
  "관광객에게 보여주기",
  "자료 기준과 한계",
] as const;

for (const width of viewports) {
  test(`production Tourism guide workflow · ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });

    const writes: string[] = [];
    page.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });

    // Enter by the navigation a real worker sees at this width.
    await openRoute(page, "/ko/myeongdong");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    if (width > 820) {
      const topNav = page.locator("nav.top-nav");
      await expect(topNav).toBeVisible();
      await topNav.getByRole("link", { name: "관광안내", exact: true }).click();
      await expect(page).toHaveURL(/\/ko\/tourism-desk\/myeongdong$/);
      await expect(topNav.getByRole("link", { name: "관광안내", exact: true })).toHaveAttribute("aria-current", "page");
      await testInfo.attach(`tourism-desktop-nav-${width}.png`, {
        body: await page.locator(".topbar").screenshot({ animations: "disabled", caret: "hide" }),
        contentType: "image/png",
      });
    } else {
      const bottomNav = page.locator("nav.bottom-nav");
      await expect(bottomNav).toBeVisible();
      await expect(bottomNav.locator("a")).toHaveCount(5);
      await bottomNav.getByRole("link", { name: /더보기/ }).click();
      await expect(page).toHaveURL(/\/ko\/more$/);
      await expect(page.locator(".tourism-link-block")).toHaveCount(0);
      await expect(page.locator(".site-usage-guide h2")).toHaveText("누가, 어떻게 쓰면 좋을까요?");
      const tourismLink = page.locator(".footer-links a").filter({ hasText: "관광안내 데스크" });
      await expect(tourismLink).toHaveAttribute("href", "/ko/tourism-desk/myeongdong");
      await testInfo.attach(`tourism-mobile-more-${width}.png`, {
        body: await page.screenshot({ animations: "disabled", caret: "hide" }),
        contentType: "image/png",
      });
      await tourismLink.click();
      await expect(page).toHaveURL(/\/ko\/tourism-desk\/myeongdong$/);
      await expect(bottomNav.getByRole("link", { name: /더보기/ })).toHaveAttribute("aria-current", "location");
    }

    const desk = page.locator(".tourism-desk");
    const sectionHeadings = desk.locator(".tourism-guide-section > .tourism-section-head h2");
    await expect(sectionHeadings).toHaveCount(tourismSectionHeadings.length, { timeout: 30_000 });
    expect(await sectionHeadings.allInnerTexts()).toEqual([...tourismSectionHeadings]);

    // All three links reuse the same module, preserve the locale and swap the
    // exact station scope. Other station names must not leak into the panel.
    for (const area of tourismAreas) {
      const link = desk.locator(".tourism-area-switcher").getByRole("link", { name: area.name, exact: true });
      if (area.id !== "myeongdong") await link.click();
      await expect(page).toHaveURL(new RegExp(`/ko/tourism-desk/${area.id}$`));
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(desk.getByRole("heading", { level: 1, name: area.heading })).toBeVisible();
      const subway = desk.locator(".tourism-subway");
      await expect(subway.getByRole("heading", { level: 3, name: area.station })).toBeVisible();
      for (const otherStation of area.otherStations) await expect(subway).not.toContainText(otherStation);
      expect(await tofuCharacters(desk), `${area.id} @${width}px contains missing-glyph boxes`).toEqual([]);
    }

    await desk.locator(".tourism-area-switcher").getByRole("link", { name: "명동", exact: true }).click();
    await expect(page).toHaveURL(/\/ko\/tourism-desk\/myeongdong$/);
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      switcher: (() => {
        const element = document.querySelector<HTMLElement>(".tourism-area-switcher");
        return element ? element.scrollWidth - element.clientWidth : Infinity;
      })(),
    }));
    expect(overflow.page).toBeLessThanOrEqual(1);
    expect(overflow.switcher).toBeLessThanOrEqual(1);
    await testInfo.attach(`tourism-guide-myeongdong-${width}.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });

    // Visitor Show exists only when the official payload has an eligible
    // event. An empty official result is valid and must never be fabricated.
    const visitorLaunches = desk.locator(".tourism-visitor-launches button");
    if (await visitorLaunches.count()) {
      const before = page.url();
      await visitorLaunches.first().click();
      const visitor = page.locator("dialog.tourism-visitor-show");
      await expect(visitor).toBeVisible();
      const languageButtons = visitor.getByRole("group", { name: "표시 언어" }).getByRole("button");
      await expect(languageButtons).toHaveCount(4);
      for (const locale of ["ko", "en", "zh", "ja"] as const) {
        await visitor.locator(`button[lang="${locale}"]`).click();
        await expect(visitor).toHaveAttribute("lang", locale);
        expect(await tofuCharacters(visitor),
          `Visitor Show ${locale} @${width}px contains missing-glyph boxes`).toEqual([]);
      }
      await visitor.getByRole("button", { name: "English", exact: true }).click();
      await expect(visitor.locator("dd[lang='ko']").first()).not.toBeEmpty();
      expect(page.url()).toBe(before);

      const scriptFonts = await visitor.evaluate((element) => {
        const fontOf = (lang: string) => getComputedStyle(element.querySelector<HTMLElement>(`button[lang="${lang}"]`)!).fontFamily;
        return { zh: fontOf("zh"), ja: fontOf("ja") };
      });
      expect(scriptFonts.zh).toContain("Noto Sans SC Variable");
      expect(scriptFonts.ja).toContain("Noto Sans JP Variable");

      const visitorOverflow = await visitor.evaluate((element) => ({
        dialog: element.scrollWidth - element.clientWidth,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(visitorOverflow.dialog).toBeLessThanOrEqual(1);
      expect(visitorOverflow.page).toBeLessThanOrEqual(1);
      await testInfo.attach(`tourism-visitor-show-${width}.png`, {
        body: await page.screenshot({ animations: "disabled", caret: "hide" }),
        contentType: "image/png",
      });
      await visitor.locator(".tourism-visitor-show-close").click();
      await expect(visitor).toBeHidden();
      expect(page.url()).toBe(before);
    }

    // PWA guidance remains reachable from Tourism without invoking install.
    await page.locator(".topbar .install-app-button").click();
    const install = page.locator(".install-modal");
    await expect(install).toBeVisible();
    await expect(install).toContainText("플레이스토어나 앱스토어에서 내려받는 앱은 아니며");
    await expect(install).toContainText("인터넷 연결이 필요합니다");
    await expect(install.locator(".install-section h3")).toHaveCount(6);
    expect(await tofuCharacters(install), `PWA install guide @${width}px contains missing-glyph boxes`).toEqual([]);
    await testInfo.attach(`pwa-install-guide-${width}.png`, {
      body: await page.screenshot({ animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });
    await install.locator(":scope > button:last-child").click();
    await expect(install).toHaveCount(0);

    expect(writes, "visual acceptance must not issue provider or application writes").toEqual([]);
  });
}

type ProductionFacilityFontRow = {
  facilityId: string;
  terminal: string | null;
  nameKo: string | null;
  nameEn: string | null;
  nameZh: string | null;
  nameJa: string | null;
  facilityItem: string | null;
  largeCategory: string | null;
  mediumCategory: string | null;
  smallCategory: string | null;
  floor: string | null;
  locationRaw: string | null;
  locationEn: string | null;
  businessHoursRaw: string | null;
  goodsBrands: string | null;
};

const airportStoreLabels = { ko: "매장·시설", en: "STORES", zh: "店铺·设施", ja: "店舗・施設" } as const;
const airportMyStoreLabels = { ko: "내 매장", en: "MY STORE", zh: "我的店铺", ja: "自分の店舗" } as const;

test("production Airport provider and registry text has complete four-language glyph coverage", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await openRoute(page, "/ko/airport");

  const facilities = await page.evaluate(async (terminals) => {
    const rows: ProductionFacilityFontRow[] = [];
    for (const terminal of terminals) {
      for (let offset = 0; ; offset += 120) {
        const response = await fetch(`/api/airport/facilities?terminal=${terminal}&limit=120&offset=${offset}`);
        if (!response.ok) throw new Error(`facility HTTP ${response.status} for ${terminal}/${offset}`);
        const payload = await response.json() as {
          mode: string;
          facilities: ProductionFacilityFontRow[];
          hasMore: boolean;
        };
        if (payload.mode !== "airport-facilities") throw new Error(`facility data degraded for ${terminal}/${offset}`);
        rows.push(...payload.facilities);
        if (!payload.hasMore) break;
      }
    }
    return [...new Map(rows.map((row) => [row.facilityId, row])).values()];
  }, ["T1", "T2", "CONCOURSE", "T1_TRANSPORT", "T2_TRANSPORT"]);
  expect(facilities.length, "the official directory corpus should not silently collapse").toBeGreaterThanOrEqual(1_200);

  for (const locale of locales) {
    await openRoute(page, `/${locale}/airport`);
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

    await page.evaluate(({ rows, locale: activeLocale, countryCodes }) => {
      document.getElementById("production-provider-font-audit")?.remove();
      const root = document.createElement("section");
      root.id = "production-provider-font-audit";
      root.setAttribute("aria-hidden", "true");
      Object.assign(root.style, {
        position: "absolute",
        left: "-100000px",
        top: "0",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
      });

      const groups = new Map<string, Set<string>>();
      const add = (language: string, text: string | null) => {
        if (!text) return;
        const values = groups.get(language) ?? new Set<string>();
        values.add(text.replaceAll("∙", "·"));
        groups.set(language, values);
      };
      for (const row of rows) {
        add("ko", row.nameKo);
        add("en", row.nameEn);
        add("zh", row.nameZh);
        add("ja", row.nameJa);
        for (const key of ["facilityItem", "largeCategory", "mediumCategory", "smallCategory", "floor", "locationRaw", "businessHoursRaw", "goodsBrands"] as const) add("ko", row[key]);
        add("en", row.locationEn);
      }
      for (const [language, values] of groups) {
        for (const weight of [400, 600]) {
          const span = document.createElement("span");
          span.className = "airport-provider-text";
          span.lang = language;
          span.style.fontWeight = String(weight);
          span.textContent = [...values].join("\n");
          root.append(span);
        }
      }

      const localeName = { ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" }[activeLocale];
      const displayNames = new Intl.DisplayNames([localeName], { type: "region", style: "short", fallback: "code" });
      for (const weight of [400, 600]) {
        const span = document.createElement("span");
        span.lang = activeLocale;
        span.style.fontWeight = String(weight);
        span.textContent = countryCodes.map((code) => displayNames.of(code) ?? code).join("\n");
        root.append(span);
      }
      document.querySelector(".app")?.append(root);
    }, { rows: facilities, locale, countryCodes: registeredCountryCodes });

    const audit = page.locator("#production-provider-font-audit");
    await expect(audit).toHaveCount(1);
    expect(await tofuCharacters(audit), `${locale} current provider/registry corpus has tofu`).toEqual([]);
    await audit.evaluate((element) => element.remove());

    await page.locator(".airport-context-nav button").filter({ hasText: airportStoreLabels[locale] }).click();
    const directory = page.locator(".airport-facilities");
    await expect(directory.locator(".facility-card").first()).toBeVisible({ timeout: 30_000 });
    expect(await tofuCharacters(directory), `${locale} live facility directory has tofu`).toEqual([]);
    await testInfo.attach(`airport-facilities-${locale}-390.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });

    await page.evaluate(() => localStorage.removeItem("koretail-my-facility"));
    await page.locator(".airport-context-nav button").filter({ hasText: airportMyStoreLabels[locale] }).click();
    const searchable = facilities.find((row) => row.terminal === "T1" && row.nameKo && [...row.nameKo].length >= 2);
    expect(searchable?.nameKo).toBeTruthy();
    await page.locator(".my-store input[type='search']").fill(searchable!.nameKo!);
    const result = page.locator(".my-store-results button").first();
    await expect(result).toBeVisible({ timeout: 30_000 });
    await result.click();
    const selectedStore = page.locator(".my-store-brief");
    await expect(selectedStore).toBeVisible({ timeout: 30_000 });
    expect(await tofuCharacters(selectedStore), `${locale} live selected-store briefing has tofu`).toEqual([]);
    await testInfo.attach(`airport-selected-store-${locale}-390.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });
  }
});

test("production airport composition is one compact tabbed module at every required viewport", async ({ page }, testInfo) => {
  const views = [
    ["gates", "게이트"],
    ["airlines", "항공사"],
    ["countries", "등록 국가"],
  ] as const;

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 1000 });
    await openRoute(page, "/ko/airport");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    await page.locator(".terminal-selector").getByRole("tab", { name: "T2", exact: true }).click();

    const composition = page.locator(".airport-composition");
    const tablist = composition.getByRole("tablist", { name: "오늘 출발편 구성 보기" });
    await expect(tablist.getByRole("tab")).toHaveCount(3);
    await expect(composition.locator(".airport-composition-scope")).toContainText("제2터미널");
    expect((await composition.innerText()).match(/제2터미널/g)?.length ?? 0).toBe(1);
    await expect(composition.locator(".eyebrow, .airport-jump-link")).toHaveCount(0);

    for (const [key, label] of views) {
      const tab = tablist.getByRole("tab", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      const panel = composition.locator('[role="tabpanel"]');
      await expect(panel).toBeVisible();
      expect((await panel.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(862);
      await testInfo.attach(`airport-composition-${key}-${width}.png`, {
        body: await composition.screenshot({ animations: "disabled", caret: "hide" }),
        contentType: "image/png",
      });
    }

    await tablist.getByRole("tab", { name: "등록 국가", exact: true }).click();
    const countries = composition.locator(".airport-countries");
    await expect(countries.locator(".airport-country-row, .airport-empty-line").first()).toBeVisible();
    await expect(countries).toContainText("항공사 등록 국가별 운항편");
    await expect(countries).not.toContainText("승객 국적별");
    await expect(countries).toContainText("승객의 국적이 아닙니다");
    await expect(countries).toContainText("OpenFlights");

    // #130 remains true while the new module changes view.
    await expect(page.locator(".airport-current-brief")).toContainText("공식 예상 출국객");
    const bars = page.locator(".airport-timeline-bars");
    const now = bars.locator("p.now");
    if (await now.count()) {
      const inView = await bars.evaluate((element) => {
        const current = element.querySelector<HTMLElement>("p.now");
        if (!current) return false;
        const left = current.offsetLeft - element.scrollLeft;
        return left >= 0 && left + current.clientWidth <= element.clientWidth + 1;
      });
      expect(inView).toBe(true);
    }

    await testInfo.attach(`airport-full-${width}.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });
  }
});
