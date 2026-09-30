import { test, expect } from "@playwright/test";

/**
 * "What is different today" and "days like today" on the live business
 * screen. Read-only. The texts are printed so the run log is the record of
 * what production showed (including "not enough history yet").
 */
const log = (label: string, value: unknown) => console.log(`RADAR ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

for (const width of [360, 1280]) {
  test(`live day comparison at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const reads: string[] = [];
    page.on("request", (request) => { if (/\/api\/live\/(flights|airport-days)/.test(request.url())) reads.push(new URL(request.url()).pathname); });
    await page.setViewportSize({ width, height: width < 500 ? 860 : 1000 });
    await page.goto("/ko/business");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    await page.locator(".business-view .area-tabs").getByRole("tab", { name: "인천공항" }).click();
    const section = page.getByTestId("business-prep").getByTestId("day-radar-section");
    await section.scrollIntoViewIfNeeded();
    const outcome = section.getByTestId("day-radar").or(section.getByTestId("radar-failed")).or(section.getByTestId("radar-no-current"));
    await expect(outcome).toBeVisible({ timeout: 20_000 });
    expect(await section.getByTestId("radar-failed").count(), "the history route answers").toBe(0);
    if (await section.getByTestId("day-radar").count()) {
      log(`${width} items`, await section.getByTestId("radar-items").innerText());
      log(`${width} no-history`, await section.getByTestId("radar-no-history").count() ? await section.getByTestId("radar-no-history").innerText() : "HAS_HISTORY");
      log(`${width} similar`, await section.getByTestId("similar-days").count() ? await section.getByTestId("similar-days").innerText() : await section.getByTestId("similar-none").innerText());
      await expect(section.getByTestId("radar-items")).not.toContainText("고객");
    } else log(`${width} state`, await outcome.innerText());
    log(`${width} reads`, reads);
    expect(reads.filter((path) => path === "/api/live/flights").length).toBeLessThanOrEqual(1);
    expect(reads.filter((path) => path === "/api/live/airport-days").length).toBeLessThanOrEqual(1);
    await section.screenshot({ path: `production-visual-results/day-radar-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    expect(errors).toEqual([]);
  });
}
