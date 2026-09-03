import { defineConfig, devices } from "@playwright/test";

/**
 * Read-only checks against the real Production site. No web server, no
 * fixtures, no writes: every request is an ordinary public page view.
 */
export default defineConfig({
  testDir: "./e2e-production",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "production-visual-report" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://koretaildata.com",
    trace: "retain-on-failure",
    screenshot: "on",
  },
  outputDir: "production-visual-results",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
