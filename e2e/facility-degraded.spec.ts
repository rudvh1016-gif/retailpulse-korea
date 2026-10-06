import { test, expect } from "@playwright/test";
import { SUMMARY_FIXTURE, routeSummary } from "./summary-fixture";

// The facility routes answer a failed database read with HTTP 200 and
// mode "degraded" on purpose, so a failure is never dressed up as an empty
// terminal. The screen must say "could not load", never "nothing matches".
const FAILED = "공식 시설 정보를 지금 불러오지 못했습니다";
const EMPTY = "해당하는 공식 시설 정보가 없습니다";

test("a degraded directory answer is shown as a failed load, not as no results", async ({ page }) => {
  await page.route("**/api/airport/facilities*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ mode: "degraded", facilities: [], hasMore: false }) }));
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport?audience=staff");
  await expect(page.locator(".app[data-hydrated='true']")).toBeVisible();
  await page.locator(".airport-context-nav button").filter({ hasText: "매장·시설" }).click();
  const directory = page.locator(".airport-facilities");
  await expect(directory.getByTestId("facility-load-failed")).toContainText(FAILED);
  await expect(directory).not.toContainText(EMPTY);
  await expect(directory.locator(".official-label")).toHaveCount(0);
});

test("a network error and a 500 are failed loads too", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/airport/facilities*", (route) => (++calls === 1 ? route.abort() : route.fulfill({ status: 500, contentType: "application/json", body: "{}" })));
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport?audience=staff");
  await expect(page.locator(".app[data-hydrated='true']")).toBeVisible();
  await page.locator(".airport-context-nav button").filter({ hasText: "매장·시설" }).click();
  const directory = page.locator(".airport-facilities");
  await expect(directory.getByTestId("facility-load-failed")).toBeVisible();
  await directory.locator(".facility-filter-row button").filter({ hasText: "약국" }).click();
  await expect(directory.getByTestId("facility-load-failed")).toBeVisible();
  await expect(directory).not.toContainText(EMPTY);
});

test("a real empty answer is still 'no match'", async ({ page }) => {
  await page.route("**/api/airport/facilities*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ mode: "airport-facilities", facilities: [], hasMore: false }) }));
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.goto("/ko/airport?audience=staff");
  await expect(page.locator(".app[data-hydrated='true']")).toBeVisible();
  await page.locator(".airport-context-nav button").filter({ hasText: "매장·시설" }).click();
  const directory = page.locator(".airport-facilities");
  await expect(directory).toContainText(EMPTY);
  await expect(directory.getByTestId("facility-load-failed")).toHaveCount(0);
});
