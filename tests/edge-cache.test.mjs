import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldRouteToSummaryCache, SUMMARY_CACHE_PATH } from "../worker/summary-cache-routing.ts";
import {
  isCacheableSummary,
  summaryCacheControl,
  SUMMARY_CACHE_CONTROL,
  SUMMARY_NO_STORE,
} from "../lib/summary-cache-policy.ts";

const config = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));

/**
 * Production evidence that motivated this phase: repeated identical requests
 * to /api/live/summary all reached D1, each costing ~2,795 rows read. Workers
 * Caching sits in front of a named entrypoint, so the whole safety argument
 * rests on which entrypoint is cached and which requests reach it.
 */

test("only the named summary entrypoint is cached, and only in Production", () => {
  const production = config.env.production;
  assert.deepEqual(production.cache, { enabled: false },
    "the Worker as a whole must stay uncached; only one entrypoint opts in");
  assert.equal(production.exports.default.cache.enabled, false,
    "the default entrypoint is the gateway and must run on every request");
  assert.equal(production.exports.SummaryCache.cache.enabled, true,
    "the summary entrypoint is the only one Cloudflare may serve from cache");
  assert.equal(production.exports.SummaryCache.type, "worker");

  assert.equal(config.cache, undefined, "the shared top level must not enable caching");
  assert.equal(config.exports, undefined, "no cached entrypoint outside Production");
  assert.equal(config.env.staging.cache, undefined, "staging must stay uncached");
  assert.equal(config.env.staging.exports, undefined, "staging must stay uncached");
});

test("enabling the cache did not add a sixth Cron trigger", () => {
  assert.equal(config.env.production.triggers.crons.length, 5,
    "Workers Free allows five; the cache must never cost a trigger");
});

test("the installed Wrangler supports per-entrypoint cache overrides", () => {
  // A whole-Worker `cache.enabled` would cache the gateway, and with it every
  // write, /api/health and page. Per-entrypoint `exports` is what makes the
  // narrow, safe configuration expressible at all, and it is not present in
  // older Wrangler config schemas.
  const schema = JSON.parse(readFileSync("node_modules/wrangler/config-schema.json", "utf8"));
  assert.ok(schema.definitions.WorkerEntrypointExport,
    "Wrangler must be new enough to validate a per-entrypoint cache override");
  assert.ok(schema.definitions.WorkerEntrypointExport.properties.cache,
    "the entrypoint export must accept a cache override");
});

test("the built Worker still exports the entrypoint the cache is bound to", () => {
  // The Wrangler config names `SummaryCache`. If bundling ever dropped the
  // named export, the deployment would reference an entrypoint that does not
  // exist — so this asserts the source contract the build must preserve.
  const source = readFileSync("worker/index.ts", "utf8");
  assert.match(source, /export const SummaryCache = \{/,
    "the cached entrypoint must stay a named export of the Worker entry module");
  // A static `cloudflare:workers` import resolves only inside workerd, so it
  // would break every Node test that loads this module.
  assert.doesNotMatch(source, /^import .*"cloudflare:workers"/m,
    "the Worker entry must not statically import a workerd-only module");
});

test("only safe methods on the exact summary path reach the cached entrypoint", () => {
  assert.equal(shouldRouteToSummaryCache("GET", SUMMARY_CACHE_PATH), true);
  assert.equal(shouldRouteToSummaryCache("HEAD", SUMMARY_CACHE_PATH), true);
  assert.equal(shouldRouteToSummaryCache("get", SUMMARY_CACHE_PATH), true, "method casing must not decide safety");

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(shouldRouteToSummaryCache(method, SUMMARY_CACHE_PATH), false,
      `${method} must never be served from a shared cache`);
  }
});

test("no other route is ever handed to the cached entrypoint", () => {
  for (const path of [
    "/api/health",
    "/api/beta-signups",
    "/api/live/flights",
    "/api/live/summary/",
    "/api/live/summary/extra",
    "/api/live/summaryx",
    "/",
    "/ko",
  ]) {
    assert.equal(shouldRouteToSummaryCache("GET", path), false,
      `${path} must stay on the uncached gateway`);
  }
});

test("the routing decision ignores the query string so dates stay distinct", () => {
  // The gateway forwards the request unchanged and Cloudflare's default cache
  // key includes the full query string. Routing therefore keys off the path
  // only; stripping or normalizing `date` here would collapse two different
  // service dates onto one cached body.
  // Comments discuss the query string on purpose; only executable code matters.
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const routing = stripComments(readFileSync("worker/summary-cache-routing.ts", "utf8"));
  assert.doesNotMatch(routing, /searchParams|split\(["']\?["']\)/,
    "the router must not touch the query string");

  const worker = readFileSync("worker/index.ts", "utf8");
  assert.match(worker, /summaryCache\.fetch\(request\)/,
    "the original request, query string included, must be forwarded verbatim");
});

const healthyArea = { realtime: { congestionLevel: 2 }, weather: [{ targetAt: "2026-09-02T10:00:00+09:00" }] };

test("a summary carrying real data is admitted to the edge cache", () => {
  assert.equal(isCacheableSummary({
    sources: [{ sourceId: "SEOUL_CITYDATA_PPLTN", status: "LIVE" }],
    areas: { myeongdong: healthyArea, hongdae: healthyArea, seongsu: healthyArea },
  }), true);
  assert.equal(summaryCacheControl({
    sources: [{ sourceId: "x" }],
    areas: { myeongdong: healthyArea },
  }), SUMMARY_CACHE_CONTROL);
});

test("an official realtime commercial observation is independently cacheable area data", () => {
  assert.equal(isCacheableSummary({
    sources: [{ sourceId: "SEOUL_CITYDATA_CMRCL", status: "LIVE" }],
    areas: {
      myeongdong: {
        realtime: null,
        weather: [],
        commercial: { commercialLevel: "활발", observedAt: "2026-09-02T12:05:00+09:00" },
      },
    },
  }), true);
});

test("an official historical mobility aggregate is independently cacheable area data", () => {
  assert.equal(isCacheableSummary({
    sources: [{ sourceId: "SEOUL_FOREIGN_PURPOSE_MOBILITY", status: "OFFICIAL_HISTORICAL" }],
    areas: {
      myeongdong: {
        realtime: null,
        weather: [],
        foreignPurposeMobility: { referenceDate: "2026-07-31", shopping: 2772, tourism: 388.5 },
      },
    },
  }), true);
});

/**
 * `safeAll` turns a failing statement into an empty list so one broken query
 * cannot take the page down. The cost is that a partly dead D1 still answers
 * 200 with a well-formed but empty `live-summary` body. Admitting that to a
 * shared cache would serve the outage to every visitor for the whole TTL —
 * which is exactly what made the September D1 incident visible for so long.
 */
test("an outage payload that still answers 200 is never cached", () => {
  assert.equal(isCacheableSummary({ sources: [], areas: {} }), false,
    "no source health at all means the database path did not produce data");
  assert.equal(isCacheableSummary({
    sources: [{ sourceId: "x" }],
    areas: { myeongdong: { realtime: null, weather: [] } },
  }), false, "sources alone cannot prove the areas the reader looks at have data");
  assert.equal(isCacheableSummary({ sources: undefined, areas: undefined }), false);
  assert.equal(isCacheableSummary({}), false);

  assert.equal(summaryCacheControl({ sources: [], areas: {} }), SUMMARY_NO_STORE);
});

test("one core area with data is enough, and quiet-but-healthy fields never block caching", () => {
  // Zero events and absent quarterly sales are legitimate, not degraded.
  assert.equal(isCacheableSummary({
    sources: [{ sourceId: "x" }],
    areas: {
      myeongdong: { realtime: null, weather: [] },
      hongdae: { realtime: { congestionLevel: 1 }, weather: [], events: [], eventCount: 0, sales: null },
      seongsu: { realtime: null, weather: [] },
    },
  }), true, "a real observation in one area is real data");

  assert.equal(isCacheableSummary({
    sources: [{ sourceId: "x" }],
    areas: { myeongdong: { realtime: null, weather: [{ targetAt: "2026-09-02T10:00:00+09:00" }] } },
  }), true, "a published weather horizon is real data even with no realtime row");
});

test("the summary route decides its cache header from the payload, not the status code", () => {
  const route = readFileSync("app/api/live/summary/route.ts", "utf8");
  assert.match(route, /summaryCacheControl\(\{ sources, areas \}\)/,
    "the success path must run the admission rule");
  assert.doesNotMatch(route, /"public, max-age=60/,
    "no hardcoded public caching may bypass the admission rule");
  assert.match(route, /SUMMARY_NO_STORE/, "the degraded path must stay no-store");
});

test("health is never routed through the cache and never cacheable", () => {
  assert.equal(shouldRouteToSummaryCache("GET", "/api/health"), false);
  const health = readFileSync("app/api/health/route.ts", "utf8");
  assert.match(health, /"cache-control": "no-store"/,
    "an unhealthy health probe must never be reusable");
});
