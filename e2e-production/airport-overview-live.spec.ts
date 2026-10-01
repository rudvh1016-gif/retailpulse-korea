import { test, expect } from "@playwright/test";

/**
 * The Airport page's Departures tab on the live site, at a phone and a PC
 * width. Read-only. Prints what a reader sees so the run log is the record.
 */
const log = (label: string, value: unknown) => console.log(`LIVE ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

for (const width of [360, 1280]) {
  test(`airport page departures tab at ${width}px`, async ({ page }) => {
    test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const reads: string[] = [];
    page.on("request", (request) => { if (/\/api\/live\/(flights|airport-days)/.test(request.url())) reads.push(new URL(request.url()).pathname); });
    await page.setViewportSize({ width, height: width < 500 ? 860 : 1000 });
    await page.goto("/ko/airport");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    const jump = page.getByTestId("overview-jump");
    log(`${width} jump link`, (await jump.count()) ? await jump.innerText() : "MISSING");
    const overview = page.getByTestId("airport-departure-overview");
    await overview.scrollIntoViewIfNeeded();
    await expect(overview).toBeVisible();
    for (const terminal of ["T1", "T2"]) {
      const block = overview.getByTestId(`overview-${terminal}`);
      await expect(block.getByTestId("flight-split")).toBeVisible({ timeout: 20_000 });
      log(`${width} ${terminal} split`, await block.getByTestId("split-flights").innerText().catch(() => "n/a"));
      await expect(block.getByTestId("departure-map").or(block.getByTestId("map-failed"))).toBeVisible({ timeout: 20_000 });
      log(`${width} ${terminal} counts`, await block.getByTestId("map-counts").innerText().catch(() => "n/a"));
      log(`${width} ${terminal} groups`, (await block.getByTestId("map-groups").innerText().catch(() => "n/a")).replace(/\s+/g, " "));
      const radar = block.getByTestId("day-radar-section");
      await radar.scrollIntoViewIfNeeded();
      const outcome = radar.getByTestId("day-radar").or(radar.getByTestId("radar-failed")).or(radar.getByTestId("radar-no-current"));
      await expect(outcome).toBeVisible({ timeout: 20_000 });
      log(`${width} ${terminal} radar`, (await radar.innerText()).replace(/\s+/g, " ").slice(0, 700));
    }
    log(`${width} reads`, reads);
    await overview.screenshot({ path: `production-visual-results/airport-overview-${width}.png` });
    // The month chart: a one-day bar is never a block.
    const bars = page.locator(".airport-month-bar");
    const barCount = await bars.count();
    if (barCount) {
      await bars.first().scrollIntoViewIfNeeded();
      const [bar, plot] = await Promise.all([bars.first().boundingBox(), page.locator(".airport-month-plot").boundingBox()]);
      log(`${width} month chart`, { bars: barCount, barWidth: bar?.width, plotWidth: plot?.width });
      if (barCount === 1 && bar && plot) expect(bar.width).toBeLessThanOrEqual(plot.width * 0.05);
      await page.locator(".airport-month-chart").screenshot({ path: `production-visual-results/month-chart-${width}.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    expect(errors).toEqual([]);
  });
}
