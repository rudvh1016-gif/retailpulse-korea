import { expect, test } from "@playwright/test";
import { routeSummary, SUMMARY_FIXTURE, FLIGHT_ROWS } from "./summary-fixture";

test("pending airport data says loading; a completed error says retrieval failed", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/live/summary*", async route => { await pending; await route.fulfill({ status: 503, body: "{}" }); });
  await page.goto("/ko/airport");
  await expect(page.getByText("로딩 중, 잠시 기다려주세요.").first()).toBeVisible();
  await expect(page.locator(".airport-unavailable")).toHaveCount(0);
  release();
  await expect(page.getByText("자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.").first()).toBeVisible();
  await expect(page.getByText("로딩 중, 잠시 기다려주세요.")).toHaveCount(0);
});

test("the flight list starts compact and can reveal records beyond the old 80-row wall", async ({ page }) => {
  await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
  await page.route("**/api/live/flights*", routeSummary({ mode: "live-flights", flights: Array.from({ length: 91 }, (_, i) => ({ ...FLIGHT_ROWS[0], flightNumber: `KE${1000 + i}` })) }));
  await page.goto("/ko/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(".airport-current-brief")).toBeVisible();
  await page.locator(".airport-context-nav").getByRole("button", { name: "항공편", exact: true }).click();
  await expect(page.locator(".flight-rows li")).toHaveCount(10);
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "항공편 20개 더 보기" }).click();
  await expect(page.locator(".flight-rows li")).toHaveCount(91);
  await expect(page.locator(".flight-summary")).toContainText("항공사 등록 국가 순위");
});

test("retired Seoul entry: tourism events beyond the first page stay reachable and preserve the preview", async ({ page }) => {
 const langCode = 'ko';
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/tourism-desk/myeongdong`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});
