import { defineConfig, devices } from "@playwright/test";
import { noticeDismissedState } from './scripts/update-notice-test-state.mjs';
import { GOOGLE_TAG_BLOCK_ARGS } from './scripts/analytics-opt-out.mjs';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    storageState: noticeDismissedState(baseURL),
    launchOptions: { args: GOOGLE_TAG_BLOCK_ARGS },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: process.env.PLAYWRIGHT_PRODUCTION_SERVER === "true"
      ? "CLOUDFLARE_CF_FETCH_ENABLED=false NEXT_PUBLIC_SITE_ORIGIN=http://127.0.0.1:4173 npm run start -- --hostname 127.0.0.1 --port 4173"
      : "CLOUDFLARE_CF_FETCH_ENABLED=false NEXT_PUBLIC_SITE_ORIGIN=http://127.0.0.1:4173 npm run dev -- --host 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
