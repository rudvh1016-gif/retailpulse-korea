import { expect, test } from "@playwright/test";

const locales = [
  ["ko", "ko"],
  ["en", "en"],
  ["zh", "zh-CN"],
  ["ja", "ja"],
] as const;

for (const [locale, htmlLang] of locales) {
  test(`${locale} is server-rendered with the correct document language`, async ({ page }) => {
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", htmlLang);
    await expect(page.locator("h1")).toBeVisible();
  });
}

test("project-local Korean, Japanese and Chinese fonts load", async ({ page }) => {
  await page.goto("/ja");
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 16px "Noto Sans JP Variable"', "日本語 ページ"))).toBe(true);

  await page.goto("/zh");
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 16px "Noto Sans SC Variable"', "简体中文 签到"))).toBe(true);

  await page.goto("/ko");
  await page.evaluate(async () => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('420 16px "Pretendard Variable"', "리테일펄스 특별"))).toBe(true);
});

for (const width of [320, 375, 390, 430]) {
  test(`mobile ${width}px has no page-level horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/ko/airport");
    await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator("nav.bottom-nav")).toBeVisible();
  });
}

test("primary navigation, terminal filter, flight search, back and refresh work", async ({ page }) => {
  await page.goto("/ko");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.locator("nav.bottom-nav a").filter({ hasText: "공항" }).click();
  await expect(page).toHaveURL(/\/ko\/airport$/);
  await page.getByRole("tab", { name: "T2" }).click();
  await page.getByRole("button", { name: "항공편" }).click();
  await page.getByLabel("항공편·도시 검색").fill("KE703");
  await expect(page.getByText("KE703").first()).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
});

test("blocked localStorage does not break the application", async ({ context, page }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  await page.goto("/ja/business");
  await expect(page.locator("h1")).toBeVisible();
});

test("large values and long CJK labels remain contained", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/ja/airport");
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  await page.getByRole("button", { name: "履歴" }).click();
  await expect(page.getByText(/3,364,748/).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goto("/zh/business");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("unknown routes return a useful 404", async ({ page }) => {
  const response = await page.goto("/ko/not-a-real-page");
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).toContainText(/찾지 못|찾을 수|not found|ページ|未找到/i);
});

test("health endpoints degrade without exposing internal errors", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body.app).toBe("ok");
  expect(JSON.stringify(body)).not.toMatch(/stack|serviceKey|token/i);
});
