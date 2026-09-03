import { expect, test } from "@playwright/test";

/**
 * Production visual acceptance: PURE WHITE (computed colour AND sampled
 * pixels) and airline-country visibility, on the live site, KO/EN/ZH/JA,
 * five viewports. Screenshots are kept as artifacts for the report.
 */
const WHITE = "rgb(255, 255, 255)";
const locales = ["ko", "en", "zh", "ja"] as const;
const viewports = [390, 768, 1280, 1440, 1920] as const;
const routes = ["", "/myeongdong", "/hongdae", "/seongsu", "/airport", "/business", "/forecast", "/about", "/more"] as const;
const surfaces = ["html", "body", ".app", ".page-shell", ".topbar", ".top-nav", ".bottom-nav", ".airport-context-nav", ".hero", ".signal-group", ".terminal-brief-card", ".airport-today-grid article", ".airport-detail-section", ".business-pro"];

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

test("production airport page: gate → airline ranking → country roll-up, with provenance", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openRoute(page, "/ko/airport");
  const gates = page.locator(".airport-gates");
  const airlines = page.locator(".airport-airlines");
  await expect(gates).toBeVisible();
  await expect(airlines).toBeVisible();
  const gateTop = (await gates.boundingBox())!.y;
  const airlineTop = (await airlines.boundingBox())!.y;
  expect(gateTop).toBeLessThan(airlineTop);
  await expect(airlines).toContainText("항공사별 운항 순위");
  const summary = await page.evaluate(async () => {
    const res = await fetch("/api/live/summary");
    const json = await res.json();
    const r = json.airport?.airlineRanking;
    return {
      serviceDate: json.serviceDateKst,
      departures: json.airport?.departuresTrackedToday ?? null,
      all: r?.all ? { total: r.all.totalFlights, airlines: r.all.airlines.length, verified: r.all.airlines.filter((a: { country: string | null }) => a.country).length, unverified: r.all.airlines.filter((a: { country: string | null }) => !a.country).length, countries: r.all.countries.length } : null,
      terminals: r?.byTerminal ? Object.fromEntries(Object.entries(r.byTerminal).map(([k, v]) => [k, (v as { airlines: unknown[]; countries: unknown[] }).airlines.length + "/" + (v as { countries: unknown[] }).countries.length])) : null,
      source: r?.countrySource ?? null,
    };
  });
  const summaryJson = JSON.stringify(summary, null, 2);
  console.log(`AIRLINE_RANKING_SUMMARY ${summaryJson}`);
  await testInfo.attach("airline-ranking-summary.json", { body: summaryJson, contentType: "application/json" });
  if (summary.all && summary.all.airlines > 0) {
    await expect(airlines.locator(".airport-airline-row").first()).toBeVisible();
    await expect(airlines).toContainText("국적별 운항편");
    await expect(airlines).toContainText("OpenFlights");
    for (const terminal of ["T1", "T2"]) {
      await page.locator(".terminal-selector button").filter({ hasText: new RegExp(`^${terminal}$`) }).click();
      await expect(airlines.locator(".airport-airline-row, .airport-empty-line").first()).toBeVisible();
      await testInfo.attach(`airport-${terminal}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }
  } else {
    await expect(airlines.locator(".airport-empty-line")).toBeVisible();
  }
  await testInfo.attach("airport-all.png", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
