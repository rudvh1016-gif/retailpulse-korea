import { expect, test } from "@playwright/test";

/**
 * Production visual acceptance: PURE WHITE (computed colour AND sampled
 * pixels) and airline-country visibility, on the live site, KO/EN/ZH/JA,
 * five viewports. Screenshots are kept as artifacts for the report.
 */
const WHITE = "rgb(255, 255, 255)";
const locales = ["ko", "en", "zh", "ja"] as const;
const viewports = [390, 430, 768, 1280, 1440, 1920] as const;
const routes = ["", "/myeongdong", "/hongdae", "/seongsu", "/airport", "/business", "/forecast", "/about", "/more"] as const;
const surfaces = ["html", "body", ".app", ".page-shell", ".topbar", ".top-nav", ".bottom-nav", ".airport-context-nav", ".hero", ".signal-group", ".terminal-brief-card", ".airport-today-grid article", ".airport-detail-section", ".airport-composition", ".airport-composition-tabs", ".airport-composition-panel", ".business-pro"];

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
