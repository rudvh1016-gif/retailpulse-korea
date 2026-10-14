import { expect, test } from "@playwright/test";

/**
 * GA4 starts on for a new reader since 2026-10-14, except in EU/EEA, UK and
 * Swiss time zones (docs/approvals/ga4-default-on-20261014.json). Every other
 * production check visits with usage analytics switched off
 * (playwright.production.config.ts); these two visit with no stored choice,
 * as a new reader does, so a deploy that loses the tag or the default fails
 * here instead of leaving the owner's GA quietly empty.
 *
 * Nothing reaches GA: Chromium cannot resolve the Google tag hosts in this run
 * (scripts/analytics-opt-out.mjs) and every request to them is aborted here too.
 */
const GOOGLE_TAG = /^https:\/\/(?:[^/]+\.)?(?:googletagmanager\.com|google-analytics\.com|analytics\.google\.com)\//;

test.use({ storageState: { cookies: [], origins: [] } });

for (const { timezoneId, counted } of [
  { timezoneId: "Asia/Seoul", counted: true },
  { timezoneId: "Europe/Berlin", counted: false },
]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });

    test(`a new reader in ${timezoneId} ${counted ? "is counted without choosing" : "is counted only after turning it on"}`, async ({ page }) => {
      await page.route(GOOGLE_TAG, (route) => route.abort());
      await page.goto("/ko/more");
      const choice = page.locator('input[name="usage-analytics"]');
      await expect(choice).toBeEnabled();
      await expect(choice).toBeChecked({ checked: counted });
      const tag = page.locator("script[data-koretail-analytics]");
      if (counted) {
        await expect(tag).toHaveCount(1);
        await expect(tag).toHaveAttribute("src", /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]{4,20}$/);
      } else {
        await expect(tag).toHaveCount(0);
      }
    });
  });
}
