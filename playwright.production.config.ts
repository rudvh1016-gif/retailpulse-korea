import { defineConfig, devices } from "@playwright/test";
import { analyticsOptOutState, GOOGLE_TAG_BLOCK_ARGS } from "./scripts/analytics-opt-out.mjs";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://koretaildata.com";

/**
 * Read-only checks against the real Production site. No web server, no
 * fixtures, no writes: every request is an ordinary public page view.
 *
 * A check is not a reader, so it must not be counted as one. Each visits as a
 * reader who switched usage analytics off on 더보기, and Chromium cannot resolve
 * the Google tag hosts (scripts/analytics-opt-out.mjs). The specs' "no Google
 * tag" assertions therefore check that this switch holds on the live site;
 * e2e-production/analytics-default.spec.ts checks the default for a new reader.
 */
export default defineConfig({
  globalSetup: './scripts/production-revision-setup.mjs',
  testDir: "./e2e-production",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "production-visual-report" }]],
  use: {
    baseURL,
    storageState: analyticsOptOutState(baseURL),
    launchOptions: { args: GOOGLE_TAG_BLOCK_ARGS },
    trace: "retain-on-failure",
    screenshot: "on",
  },
  outputDir: "production-visual-results",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
