import { expect, test } from "@playwright/test";

import { routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";

/**
 * PURE WHITE regression. The owner's hard requirement: every normal large
 * surface is #FFFFFF — not warm white, not cream, not translucent white over
 * something else. Computed `background-color` is checked on the real
 * rendered elements; an element that is transparent inherits the check from
 * the first painted ancestor, which must itself be pure white.
 */
const WHITE = "rgb(255, 255, 255)";
const locales = ["ko", "en", "zh", "ja"] as const;
const viewports = [390, 430, 768, 1280, 1440, 1920] as const;
const routes = [
  "", "/myeongdong", "/hongdae", "/seongsu", "/airport", "/business", "/forecast",
  "/tourism-desk/myeongdong", "/tourism-desk/hongdae", "/tourism-desk/seongsu", "/about", "/more",
] as const;
const surfaces = [
  "html", "body", ".app", ".page-shell", ".topbar", ".top-nav", ".bottom-nav", ".airport-context-nav",
  ".hero", ".home-area-briefs", ".home-area-brief-rows button", ".signal-group", ".signal-row",
  ".commercial-signal-card", ".store-dynamics-card", ".event-card > article", ".terminal-brief-card",
  ".airport-today-grid article", ".airport-detail-section", ".airport-airlines", ".business-pro",
  ".modal", "details", "select", "input",
];

/** Walks up from the element until a painted background is found; returns that colour. */
const paintedBackground = async (page: import("@playwright/test").Page, selector: string) => page.evaluate((sel) => {
  const results: { colour: string; compactDate: boolean }[] = [];
  for (const start of Array.from(document.querySelectorAll(sel)).slice(0, 6)) {
    // The airport sky panel (owner decision 2026-10-02) is a figure, not a page surface.
    if (start.closest(".airport-hero")) continue;
    let node: Element | null = start;
    while (node) {
      const style = getComputedStyle(node);
      const bg = style.backgroundColor;
      const transparent = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
      if (!transparent || style.backgroundImage !== "none") {
        results.push({ colour: style.backgroundImage !== "none" ? `image:${style.backgroundImage.slice(0, 40)}` : bg, compactDate: start.matches('.glance-controls > .glance-date-control > input[type="date"][name="airport-date"]') });
        break;
      }
      node = node.parentElement;
    }
    if (!node) results.push({ colour: "unpainted", compactDate: false });
  }
  return results;
}, selector);

for (const locale of locales) {
  for (const width of viewports) {
    test(`pure white · ${locale} · ${width}px`, async ({ page }) => {
      await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await page.goto(`/${locale}${route}`);
        await expect(page.locator("main.page-shell")).toBeVisible();
        for (const selector of surfaces) {
          const found = await paintedBackground(page, selector);
          for (const { colour, compactDate } of found) {
            // Owner approval Sentinel_f30294521f9c8191ba81a4d739722130: only the compact native date surface is neutral
            expect(colour, `${locale}${route} @${width}px ${selector}`).toBe(compactDate ? "rgb(241, 243, 246)" : WHITE);
            if (compactDate) {
              const dateInput = page.locator('.glance-controls > .glance-date-control > input[type="date"][name="airport-date"]');
              await expect(dateInput).toHaveCSS("border-radius", "14px");
              await expect(dateInput).toHaveCSS("min-height", "44px");
              await expect(dateInput).toHaveCSS("width", "148px");
            }
          }
        }
      }
    });
  }
}

test("no large tinted or translucent surface is declared in the stylesheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto("/ko");
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  // Owner-approved glass-navigation preview: this is one small selection
  // marker inside the bottom nav, not a translucent page/card surface
  // docs/approvals/glass-navigation-preview-20261013.json
  const nav = page.locator('nav.bottom-nav.glass-nav');
  const indicator = nav.locator(':scope > .glass-nav-indicator');
  await expect(nav).toBeVisible();
  await expect(page.locator('.glass-nav-indicator')).toHaveCount(1);
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveCSS('height', '54px');
  await expect(indicator).toHaveCSS('position', 'absolute');
  await expect(indicator).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.64)');
  await expect(nav.locator('a')).toHaveCount(6);
  const bounds = await nav.boundingBox();
  const marker = await indicator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(marker).not.toBeNull();
  expect(marker!.width).toBeGreaterThan(0);
  expect(marker!.width).toBeLessThanOrEqual((bounds!.width - 8) / 6 + 1);
  expect(marker!.height).toBe(54);
  expect(marker!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(marker!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(marker!.x + marker!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(marker!.y + marker!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  const offenders = await page.evaluate(() => {
    const bad: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list: CSSRuleList) => {
        for (const rule of Array.from(list)) {
          if (rule instanceof CSSMediaRule) { walk(rule.cssRules); continue; }
          if (!(rule instanceof CSSStyleRule)) continue;
          const bg = rule.style.getPropertyValue("background-color") || rule.style.getPropertyValue("background");
          const filter = rule.style.getPropertyValue("backdrop-filter");
          const sel = rule.selectorText;
          // Exact approved marker/value only, bounded in the browser above
          if (sel === '.glass-nav-indicator' && bg === 'rgba(255, 255, 255, 0.64)' && !filter) continue;
          // Semantic exceptions: modal scrim, chart bars, tab underlines, accent lines.
          const semantic = /modal-backdrop|-bars i|::after|::before|\bi\b|button\.active|\.compare-bars|\.history-bars|\.av-|\.airport-flow|\.airport-hero/.test(sel);
          if (semantic) continue;
          if (/rgba\(255, ?255, ?255, ?0?\.\d+\)/.test(bg)) bad.push(`${sel} → ${bg}`);
          if (filter && filter !== "none") bad.push(`${sel} → backdrop-filter ${filter}`);
          if (/#f[0-9a-e][0-9a-f]{4}\b|#f[0-9a-e]{2}\b|beige|cream|ivory|wheat|linen|#faf|#fdf|#fef/i.test(bg)) bad.push(`${sel} → ${bg}`);
        }
      };
      walk(rules);
    }
    return bad;
  });
  expect(offenders).toEqual([]);
});
