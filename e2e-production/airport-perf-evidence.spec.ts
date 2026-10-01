import { test } from "@playwright/test";

/**
 * Evidence run, manual dispatch only (read-only): how long the live Airport
 * page takes on a phone-like profile (4G latency/throughput, 4x slower CPU)
 * and on a fast desktop profile. Prints request timings, transfer sizes,
 * DOM size and main-thread long tasks. Also prints what the departure map and
 * the day comparison show right now (the empty state just after midnight KST).
 */
const log = (label: string, value: unknown) => console.log(`PERF ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

const PROFILES = [
  { name: "phone-4g-cpu4", cpu: 4, net: { latency: 100, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 } },
  { name: "desktop", cpu: 1, net: null },
] as const;

for (const profile of PROFILES) {
  test(`airport page timing · ${profile.name}`, async ({ browser }) => {
    test.skip(process.env.RPK_GEOMAP_EVIDENCE !== "1", "evidence run only");
    test.setTimeout(180_000);
    const context = await browser.newContext(profile.name.startsWith("phone")
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : { viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { __long: number[]; __lcp: number };
      w.__long = []; w.__lcp = 0;
      try { new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__long.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch { /* unsupported */ }
      try { new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__lcp = Math.round(e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* unsupported */ }
    });
    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    if (profile.net) await client.send("Network.emulateNetworkConditions", { offline: false, ...profile.net });
    if (profile.cpu > 1) await client.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
    const requests: Array<{ url: string; ms: number; transfer: number; kind: string }> = [];
    const started = new Map<string, number>();
    page.on("request", (request) => started.set(request.url(), Date.now()));
    page.on("requestfinished", async (request) => {
      const sizes = await request.sizes().catch(() => null);
      const begin = started.get(request.url()) ?? Date.now();
      requests.push({ url: new URL(request.url()).pathname.slice(0, 70), ms: Date.now() - begin, transfer: (sizes?.responseBodySize ?? 0) + (sizes?.responseHeadersSize ?? 0), kind: request.resourceType() });
    });
    const t0 = Date.now();
    const since = () => Date.now() - t0;
    await page.goto("/ko/airport", { waitUntil: "commit" });
    await page.locator(".app").waitFor({ state: "attached" });
    await page.waitForSelector('.app[data-hydrated="true"]', { timeout: 120_000 });
    const hydrated = since();
    await page.waitForSelector('[data-testid="airport-departure-overview"]', { state: "attached", timeout: 120_000 }).catch(() => null);
    const overviewAttached = since();
    await page.locator('[data-testid="overview-T2"] [data-testid="flight-split"]').first().waitFor({ state: "attached", timeout: 120_000 }).catch(() => null);
    const split = since();
    await page.locator('[data-testid="departure-map"], [data-testid="map-failed"], [data-testid="map-empty"]').first().waitFor({ state: "attached", timeout: 120_000 }).catch(() => null);
    const map = since();
    await page.waitForTimeout(3000);
    const stats = await page.evaluate(() => {
      const w = window as unknown as { __long: number[]; __lcp: number };
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        nodes: document.getElementsByTagName("*").length, svgNodes: document.querySelectorAll("svg *").length,
        longTasks: w.__long.length, longTaskMs: w.__long.reduce((a, b) => a + b, 0), longest: Math.max(0, ...w.__long), lcp: w.__lcp,
        ttfb: nav ? Math.round(nav.responseStart) : null, dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        mapState: document.querySelector('[data-testid="departure-map"]') ? "map" : document.querySelector('[data-testid="map-empty"]') ? "empty" : "none",
        mapEmptyText: document.querySelector('[data-testid="map-empty"]')?.textContent ?? null,
        splitText: Array.from(document.querySelectorAll('[data-testid="flight-split"]')).map((n) => (n.textContent ?? "").slice(0, 140)),
      };
    });
    log(`${profile.name} milestones(ms)`, { hydrated, overviewAttached, split, map });
    log(`${profile.name} stats`, stats);
    const total = requests.reduce((sum, r) => sum + r.transfer, 0);
    log(`${profile.name} transfer`, { requests: requests.length, totalKB: Math.round(total / 1024), js: Math.round(requests.filter((r) => r.kind === "script").reduce((s, r) => s + r.transfer, 0) / 1024), font: Math.round(requests.filter((r) => r.kind === "font").reduce((s, r) => s + r.transfer, 0) / 1024) });
    log(`${profile.name} api`, requests.filter((r) => r.url.includes("/api/")).map((r) => `${r.url} ${r.ms}ms ${Math.round(r.transfer / 1024)}KB`));
    log(`${profile.name} slowest`, [...requests].sort((a, b) => b.ms - a.ms).slice(0, 8).map((r) => `${r.url} ${r.ms}ms ${Math.round(r.transfer / 1024)}KB`));
    await context.close();
  });
}
