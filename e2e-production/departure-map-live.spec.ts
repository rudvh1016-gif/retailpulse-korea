import { test, expect } from "@playwright/test";

/**
 * The airport departure map on the live business screen, clicked through on
 * a phone and a PC. Read-only; the only storage touched is this browser's own
 * localStorage. Key texts are printed so the run log is the record.
 */
const log = (label: string, value: unknown) => console.log(`MAP ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

for (const width of [360, 1280]) {
  test(`live departure map, clicked through at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const flightRequests: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/live/flights")) flightRequests.push(request.url()); });
    await page.setViewportSize({ width, height: width < 500 ? 860 : 1000 });
    await page.goto("/ko/business");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    await page.locator(".business-view .area-tabs").getByRole("tab", { name: "인천공항" }).click();
    const prep = page.getByTestId("business-prep");
    const sides = prep.getByTestId("airport-sides");
    await expect(sides).toBeVisible();
    expect(flightRequests, "the map reads nothing until it is opened").toEqual([]);

    await sides.getByTestId("departure-map-section").locator("summary").click();
    const map = sides.getByTestId("departure-map");
    await expect(map.or(sides.getByTestId("map-failed"))).toBeVisible({ timeout: 20_000 });
    expect(await sides.getByTestId("map-failed").count(), "the flight records load").toBe(0);
    expect(flightRequests.length).toBe(1);

    // Whole day: the map's side counts are the comparison card's.
    const counts = await map.getByTestId("map-counts").innerText();
    log(`${width} whole-day counts`, counts);
    log(`${width} lead`, await map.getByTestId("map-lead").innerText());
    const card = sides.getByTestId("flight-split");
    if ((await card.getAttribute("data-state")) === "OK") {
      const cardText = await card.getByTestId("split-flights").innerText();
      log(`${width} card`, cardText);
      for (const side of ["동편", "서편", "중앙", "위치 미확인"]) {
        const inCard = new RegExp(`${side} (\\d+)편`).exec(cardText)?.[1];
        const inMap = new RegExp(`${side} (\\d+)편`).exec(counts)?.[1];
        expect(inMap, `${side}: map and card agree`).toBe(inCard);
      }
    }
    if (await map.getByTestId("map-empty").count()) {
      // Just after midnight KST, before the day's first collection: the designed empty state.
      // Checked before the groups table, which is not rendered on an empty day.
      log(`${width} empty`, await map.getByTestId("map-empty").innerText());
      expect(await map.getByTestId("map-groups").count(), "no destination table without flights").toBe(0);
      expect(errors).toEqual([]);
      return;
    }
    log(`${width} groups`, (await map.getByTestId("map-groups").innerText()).replace(/\s+/g, " "));
    log(`${width} groups basis`, await map.getByTestId("map-groups-basis").innerText());
    const drawn = await map.locator("[data-flights]").evaluateAll((nodes) => nodes.reduce((sum, node) => sum + Number(node.getAttribute("data-flights")), 0));
    const listed = Number((await map.getByTestId("map-flights").locator("summary").innerText()).match(/(\d+)\s*$/)?.[1] ?? NaN);
    const unplaced = await map.getByTestId("map-unplaced").count() ? Number((await map.getByTestId("map-unplaced").locator("summary").innerText()).match(/(\d+)\s*$/)?.[1] ?? NaN) : 0;
    log(`${width} drawn/unplaced/listed`, { drawn, unplaced, listed });
    expect(drawn + unplaced, "every listed flight is either drawn or listed apart").toBe(listed);

    // A 3-hour window moves counts, dots and list together.
    await map.getByRole("button", { name: "지금부터 1시간" }).or(map.getByRole("button", { name: "직접 선택" })).first().click();
    log(`${width} window`, await map.getAttribute("data-window"));
    log(`${width} window counts`, await map.getByTestId("map-counts").innerText());
    await page.screenshot({ path: `production-visual-results/departure-map-${width}.png`, fullPage: false });
    await map.screenshot({ path: `production-visual-results/departure-map-block-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    log(`${width} page errors`, errors);
    expect(errors).toEqual([]);
  });
}
