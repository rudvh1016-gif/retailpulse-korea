import { test, expect } from "@playwright/test";
import { SUMMARY_FIXTURE, routeSummary } from "./summary-fixture";

// Reproduce the owner's late-evening phone screenshot, plus a minute close to
// the next hour and the final band. Never assert only that a label exists.
for (const clock of ["11:57", "21:03", "23:59"]) {
  test(`daily total leads and a full-height minute rule survives terminal switches at ${clock}`, async ({ page }) => {
    const payload = structuredClone(SUMMARY_FIXTURE);
    payload.generatedAt = `2026-08-31T${clock}:00+09:00`;
    const bands = Array.from({ length: 24 }, (_, hour) => ({
      targetStartAt: `2026-08-31T${String(hour).padStart(2, "0")}:00:00+09:00`,
      targetEndAt: hour === 23 ? "2026-09-01T00:00:00+09:00" : `2026-08-31T${String(hour + 1).padStart(2, "0")}:00:00+09:00`,
      expectedPassengers: hour === 23 ? 2 : 660,
    }));
    payload.airport.passengerForecastTimeline = bands;
    payload.airport.passengerForecastTimelineByTerminal = { T1: bands, T2: bands };
    await page.route("**/api/live/summary*", routeSummary(payload));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ko/airport");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");

    for (const [terminal, total] of [["전체", "47,320"], ["T2", "17,220"], ["T1", "30,100"], ["전체", "47,320"]]) {
      await page.getByRole("tab", { name: terminal, exact: true }).click();
      const brief = page.locator(".airport-current-brief");
      await expect(brief.locator("strong").first()).toHaveText(`금일 전체 공식 예상 출국객 ${total}명`);
      await expect(brief.locator("strong").nth(1)).toContainText(`${clock.slice(0, 2)}:00–`);
      await expect(brief).toContainText("전주 동요일 비교 자료 없음");
      await expect(brief).toContainText("출발 운항");
      const style = await brief.locator("strong").first().evaluate(el => ({ weight: getComputedStyle(el).fontWeight, color: getComputedStyle(el).color }));
      expect(Number(style.weight)).toBeGreaterThanOrEqual(600);
      expect(style.color).toBe("rgb(17, 17, 17)");

      const now = page.locator(".airport-timeline-bars p.now");
      await expect(now).toHaveAttribute("data-now-label", `현재 시각 ${clock}`);
      await expect.poll(() => now.evaluate(el => {
        const line = getComputedStyle(el, "::before");
        const label = getComputedStyle(el, "::after");
        const bars = el.parentElement!;
        const box = el.getBoundingClientRect();
        const viewport = bars.getBoundingClientRect();
        const x = box.left + parseFloat(line.left);
        return {
          tall: parseFloat(line.height) >= 110,
          visible: line.display !== "none" && line.visibility === "visible" && Number(line.opacity) > 0,
          dashed: line.borderLeftStyle === "dashed" && parseFloat(line.borderLeftWidth) >= 1,
          dark: line.borderLeftColor === "rgb(17, 17, 17)",
          aligned: Math.abs(parseFloat(label.left) - parseFloat(line.left)) < 1,
          inside: x >= viewport.left && x <= viewport.right,
        };
      })).toEqual({ tall: true, visible: true, dashed: true, dark: true, aligned: true, inside: true });
      const left = await now.evaluate(el => parseFloat(getComputedStyle(el, "::before").left) / el.getBoundingClientRect().width);
      expect(left).toBeCloseTo(Number(clock.slice(3)) / 60, 2);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await page.locator(".airport-timeline-bars p.now").evaluate(el => parseFloat(getComputedStyle(el, "::before").height))).toBeGreaterThan(120);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
