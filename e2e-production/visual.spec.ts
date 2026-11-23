import { expect, test } from "@playwright/test";
import {waitForRenderedRoute} from './route-readiness';

import { lookupAirline } from "../lib/airline-country";
import { AIRLINE_REGISTRY } from "../lib/airline-registry";
import { installGuide } from "../lib/install-guide";
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
  "", "/airport", "/business", "/about", "/more",
] as const;
const surfaces = [
  "html", "body", ".app", ".page-shell", ".topbar", ".top-nav", ".bottom-nav",
  ".airport-context-nav", ".hero", ".signal-group", ".terminal-brief-card",
  ".airport-today-grid article", ".airport-detail-section", ".airport-composition",
  ".airport-composition-tabs", ".airport-composition-panel", ".business-pro",
  ".airport-focus-shell", ".airport-focus-shell .glance-preview", ".airport-focus-shell .focus-detail",
];
const registeredCountryCodes = [...new Set(Object.values(AIRLINE_REGISTRY)
  .filter((entry) => lookupAirline(entry.iata)?.country === entry.country)
  .map((entry) => entry.country))].sort();

const paintedBackground = async (page: import("@playwright/test").Page, selector: string) => page.evaluate((sel) => {
  const out: string[] = [];
  for (const start of Array.from(document.querySelectorAll(sel)).slice(0, 4)) {
    // The airport dusk poster band (owner decision 2026-10-02, PR #246) is a figure, not a page surface.
    if (start.closest(".airport-hero")) continue;
    let node: Element | null = start;
    while (node) {
      const style = getComputedStyle(node);
      const bg = style.backgroundColor;
      if (!(bg === "rgba(0, 0, 0, 0)" || bg === "transparent") || style.backgroundImage !== "none") {
        out.push(style.backgroundImage !== "none" ? `image:${style.backgroundImage}` : bg);
        break;
      }
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
      await waitForRenderedRoute(page,path);
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
        // On the airport page the dusk poster band bleeds to the page edge; sample the gutter just above it.
        let gutterY = await page.evaluate(() => {
          const band = document.querySelector(".airport-hero")?.getBoundingClientRect();
          return band && band.top <= 450 && band.bottom >= 450 ? Math.max(90, Math.floor(band.top) - 6) : 450;
        });
        const airportGutter = route === "/airport";
        if (airportGutter) {
          // A fixed (2,450) can intersect a day-pill shadow as controls reflow,
          // including at 768px (CI 39736417657). Use the intro's midpoint,
          // above the action/day controls, at both gutters at every width.
          // It follows heading reflow in every language; no fixed text height, blank-space
          // requirement, material change or colour-based pixel search.
          const geometry = await page.evaluate(() => {
            const intro = document.querySelector(".airport-view > .view-intro")?.getBoundingClientRect();
            if (!intro || intro.height <= 0) {
              throw new Error("Airport intro gutter anchor is missing or hidden");
            }
            return {
              y: Math.floor(intro.top + intro.height / 2),
              viewportHeight: innerHeight,
              scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
              days: Array.from(document.querySelectorAll(".airport-view .airport-date-reserved .date-nav-shortcuts > button"), node => {
                const box = node.getBoundingClientRect();
                return { left: box.left, right: box.right };
              }),
            };
          });
          expect(geometry.scrollWidth, `${locale}${route} horizontal overflow`).toBeLessThanOrEqual(width);
          expect(geometry.days).toHaveLength(3);
          for (const day of geometry.days) {
            expect(day.left).toBeGreaterThanOrEqual(0);
            expect(day.right).toBeLessThanOrEqual(width);
          }
          expect(geometry.y).toBeGreaterThanOrEqual(0);
          expect(geometry.y).toBeLessThan(geometry.viewportHeight);
          gutterY = geometry.y;
        }
        for (const x of airportGutter ? [2, width - 3] : [2]) {
          expect(await samplePixel(page, x, gutterY), `${locale}${route} gutter pixel (${x},${gutterY})`).toEqual([255, 255, 255]);
        }
        const corner = await samplePixel(page, width - 3, 3);
        expect(corner, `${locale}${route} header corner pixel`).toEqual([255, 255, 255]);
        if (width === 390 || width === 1440) {
          await testInfo.attach(`${locale}${route || "-home"}-${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
        }
      }
    });
  }
}

const retiredSeoulPaths = [
  "/myeongdong", "/hongdae", "/seongsu", "/itaewon", "/today", "/where-to",
  "/consumption", "/predictions", "/forecast", "/tourism-desk",
  "/tourism-desk/myeongdong", "/tourism-desk/hongdae",
  "/tourism-desk/seongsu", "/tourism-desk/itaewon",
] as const;

for (const locale of locales) {
  test(`retired Seoul routes preserve the selected date on the airport home · ${locale}`, async ({ request }) => {
    const date = "2026-11-21";
    for (const route of retiredSeoulPaths) {
      const response = await request.get(`/${locale}${route}?date=${date}`, { maxRedirects: 0 });
      expect(response.status(), route).toBe(308);
      const destination = new URL(response.headers().location ?? "", response.url());
      expect(destination.href, route).toBe(new URL(`/${locale}?date=${date}`, response.url()).href);
    }
  });
}

test("public airport navigation makes only reads and Cloudflare analytics requests", async ({ page }) => {
  const requests: { url: string; method: string }[] = [];
  page.on("request", request => requests.push({ url: request.url(), method: request.method() }));
  await openRoute(page, "/ko");
  await openRoute(page, "/ko/airport");
  const origin = new URL(page.url()).origin;
  for (const request of requests) {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) continue;
    expect(request.method).toBe("POST");
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(origin + "/cdn-cgi/rum");
  }
  expect(await page.locator("script[data-cf-beacon], script[src*='beacon.min.js']").count()).toBeLessThanOrEqual(1);
});

for (const [locale, width] of [["ko", 390], ["ko", 1440], ["en", 390], ["zh", 390], ["ja", 390]] as const) {
  test(`production install guide opens and restores keyboard focus · ${locale} · ${width}px`, async ({ page }) => {
    const guide = installGuide(locale);
    await page.setViewportSize({ width, height: 900 });
    await openRoute(page, `/${locale}`);

    const trigger = page.getByRole("button", { name: guide.buttonLabel, exact: true });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await trigger.press("Enter");

    const dialog = page.getByRole("dialog", { name: guide.title, exact: true });
    await expect(dialog).toBeFocused();
    await expect(dialog).toContainText(guide.intro);
    for (const section of guide.sections) {
      await expect(dialog.getByRole("heading", { name: section.heading, exact: true })).toBeVisible();
    }
    if (locale === "ko") await expect(dialog).toContainText("인터넷 연결이 필요합니다");
    expect(await tofuCharacters(dialog)).toEqual([]);

    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: guide.closeLabel, exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
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

    const saved=JSON.stringify({version:1,facilityId:facilities.find(row=>row.terminal==='T1')!.facilityId});
    await page.evaluate(saved=>localStorage.setItem('koretail-my-facility',saved),saved);
    await expect(page.locator('.airport-context-nav button').filter({hasText:airportMyStoreLabels[locale]})).toHaveCount(0);
    await expect(page.locator('.my-store')).toHaveCount(0);
    expect(await page.evaluate(()=>localStorage.getItem('koretail-my-facility'))).toBe(saved);
    expect(await tofuCharacters(directory),`${locale} live directory and provider labels have tofu`).toEqual([]);
    await testInfo.attach(`airport-preserved-facility-${locale}-390.png`,{body:await page.screenshot({fullPage:true,animations:'disabled',caret:'hide'}),contentType:'image/png'});
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
    const tablist = composition.getByRole("tablist", { name: "선택일 출발편 구성 보기" });
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
    await expect(page.locator(".airport-current-brief")).toContainText("출국장 공식 예상 승객");
    const dailyTotal = page.locator(".airport-brief-total");
    if (await dailyTotal.count()) {
      await expect(page.locator(".airport-current-brief strong").first()).toHaveClass("airport-brief-total");
      // 2026-09-14: the arithmetic sum leads and the hall figure moved into the
      // formula below it, so the headline says which of the two it is.
      const formula = page.locator('[data-testid="airport-sum-formula"]');
      if (await formula.count()) {
        await expect(dailyTotal).toHaveAttribute("data-basis", "ARITHMETIC_ONLY");
        await expect(dailyTotal).toContainText("금일 두 예고 수치 단순 합계");
        await expect(formula).toContainText("출국장 예상");
        await expect(formula).toContainText("환승 보안검색 예상");
        await expect(page.locator(".passenger-transfer-limitation").first()).toContainText("전체 출발객 수 아님");
      } else {
        await expect(dailyTotal).toContainText("금일 출국장 공식 예상 승객");
      }
    }
    const figure = page.locator(".airport-flow");
    const now = figure.locator(".airport-flow-now");
    if (await now.count()) {
      const marker = await figure.evaluate((element) => {
        const rule = element.querySelector<SVGLineElement>(".airport-flow-now")!;
        const style = getComputedStyle(rule);
        const box = rule.getBoundingClientRect();
        const frame = element.getBoundingClientRect();
        return {
          height: box.height, strokeWidth: parseFloat(style.strokeWidth), stroke: style.stroke,
          inside: box.left >= frame.left && box.right <= frame.right + 1,
          label: rule.getAttribute("data-now-label"),
          bands: element.querySelectorAll(".airport-flow-band").length,
        };
      });
      expect(marker.inside).toBe(true);
      expect(marker.height).toBeGreaterThan(100);
      expect(marker.strokeWidth).toBeGreaterThanOrEqual(1);
      // Approved flat chart uses the same mint current-time marker as the local E2E contract.
      expect(marker.stroke).toBe("rgb(128, 178, 164)");
      console.log(`AIRPORT_CURRENT_MARKER ${JSON.stringify({ viewport: width, ...marker })}`);
      await testInfo.attach(`airport-marker-${width}.png`, { body: await page.locator(".airport-forecast").screenshot(), contentType: "image/png" });
    }

    await testInfo.attach(`airport-full-${width}.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });
  }
});
