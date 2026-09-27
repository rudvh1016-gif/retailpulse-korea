import { expect, test } from "@playwright/test";
import { contentApiAllowRules } from "../lib/crawl-policy";
import { robotsAllows } from "../lib/discoverability";
import { SUMMARY_FIXTURE, routeSummary } from "./summary-fixture";

const paths = ["/ja/hongdae", "/en/tourism-desk/hongdae", "/en/tourism-desk/myeongdong", "/en/tourism-desk/seongsu"];
const blocked = "User-agent: *\nDisallow: /api/\n";
const allowed = blocked + contentApiAllowRules.map(path => `Allow: ${path}\n`).join("");
for (const path of paths) {
  test(`Googlebot can render content at ${path} with only the allowed API`, async ({ page }) => {
    await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
    let policy = blocked;
    let successfulReads = 0;
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (!robotsAllows(policy, url.pathname + url.search)) return route.abort("blockedbyclient");
      expect(url.pathname).toBe("/api/live/summary");
      successfulReads++;
      return routeSummary(SUMMARY_FIXTURE)(route);
    });
    await page.goto(path);
    const error = /Could not load data|データを取得できませんでした/;
    await expect(page.locator("body")).toContainText(error);
    const blockedLength = (await page.locator("main").innerText()).length;
    policy = allowed;
    await page.reload();
    await expect(page.locator("body")).not.toContainText(error);
    await expect.poll(() => successfulReads).toBeGreaterThan(0);
    await expect.poll(async () => (await page.locator("main").innerText()).length).toBeGreaterThan(blockedLength + 100);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
    expect(await page.locator('link[rel="alternate"][hreflang]').count()).toBeGreaterThanOrEqual(5);
  });
}
