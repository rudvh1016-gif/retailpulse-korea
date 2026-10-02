import { test, expect } from "@playwright/test";
import { SUMMARY_FIXTURE, routeSummary } from "./summary-fixture";

// Reproduce the owner's late-evening phone screenshot, plus a minute close to
// the next hour and the final band. Never assert only that a label exists:
// the rule has to stand at the right minute, inside the figure, on a phone.
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

    const [hours, minutes] = clock.split(":").map(Number);
    for (const [terminal, total] of [["전체", "47,320"], ["T2", "17,220"], ["T1", "30,100"], ["전체", "47,320"]]) {
      await page.getByRole("tab", { name: terminal, exact: true }).click();
      const brief = page.locator(".airport-current-brief");
      // The number counts up when it arrives; the assertion retries until it settles.
      await expect(brief.locator("strong").first()).toHaveText(`금일 출국장 공식 예상 승객 ${total}명`);
      // 현재 시간대는 한눈에 보기 줄의 첫 칸이다. 예전에는 요약의 두 번째
      // <strong> 이었는데, 그 줄이 바로 위 칸을 그대로 반복하고 있어 없앴다.
      await expect(brief.locator(".airport-glance-strip > div").first()).toContainText(`${clock.slice(0, 2)}:00–`);
      await expect(brief.locator(".airport-glance-strip")).toContainText("비교 자료 없음");
      await expect(brief).toContainText("출발 운항");
      const style = await brief.locator("strong").first().evaluate(el => ({ weight: getComputedStyle(el).fontWeight, color: getComputedStyle(el).color }));
      expect(Number(style.weight)).toBeGreaterThanOrEqual(600);
      expect(style.color).toBe("rgb(17, 17, 17)");
      // The one big number: at least 34px on the airport page.
      expect(await brief.locator(".airport-metric-value").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(34);

      const now = page.locator(".airport-flow .airport-flow-now");
      await expect(now).toHaveAttribute("data-now-label", `현재 시각 ${clock}`);
      await expect(page.locator(".airport-flow .airport-flow-now-label")).toHaveText(`현재 시각 ${clock}`);
      await expect.poll(() => now.evaluate(el => {
        const style = getComputedStyle(el);
        const svg = el.closest("svg")!;
        const figure = el.closest("figure")!;
        const box = el.getBoundingClientRect();
        const frame = figure.getBoundingClientRect();
        const label = svg.querySelector<SVGTextElement>(".airport-flow-now-label")!.getBoundingClientRect();
        return {
          tall: box.height >= 110,
          visible: style.display !== "none" && style.visibility === "visible" && Number(style.opacity) === 1,
          // A real stroke, not a border on an empty box (the shape WebKit —
          // every browser on iOS — declined to paint on the owner's phone).
          stroked: parseFloat(style.strokeWidth) >= 1 && style.stroke === "rgb(75, 107, 158)",
          inside: box.left >= frame.left && box.right <= frame.right,
          labelInside: label.left >= frame.left - 1 && label.right <= frame.right + 1,
        };
      })).toEqual({ tall: true, visible: true, stroked: true, inside: true, labelInside: true });
      // The rule stands at the exact minute of a 24-hour axis.
      const fraction = await now.evaluate(el => {
        const svg = el.closest("svg")!;
        const left = Number(svg.getAttribute("data-day-left")), width = Number(svg.getAttribute("data-day-width"));
        return (Number(el.getAttribute("x1")) - left) / width;
      });
      expect(fraction).toBeCloseTo((hours + minutes / 60) / 24, 3);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => page.locator(".airport-flow .airport-flow-now").evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(120);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
