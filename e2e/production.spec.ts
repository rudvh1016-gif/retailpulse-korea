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
    await expect(page.locator(".brand")).toContainText("KORETAIL");
    await expect(page.locator(".brand")).not.toContainText(/RetailPulse/i);
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
    await expect(page.locator(".brand")).toContainText("KORETAIL");
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

test("sample demand and airport unavailable states are explicit and accessible", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko");
  await expect(page.getByText("예시 수요지수", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/확률이나 실시간 수요가 아니며/)).toBeVisible();
  await page.getByText("지수 기준 보기").click();
  await expect(page.getByText(/아래 1\/3은 낮음/)).toBeVisible();
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
  expect(consoleErrors.join("\n")).not.toMatch(/hydrated|hydration/i);
  await expect(page.getByText(/최근 4주 평균/)).toHaveCount(0);
  await page.locator("nav.bottom-nav a").filter({ hasText: "공항" }).click();
  await expect(page.getByText(/공식 운항·게이트 인증 전에는 예상 승객 수/)).toBeVisible();
  await page.getByRole("button", { name: "다음 흐름" }).click();
  await expect(page.getByText("게이트 주변 예상 혼잡")).toBeVisible();
  await expect(page.getByText(/가짜 게이트 범위나 사람 수를 표시하지 않습니다/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("new demand and airport truth labels are complete in all four locales", async ({ page }) => {
  const labels = {
    ko: ["예시 수요지수", "실시간 공항 데이터 연결 준비 중", "예시 날짜 · 8월 23일 · KST"],
    en: ["DEMO INDEX", "Live airport data is being prepared", "SAMPLE DATE · AUG 23 · KST"],
    zh: ["演示指数", "实时机场数据正在准备接入", "示例日期 · 8月23日 · KST"],
    ja: ["デモ指数", "空港リアルタイムデータを準備中", "サンプル日付 · 8月23日 · KST"],
  } as const;
  for (const locale of Object.keys(labels) as Array<keyof typeof labels>) {
    await page.goto(`/${locale}`);
    await expect(page.getByText(labels[locale][0], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(labels[locale][2], { exact: true })).toBeVisible();
    await page.goto(`/${locale}/airport`);
    await expect(page.getByText(labels[locale][1], { exact: true })).toBeVisible();
  }
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
