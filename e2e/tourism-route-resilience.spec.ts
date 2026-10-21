import { expect, test } from "@playwright/test";
import { parsePreferences, PREFERENCE_KEY } from "../lib/personal-briefing";
import { SUMMARY_FIXTURE, routeSummary } from "./summary-fixture";

const areas = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
  itaewon: { ko: "이태원", en: "Itaewon", zh: "梨泰院", ja: "梨泰院" },
};

for (const locale of ["ko", "en", "zh", "ja"] as const) {
  test(`Tourism destinations override saved personal locations after hydration and reload: ${locale}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
    await page.route("**/api/live/summary*", routeSummary(SUMMARY_FIXTURE));
    await page.addInitScript(({ key }) => {
      const destination = location.pathname.split("/").at(-1);
      const savedLocation = destination === "hongdae" ? "seongsu" : "hongdae";
      localStorage.setItem(key, JSON.stringify({
        version: 1, role: "manager", location: savedLocation,
        selectedLocations: [savedLocation],
        terminal: "all", selectedTerminals: ["all"],
        interests: ["crowding", "events"], day: "today", selectedDays: ["today"],
        analytics: false,
      }));
      localStorage.setItem("retailpulse-preferences", JSON.stringify({ lang: "ko", area: "hongdae" }));
    }, { key: PREFERENCE_KEY });

    for (const [area, names] of Object.entries(areas)) {
      const path = `/${locale}/tourism-desk/${area}`;
      await page.goto(path);
      const saved = await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY);
      const preferences = parsePreferences(saved);
      expect(preferences).not.toBeNull();
      expect(preferences?.location).not.toBe(area);
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        await expect(page.locator(".app")).toHaveAttribute("data-hydrated", "true");
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.locator("#tourism-desk-title")).toContainText(names[locale]);
        await expect(page.locator(".tourism-area-switcher [aria-current=page]")).toHaveAttribute("href", path);
        await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh" ? "zh-CN" : locale);
        await expect(page.locator(".tourism-limits li")).toHaveCount(7);
        expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(saved);
      }
    }
  });

  test(`Tourism methodology remains visible after a failed summary read: ${locale}`, async ({ page }) => {
    await page.route("**/api/live/summary*", route => route.abort("failed"));
    await page.goto(`/${locale}/tourism-desk/myeongdong`);
    await expect(page.locator('.tourism-desk [role="status"][aria-busy="false"]')).toBeVisible();
    await expect(page.locator("#tourism-limits-title")).toBeVisible();
    await expect(page.locator(".tourism-limits li")).toHaveCount(7);
    await expect(page.locator(".tourism-limits")).toContainText(areas.myeongdong[locale]);
    await expect(page.locator(".tourism-shift-brief")).toHaveCount(0);
  });
}
