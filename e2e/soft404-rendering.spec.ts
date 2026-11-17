import { expect, test } from "@playwright/test";
import { SUMMARY_FIXTURE, routeSummary } from "./summary-fixture";

const paths = ["/ja/hongdae", "/en/tourism-desk/hongdae", "/en/tourism-desk/myeongdong", "/en/tourism-desk/seongsu"];
for (const path of paths) {
  test(`Googlebot follows retired ${path} to the airport canonical without Seoul reads`, async ({ page }) => {
    await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
    const retiredReads:string[]=[];
    await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
    page.on('request',request=>{if(/\/api\/live\/(usual|commercial-months|predictions|events)/.test(request.url()))retiredReads.push(request.url());});
    const response=await page.goto(path);
    const locale=path.split('/')[1];
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',new RegExp(`/${locale}$`));
    expect(await page.locator('link[rel="alternate"][hreflang]').count()).toBeGreaterThanOrEqual(5);
    expect(response?.ok()).toBe(true);
    expect(retiredReads).toEqual([]);
  });
}
