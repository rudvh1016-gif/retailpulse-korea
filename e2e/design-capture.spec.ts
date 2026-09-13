/**
 * Before/after capture for the 2026-09-13 screen work.
 *
 * Not an assertion suite — a deterministic screenshot harness. Every run
 * serves the SAME fixture payload with the SAME frozen clock, so two runs on
 * two commits differ only by the markup and stylesheet under test. Without
 * that, a "before/after" comparison is really a comparison of two different
 * afternoons of live data.
 *
 * Set RPK_CAPTURE_DIR to choose where the frames land; the two runs then write
 * to sibling directories that can be put side by side. The default lands in
 * the already-ignored test-results tree, so an ordinary `npm run test:e2e`
 * cannot leave 36 throwaway PNGs staged in the repository root.
 */
import { test, expect } from "@playwright/test";
import { routeSummary, SUMMARY_FIXTURE } from "./summary-fixture";

const OUT = process.env.RPK_CAPTURE_DIR ?? "test-results/design-capture";
const locales = ["ko", "en", "zh", "ja"] as const;
const widths = [
  { name: "mobile", width: 390, height: 1400 },
  { name: "desktop", width: 1280, height: 1600 },
] as const;

for (const locale of locales) {
  for (const viewport of widths) {
    test(`capture ${locale} ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.route("**/api/live/summary**", routeSummary(SUMMARY_FIXTURE));

      // Seoul observed/forecast chart.
      await page.goto(`/${locale}/myeongdong`);
      const demand = page.locator('[data-testid="area-demand-card"]').first();
      await expect(demand).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await demand.screenshot({ path: `${OUT}/${locale}-${viewport.name}-seoul-card.png` });
      const flow = demand.locator(".population-flow");
      if (await flow.count()) await flow.screenshot({ path: `${OUT}/${locale}-${viewport.name}-seoul-chart.png` });

      // Airport headline + hourly forecast chart.
      await page.goto(`/${locale}/airport`);
      const brief = page.locator(".airport-current-brief").first();
      await expect(brief).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await brief.screenshot({ path: `${OUT}/${locale}-${viewport.name}-airport-headline.png` });
      await page.screenshot({ path: `${OUT}/${locale}-${viewport.name}-airport-page.png`, fullPage: false });
    });
  }
}
