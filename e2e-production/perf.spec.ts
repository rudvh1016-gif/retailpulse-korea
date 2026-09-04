import { expect, test } from "@playwright/test";

/**
 * Read-only timing of the live airport page on a phone profile.
 *
 * Nothing here asserts a speed budget; the point is a reproducible number
 * in the workflow log so a change can be judged by the same measurement
 * before and after. The numbers that matter, from the 2026-09-04 diagnosis:
 * how long an UNCACHED /api/live/summary takes (the edge cache holds a
 * summary for 60 s fresh + 300 s stale per colo, so most real visitors pay
 * the uncached path), and how long the airport page shows "확인 불가" before
 * its data-driven content appears.
 */
test("production airport page: mobile timing to data", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, locale: "ko-KR",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    (window as unknown as { __lcp: number | null }).__lcp = null;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) (window as unknown as { __lcp: number | null }).__lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* not supported */ }
  });

  // A unique query string defeats the shared edge cache, so this measures the
  // uncached path the way a visitor whose colo holds no fresh copy sees it.
  const probe = `perf-${Date.now()}`;
  const startedAt = Date.now();
  const response = await page.goto(`/ko/airport?perf=${probe}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const dataVisibleAt = await page.locator(".airport-today, .airport-unavailable").first()
    .waitFor({ state: "visible", timeout: 30_000 }).then(() => Date.now() - startedAt);
  const dataReal = await page.locator(".airport-today").first().waitFor({ state: "visible", timeout: 30_000 })
    .then(() => Date.now() - startedAt).catch(() => null);
  await page.waitForTimeout(1500);

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const named = (pattern: RegExp) => resources.filter((entry) => pattern.test(entry.name))
      .map((entry) => ({ name: entry.name.replace(location.origin, ""), start: Math.round(entry.startTime), duration: Math.round(entry.duration), transfer: entry.transferSize, decoded: entry.decodedBodySize }));
    return {
      html: { ttfb: Math.round(nav.responseStart), done: Math.round(nav.responseEnd), transfer: nav.transferSize, decoded: nav.decodedBodySize },
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      lcp: (window as unknown as { __lcp: number | null }).__lcp,
      summary: named(/\/api\/live\/summary/),
      scripts: named(/\/assets\/.*\.js$/),
      css: named(/\/assets\/.*\.css$/),
      fonts: named(/\/fonts\//),
    };
  });

  // The same uncached fetch again, timed directly, with the edge's verdict.
  const direct = await page.evaluate(async (key) => {
    const t0 = performance.now();
    const res = await fetch(`/api/live/summary?perf=${key}-direct`);
    await res.text();
    return { ms: Math.round(performance.now() - t0), status: res.status, cfCacheStatus: res.headers.get("cf-cache-status"), cacheControl: res.headers.get("cache-control") };
  }, probe);

  const report = { probe, dataVisibleAt, dataReal, direct, ...timing };
  console.log(`AIRPORT_MOBILE_TIMING ${JSON.stringify(report, null, 2)}`);
  await test.info().attach("airport-mobile-timing.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  await context.close();
});
