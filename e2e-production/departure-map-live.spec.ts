import { test, expect } from "@playwright/test";
import type { AirportSidesBlock } from "../lib/airport-sides-summary";
import type { FlightsPayload } from "../app/flights-client";

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
    const summaryResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/live/summary" && response.ok());
    await page.goto("/ko/business");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    const summary = await (await summaryResponse).json() as { serviceDateKst: string; airport: { sides?: AirportSidesBlock } };
    await page.locator(".business-view .area-tabs").getByRole("tab", { name: "인천공항" }).click();
    const prep = page.getByTestId("business-prep");
    const sides = prep.getByTestId("airport-sides");
    await expect(sides).toBeVisible();
    expect(flightRequests, "the map reads nothing until it is opened").toEqual([]);

    const flightResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/live/flights" && response.ok());
    await sides.getByTestId("departure-map-section").locator(":scope > summary").click();
    const map = sides.getByTestId("departure-map");
    await expect(map.or(sides.getByTestId("map-failed"))).toBeVisible({ timeout: 20_000 });
    expect(await sides.getByTestId("map-failed").count(), "the flight records load").toBe(0);
    expect(flightRequests.length).toBe(1);
    const response = await flightResponse;
    const flights = await response.json() as FlightsPayload;
    expect(new URL(response.url()).searchParams.get("date"), "map and card use the same service date").toBe(summary.serviceDateKst);
    expect(flights.serviceDateKst).toBe(summary.serviceDateKst);
    expect(flights.truncated, "a complete comparison needs every flight").toBe(false);
    await expect(map).toHaveAttribute("data-window", "0-1440");
    await expect(map).toHaveAttribute("data-filter", "ALL");
    // No physical-building override: both use the terminal grouping. T1's
    // side counts are main-building counts; concourse flights stay separate.
    await expect(map.locator('.terminal-selector button[aria-pressed="true"]')).toHaveCount(0);

    // Whole day: the map's side counts are the comparison card's.
    const counts = await map.getByTestId("map-counts").innerText();
    log(`${width} whole-day counts`, counts);
    log(`${width} lead`, await map.getByTestId("map-lead").innerText());
    const card = sides.getByTestId("flight-split");
    if ((await card.getAttribute("data-state")) === "OK") {
      const cardText = await card.getByTestId("split-flights").innerText();
      log(`${width} card`, cardText);
      const terminal = (await card.locator("h3").innerText()).match(/\b(T1|T2)\b/)?.[1] as "T1" | "T2" | undefined;
      expect(terminal, "the card identifies its terminal").toBeDefined();
      await expect(prep.getByTestId("prep-place")).toContainText(terminal!);
      const gates = summary.airport.sides?.gates;
      expect(gates, "the summary carries the card's flight source").not.toBeNull();
      expect(gates?.date).toBe(summary.serviceDateKst);
      expect(flights.basis).toBe(summary.airport.sides?.gateBasis);
      const sourceCounts = gates!.byArea[terminal!];
      const compared: Record<string, number> = {};
      for (const side of ["EAST", "WEST", "CENTER", "UNVERIFIED"] as const) {
        const value = card.getByTestId("split-flights").locator(`[data-side="${side}"]`);
        await expect(value).toHaveCount(1);
        const label = (await value.locator("dt").innerText()).trim();
        const cardMatch = (await value.locator("dd").innerText()).trim().match(/^([\d,]+)편$/);
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const mapMatch = new RegExp(`${escapedLabel}\\s+([\\d,]+)편`).exec(counts);
        expect(cardMatch, `${side}: the card must show a flight count`).not.toBeNull();
        expect(mapMatch, `${side}: the map must show a flight count`).not.toBeNull();
        const inCard = Number(cardMatch![1].replaceAll(",", ""));
        const inMap = Number(mapMatch![1].replaceAll(",", ""));
        expect(inCard, `${side}: card matches the summary's ${terminal} whole-day count`).toBe(sourceCounts[side]);
        expect(inMap, `${side}: same date, terminal and whole-day map/card counts agree`).toBe(inCard);
        compared[side] = inMap;
      }
      expect(Object.values(compared).reduce((sum, value) => sum + value, 0), "all four groups conserve the terminal total").toBe(sourceCounts.total);
      log(`${width} comparison scope`, { date: summary.serviceDateKst, terminal, window: "0-1440", basis: flights.basis, summaryRetrievedAt: gates!.retrievedAt, flightsRetrievedAt: flights.retrievedAt, counts: compared, total: sourceCounts.total });
    }
    if (await map.getByTestId("map-empty").count()) {
      // Just after midnight KST, before the day's first collection: the designed empty state.
      // Checked before the groups table, which is not rendered on an empty day.
      log(`${width} empty`, await map.getByTestId("map-empty").innerText());
      expect(await map.getByTestId("map-groups").count(), "no destination table without flights").toBe(0);
      expect(errors).toEqual([]);
      return;
    }
    await expect(map.getByTestId("map-groups")).toHaveCount(0);
    await map.getByTestId("map-destinations").locator("summary").click();
    await expect(map.getByTestId("map-groups")).toBeVisible();
    await map.getByTestId("map-official-coordinates").locator("summary").click();
    log(`${width} groups`, (await map.getByTestId("map-groups").innerText()).replace(/\s+/g, " "));
    log(`${width} groups basis`, await map.getByTestId("map-groups-basis").innerText());
    // Concept-model pillars carry the same attribute. Only count the official
    // coordinate drawing so every flight is counted once, plus the unplaced list.
    const drawn = await map.getByTestId("map-official-coordinates").locator("[data-flights]").evaluateAll((nodes) => nodes.reduce((sum, node) => sum + Number(node.getAttribute("data-flights")), 0));
    const listMatch = (await map.getByTestId("map-flights").locator(":scope > summary").innerText()).match(/\(([\d,]+)\)\s*$/);
    expect(listMatch, "the full flight browser identifies its total").not.toBeNull();
    const listed = Number(listMatch![1].replaceAll(",", ""));
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
