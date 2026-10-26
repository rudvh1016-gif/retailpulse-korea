import { expect, test } from "@playwright/test";

import { routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";
import focusSummary from "./fixtures/airport-focus/summary.json" with { type: "json" };
import focusFlights from "./fixtures/airport-focus/flights.json" with { type: "json" };
import focusMonths from "./fixtures/airport-focus/months.json" with { type: "json" };
import focusPassengers from "./fixtures/airport-focus/passenger-stats.json" with { type: "json" };

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
    // The owner requested a liquid briefing; other normal surfaces stay white.
    if (start.closest(".focus-report")) continue;
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
            // Airport body, including history, is plain white again; no gray canvas exception.
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
  // docs/approvals/glass-navigation-preview-20261013.json; its grey glass
  // base value follows the owner's reference tab bar since 2026-10-14
  // (docs/approvals/mobile-tabbar-reference-20261014.json).
  const nav = page.locator('nav.bottom-nav.glass-nav');
  const indicator = nav.locator(':scope > .glass-nav-indicator');
  await expect(nav).toBeVisible();
  await expect(page.locator('.glass-nav-indicator')).toHaveCount(1);
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveCSS('height', '54px');
  await expect(indicator).toHaveCSS('position', 'absolute');
  // Owner's 2026-10-21 reference restores a translucent grey selected marker.
  await expect(indicator).toHaveCSS('background-color', 'rgba(187, 187, 188, 0.36)');
  await expect(nav.locator('a')).toHaveCount(5);
  const bounds = await nav.boundingBox();
  const marker = await indicator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(marker).not.toBeNull();
  expect(marker!.width).toBeGreaterThan(0);
  expect(marker!.width).toBeLessThanOrEqual((bounds!.width - 8) / 5 + 1);
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
          if (sel === '.glass-nav-indicator' && bg === 'rgba(187, 187, 188, 0.36)' && !filter) continue;
          // Sentinel_83f58d8a31588191869832be4cc5e1c8: only the compact native
          // preparation filter may be translucent. Its bounds and surrounding
          // white surfaces are checked in preparation-calendar.spec.ts.
          if (sel === '.focus-country-filter .preparation-country-glass' && bg === 'rgba(255, 255, 255, 0.76)' && filter === 'blur(12px)') continue;
          // Sentinel_0281f83f4d088191a1eb747bbe647c48: only the complete
          // today/week/month report wrapper. Its bounds and white surroundings
          // are checked in airport-brief-glass.spec.ts.
          if (sel === '.airport-focus-shell .focus-report' && bg === 'rgba(255, 255, 255, 0.4)' && filter === 'blur(14px)') continue;
          // Sentinel_7ae84329dea48191ade277d460d7cd14: only the bounded
          // monthly passenger readout; tooltip/white-body bounds are tested in
          // airport-monthly-line-tooltip.spec.ts, never a chart/card exception.
          if (sel === '.focus-month-tooltip' && bg === 'rgba(255, 255, 255, 0.6)' && filter === 'blur(24px) saturate(1.1)') continue;
          // Only the owner-requested compact country jump; actual bounds and
          // white surrounding canvas are verified below, not a card exemption.
          if (sel === '.airport-focus-shell .focus-country-jump' && bg === 'rgba(255, 255, 255, 0.4)' && filter === 'blur(14px)') continue;
          // Exact owner-requested liquid surfaces only.
          if (['.update-notice[data-airport-focus="true"]','.update-notice[data-airport-focus=true]','.focus-header','.focus-report'].includes(sel)) continue;
          // Owner approval Sentinel_105e48cea9648191a7e7c29e86006ec9: the two guide
          // actions and airport day buttons only, never their containing canvas.
          const neutralAction = /^rgba\(255, 255, 255, 0\.(?:72|9|96)\)$/.test(bg) && !filter;
          const guideAction = sel.split(',').every(part => /^(?:details\.[\w-]*guide[\w-]* > summary\.[\w-]*entry[\w-]*|\.[\w-]*tripEntry[\w-]*)(?::hover|:active)?$/.test(part.trim()));
          const airportDayAction = /^\.app \.airport-view \.date-nav \.date-nav-shortcuts button/.test(sel);
          if (neutralAction && (guideAction || airportDayAction)) continue;
          // Sentinel_59b2d9a80d808191b0c22074b8d744be: the same five controls,
          // exact bottom-nav material; computed equality checked in airport-five-glass.spec.ts.
          const fiveGlass = sel.split(',').every(part => /^(?:details\.[\w-]*guide[\w-]* > summary\.[\w-]*entry[\w-]*:is\(\.[\w-]*entry[\w-]*\)|\.[\w-]*tripEntry[\w-]*:is\(\.[\w-]*tripEntry[\w-]*\)|\.app \.airport-view \.airport-date-reserved \.date-nav \.date-nav-shortcuts > button\[aria-pressed\])$/.test(part.trim()));
          if (fiveGlass && ((bg === 'rgba(255, 255, 255, 0.6)' && ['blur(24px) saturate(1.1)', 'blur(24px) saturate(110%)'].includes(filter)) || (bg === 'rgb(244, 244, 246)' && filter === 'none'))) continue;
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

for (const width of [390, 1440]) {
  test(`country jump glass is a small control on white · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/live/summary*", routeSummary(focusSummary));
    for (const [path, json] of [["flights", focusFlights], ["airport-months", focusMonths], ["airport-passenger-stats", focusPassengers]] as const) {
      await page.route(`**/api/live/${path}*`, route => route.fulfill({ json }));
    }
    await page.route("**/api/live/passenger-reference*", route => route.fulfill({ json: { status: "UNAVAILABLE", data: null } }));
    await page.goto("/ko/airport?date=2026-10-19");
    const jump = page.locator(".airport-focus-shell .focus-country-jump");
    await expect(jump).toHaveCount(1);
    await expect(jump).toBeVisible();
    await expect(jump).toHaveCSS("background-color", "rgba(255, 255, 255, 0.4)");
    await expect(jump).toHaveCSS("backdrop-filter", "blur(14px)");
    await expect(jump).toHaveAttribute("href", "/ko/airport-countries?date=2026-10-19");
    const box = await jump.boundingBox();
    const parent = await jump.locator("..").boundingBox();
    expect(box).not.toBeNull();
    expect(parent).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeLessThanOrEqual(90);
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.width).toBeLessThanOrEqual(Math.min(480, parent!.width));
    expect(box!.x).toBeGreaterThanOrEqual(parent!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(parent!.x + parent!.width + 1);
    for (const selector of ["body", ".airport-focus-shell", ".airport-view"]) {
      const backgrounds = await paintedBackground(page, selector);
      expect(backgrounds.length).toBeGreaterThan(0);
      for (const { colour } of backgrounds) expect(colour, selector).toBe(WHITE);
    }
    // The shared page-wide helper deliberately skips legacy hero descendants.
    // This approved-white model slot needs a direct, non-exempted paint check.
    await expect(page.getByTestId("airport-top-reference")).toHaveCount(0);
    const adjacent = page.locator(".focus-country-jump + *");
    await expect(adjacent).toHaveCount(1);
    const surroundingPaint = await jump.evaluate(node => [node.parentElement, node.nextElementSibling].map(start => {
      for (let current = start; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.backgroundImage !== "none") return `image:${style.backgroundImage}`;
        if (!["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor)) return style.backgroundColor;
      }
      return "unpainted";
    }));
    expect(surroundingPaint).toEqual([WHITE, WHITE]);
    await jump.focus();
    await expect(jump).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
