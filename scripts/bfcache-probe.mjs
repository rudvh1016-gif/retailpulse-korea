#!/usr/bin/env node
/**
 * Read-only back/forward cache evidence for a deployed KORETAIL origin.
 *
 * Loads each page in a phone-sized context, leaves for another site, goes
 * back, and prints one JSON line per visit: whether the browser restored the
 * page from its back/forward cache (the page's own window state survived),
 * Chromium's reasons when it did not (CDP Page.backForwardCacheNotUsed), how
 * long the page took to show its main content again, the page's HTML cache
 * headers and the cache-control and transfer size of each /api/ request it
 * made. Chromium runs as the full browser (the headless shell's embedder
 * refuses the cache outright: BackForwardCacheDisabledForDelegate) with the
 * back/forward cache Playwright normally disables; WebKit reports through
 * pageshow.persisted. Two controls show whether each engine restores at all:
 * the site's own static preview page and example.com. It writes nothing and
 * prints no cookie values or secrets. It visits with usage analytics switched
 * off, so it never counts as a reader in GA (scripts/analytics-opt-out.mjs).
 *
 *   node scripts/bfcache-probe.mjs https://koretaildata.com [away-url]
 */
import { chromium, webkit, devices } from "@playwright/test";
import { analyticsOptOutState, GOOGLE_TAG_BLOCK_ARGS } from "./analytics-opt-out.mjs";

const origin = (process.argv[2] ?? "https://koretaildata.com").replace(/\/$/, "");
const away = process.argv[3] ?? "https://example.com/";
const PATHS = ["/ko", "/ko/airport", "/ko/where-to", "/ko/myeongdong", "/ko/consumption", "/en/about"];
const TARGETS = [
  ...PATHS.map((path) => ({ path, url: origin + path, away, app: true })),
  { path: "control:static-preview", url: `${origin}/previews/seoul-flow/`, away, app: false },
  { path: "control:example.com", url: away, away: `${origin}/robots.txt`, app: false },
];
const RUNS = 2;
const HEADERS = ["cache-control", "vary", "etag", "last-modified", "age", "cf-cache-status", "content-type"];
const HYDRATED = '.app[data-hydrated="true"]';
const ENGINES = {
  chromium: { type: chromium, launch: { args: GOOGLE_TAG_BLOCK_ARGS, ignoreDefaultArgs: ["--disable-back-forward-cache"], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }) }, device: devices["Pixel 7"] },
  webkit: { type: webkit, launch: {}, device: devices["iPhone 13"] },
};

const print = (line) => console.log(JSON.stringify(line));
const pick = (headers) => Object.fromEntries(HEADERS.map((name) => [name, headers[name] ?? null]));
const message = (error) => String(error?.message ?? error).split("\n")[0];
const within = (promise, ms, fallback) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms, fallback))]);

// Every frame's explanations, with the script locations Chromium blames.
function reasonsOf(event) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    for (const item of node.explanations ?? []) out.push({ frame: node.url, type: item.type, reason: item.reason, context: item.context ?? null, details: (item.details ?? []).map((d) => `${d.url}:${d.lineNumber}:${d.columnNumber}`) });
    for (const child of node.children ?? []) walk(child);
  };
  if (event.notRestoredExplanationsTree) walk(event.notRestoredExplanationsTree);
  else for (const item of event.notRestoredExplanations ?? []) out.push({ type: item.type, reason: item.reason, context: item.context ?? null });
  return out;
}

async function visit(browser, engine, target, run) {
  const { device } = ENGINES[engine];
  const context = await browser.newContext({ storageState: analyticsOptOutState(origin), viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: device.userAgent, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await context.newPage();
  const result = { probe: "bfcache", engine, path: target.path, run };
  const reasons = [];
  if (engine === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.enable");
    cdp.on("Page.backForwardCacheNotUsed", (event) => reasons.push(...reasonsOf(event)));
  }
  const apis = [];
  let phase = "load";
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return;
    const entry = { phase, api: url.pathname + url.search, status: response.status(), cacheControl: response.headers()["cache-control"] ?? null };
    apis.push(within(response.finished().then(() => response.request().sizes()).then((sizes) => ({ ...entry, transferBytes: sizes.responseBodySize }), () => entry), 10000, entry));
  });
  try {
    const response = await page.goto(target.url, { waitUntil: "load", timeout: 45000 });
    const headers = await response.allHeaders();
    result.html = { status: response.status(), ...pick(headers), setCookie: "set-cookie" in headers };
    if (target.app) result.hydrated = await page.waitForSelector(HYDRATED, { timeout: 15000 }).then(() => true, () => false);
    await page.waitForTimeout(3000);
    await page.evaluate(() => { window.__probe = Date.now(); window.__pageshow = []; addEventListener("pageshow", (event) => window.__pageshow.push(event.persisted)); });
    await page.goto(target.away, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1000);
    phase = "back";
    const started = Date.now();
    await page.goBack({ waitUntil: "commit", timeout: 30000 });
    result.backCommitMs = Date.now() - started;
    await page.locator(target.app ? "main" : "body").first().waitFor({ state: "visible", timeout: 30000 });
    result.backVisibleMs = Date.now() - started;
    if (target.app) result.backHydratedMs = await page.waitForSelector(HYDRATED, { timeout: 15000 }).then(() => Date.now() - started, () => null);
    await page.waitForTimeout(1500);
    Object.assign(result, await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return { url: location.href, restored: typeof window.__probe === "number", pageshowPersisted: window.__pageshow ?? null, navigationType: nav?.type ?? null, navTiming: nav ? { responseStart: Math.round(nav.responseStart), domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) } : null, fcp: fcp ? Math.round(fcp.startTime) : null };
    }));
  } catch (error) {
    result.error = message(error);
  }
  result.notRestoredReasons = reasons;
  result.apis = await Promise.all(apis);
  print(result);
  await context.close();
}

// What a plain request (no browser) gets for the two busiest pages.
for (const path of ["/ko", "/ko/airport"]) {
  try {
    const response = await fetch(origin + path, { headers: { accept: "text/html" }, signal: AbortSignal.timeout(15000) });
    print({ probe: "html-headers", source: "fetch", path, status: response.status, ...pick(Object.fromEntries(response.headers)), setCookie: response.headers.getSetCookie().length > 0 });
  } catch (error) {
    print({ probe: "html-headers", source: "fetch", path, error: message(error) });
  }
}

for (const engine of (process.env.BFCACHE_ENGINES ?? "chromium,webkit").split(",")) {
  let browser;
  try {
    browser = await ENGINES[engine].type.launch(ENGINES[engine].launch);
    print({ probe: "engine", engine, version: browser.version(), userAgent: ENGINES[engine].device.userAgent, away });
    for (const target of TARGETS) for (let run = 1; run <= RUNS; run += 1) await visit(browser, engine, target, run);
  } catch (error) {
    print({ probe: "engine", engine, error: message(error) });
  } finally {
    await browser?.close();
  }
}
