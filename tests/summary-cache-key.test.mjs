import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalSummaryRequest, canonicalSummaryUrl } from "../worker/summary-cache-key.ts";
import { GET, availabilityPeriod } from "../app/api/live/summary/route.ts";
import { coldSummaryMonth } from "../lib/summary-cold-month.ts";

/**
 * A query the summary route ignores used to be a brand-new edge-cache entry and
 * a brand-new D1 batch (`?x=1`, `?x=2`, ...). The cache key is now reduced to
 * the two parameters the route reads. What must never change: two different
 * service dates or months stay separate entries, and a reduced key can never
 * be answered with another request's data.
 */

const ORIGIN = "https://koretaildata.com";
const canonical = (path) => canonicalSummaryUrl(new URL(`${ORIGIN}${path}`));

test("parameters the route ignores no longer make a new key", () => {
  const plain = `${ORIGIN}/api/live/summary`;
  for (const path of [
    "/api/live/summary?x=1",
    "/api/live/summary?x=2",
    "/api/live/summary?_=1790000000000",
    "/api/live/summary?cacheProbe=abc",
    "/api/live/summary?discoverability=1&perf=2",
    "/api/live/summary?",
    "/api/live/summary?date=&month=",
    "/api/live/summary?DATE=2026-09-01",
    "/api/live/summary?date%5B%5D=2026-09-01",
  ]) assert.equal(canonical(path), plain, `${path} carries nothing the route reads`);
});

test("date and month stay in the key, so service dates and calendar months stay separate", () => {
  assert.equal(canonical("/api/live/summary?date=2026-09-29"), `${ORIGIN}/api/live/summary?date=2026-09-29`);
  assert.equal(canonical("/api/live/summary?date=2026-09-28"), `${ORIGIN}/api/live/summary?date=2026-09-28`);
  assert.notEqual(canonical("/api/live/summary?date=2026-09-29"), canonical("/api/live/summary?date=2026-09-28"));
  assert.equal(canonical("/api/live/summary?month=2026-08"), `${ORIGIN}/api/live/summary?month=2026-08`);
  assert.notEqual(canonical("/api/live/summary?month=2026-08"), canonical("/api/live/summary?month=2026-09"));
  assert.equal(canonical("/api/live/summary?date=2026-09-29&month=2026-08"), `${ORIGIN}/api/live/summary?date=2026-09-29&month=2026-08`);
  // Same answer, same key, whatever the order or extra parameters.
  assert.equal(canonical("/api/live/summary?month=2026-08&date=2026-09-29"), canonical("/api/live/summary?date=2026-09-29&month=2026-08"));
  assert.equal(canonical("/api/live/summary?x=1&date=2026-09-29&y=2"), `${ORIGIN}/api/live/summary?date=2026-09-29`);
  // Encoded spelling of the same value is the same request.
  assert.equal(canonical("/api/live/summary?date=2026%2D09%2D29"), `${ORIGIN}/api/live/summary?date=2026-09-29`);
});

test("values the route treats as absent share the key of the request without them", () => {
  const plain = `${ORIGIN}/api/live/summary`;
  for (const path of [
    "/api/live/summary?date=garbage",
    "/api/live/summary?date=2026-02-30",
    "/api/live/summary?date=2026-13-01",
    "/api/live/summary?date=2026-9-1",
    "/api/live/summary?date=%20",
    "/api/live/summary?month=2026-13",
    "/api/live/summary?month=2026-00",
    "/api/live/summary?month=26-09",
    "/api/live/summary?month=2026-09-01",
    "/api/live/summary?month=garbage",
  ]) assert.equal(canonical(path), plain, `${path} is ignored by the route`);
});

test("a repeated parameter is read the way the route reads it: the first one wins", () => {
  // searchParams.get returns the first value. The second, valid date must not be
  // promoted to the key when the route would have ignored the first-and-invalid one.
  assert.equal(canonical("/api/live/summary?date=garbage&date=2026-09-01"), `${ORIGIN}/api/live/summary`);
  assert.equal(canonical("/api/live/summary?date=2026-09-01&date=2026-09-02"), `${ORIGIN}/api/live/summary?date=2026-09-01`);
  assert.equal(canonical("/api/live/summary?month=2026-08&month=2026-07"), `${ORIGIN}/api/live/summary?month=2026-08`);
});

test("the key is idempotent and a request already in canonical form is left as it is", () => {
  for (const path of [
    "/api/live/summary",
    "/api/live/summary?date=2026-09-29",
    "/api/live/summary?month=2026-08",
    "/api/live/summary?date=2026-09-29&month=2026-08",
  ]) {
    const url = new URL(`${ORIGIN}${path}`);
    assert.equal(canonicalSummaryUrl(url), url.href, `${path} is already canonical`);
    assert.equal(canonical(new URL(canonicalSummaryUrl(url)).pathname + new URL(canonicalSummaryUrl(url)).search), url.href);
  }
});

/**
 * The reduced URL is only safe if the route answers it exactly as it answers the
 * original. This runs the real route (no database is bound, so it answers with
 * its degraded body, which still carries the resolved service date and month)
 * on each original and its reduced URL, and requires the same interpretation.
 */
test("the real route interprets the reduced URL exactly as it interprets the original", async () => {
  const read = async (url) => {
    const body = await (await GET(new Request(url))).json();
    return {
      serviceDateKst: body.serviceDateKst,
      dayRelation: body.dayRelation,
      month: body.dateAvailability?.month,
      startDate: body.dateAvailability?.startDate,
      endDate: body.dateAvailability?.endDate,
    };
  };
  const cases = [
    "", "?", "?x=1", "?date=2026-09-29", "?date=2020-02-29", "?date=2021-02-29", "?date=2026-09-31", "?date=garbage",
    "?date=2026-09-29&month=2026-08", "?month=2026-08", "?month=2026-02", "?month=2026-13", "?month=garbage",
    "?date=2026-09-29&month=garbage", "?date=garbage&month=2026-08", "?month=2026-08&date=2026-09-29",
    "?date=garbage&date=2026-09-01", "?date=2026-09-01&date=garbage", "?month=2026-08&month=garbage", "?month=garbage&month=2026-08",
    "?x=1&date=2026-09-29&y=2&month=2026-08&z=3", "?date=2026%2D09%2D29", "?DATE=2026-09-29", "?date=+2026-09-29", "?date=2026-09-29+",
    "?month=0000-01", "?month=9999-12", "?date=0001-01-01", "?date=9999-12-31", "?month=2026-09&date=2026-09-30&cacheProbe=1",
  ];
  for (const query of cases) {
    const original = new URL(`${ORIGIN}/api/live/summary${query}`);
    const reduced = canonicalSummaryUrl(original);
    assert.deepEqual(await read(reduced), await read(original.href), `route answer differs for ${query || "(none)"}`);
  }
});

test("the request handed to the cached entrypoint keeps method and headers and only loses what the route ignores", () => {
  const ask = (method, path, headers = {}) => {
    const url = new URL(`${ORIGIN}${path}`);
    const request = new Request(url, { method, headers });
    return { request, forwarded: canonicalSummaryRequest(request, url) };
  };
  // Already canonical: the very same object, so real client traffic is untouched.
  for (const path of ["/api/live/summary", "/api/live/summary?date=2026-09-29", "/api/live/summary?date=2026-09-29&month=2026-08"]) {
    const { request, forwarded } = ask("GET", path);
    assert.equal(forwarded, request, `${path} is passed through untouched`);
  }
  for (const method of ["GET", "HEAD"]) {
    const { request, forwarded } = ask(method, "/api/live/summary?x=1&date=2026-09-29&y=2", { accept: "application/json", "accept-language": "ko" });
    assert.notEqual(forwarded, request);
    assert.equal(forwarded.url, `${ORIGIN}/api/live/summary?date=2026-09-29`);
    assert.equal(forwarded.method, method);
    assert.equal(forwarded.headers.get("accept"), "application/json");
    assert.equal(forwarded.headers.get("accept-language"), "ko");
    assert.equal(forwarded.body, null);
  }
  assert.equal(ask("GET", "/api/live/summary?cacheProbe=1").forwarded.url, `${ORIGIN}/api/live/summary`);
});

test("an Authorization header is dropped before the cached entrypoint; other headers stay", () => {
  // Workers Cache bypasses a request that carries Authorization, and this public
  // route reads no header, so the header could only cost a D1 batch.
  const url = new URL(`${ORIGIN}/api/live/summary?date=2026-09-29`);
  const request = new Request(url, { headers: { authorization: "Bearer x", accept: "application/json", cookie: "a=b" } });
  const forwarded = canonicalSummaryRequest(request, url);
  assert.notEqual(forwarded, request);
  assert.equal(forwarded.url, url.href, "the URL is already canonical and is kept");
  assert.equal(forwarded.headers.has("authorization"), false);
  assert.equal(forwarded.headers.get("accept"), "application/json");
  assert.equal(forwarded.headers.get("cookie"), "a=b");
  assert.equal(forwarded.method, "GET");
  assert.equal(request.headers.get("authorization"), "Bearer x", "the original request is not modified");
  // With a junk query as well.
  const both = new URL(`${ORIGIN}/api/live/summary?x=1&month=2026-08`);
  const bothForwarded = canonicalSummaryRequest(new Request(both, { headers: { Authorization: "Bearer x" } }), both);
  assert.equal(bothForwarded.url, `${ORIGIN}/api/live/summary?month=2026-08`);
  assert.equal(bothForwarded.headers.has("authorization"), false);
});

test("the gateway asks the cached entrypoint only through the canonical helper, and routing still decides by path and method alone", () => {
  const worker = readFileSync("worker/index.ts", "utf8");
  assert.match(worker, /import \{ canonicalSummaryRequest \} from "\.\/summary-cache-key";/);
  assert.match(worker, /summaryCache\.fetch\(canonicalSummaryRequest\(request, url\)\)/);
  assert.doesNotMatch(worker, /summaryCache\.fetch\(request\)/, "no path hands the raw request to the cached entrypoint");
  const routing = readFileSync("worker/summary-cache-routing.ts", "utf8");
  assert.doesNotMatch(routing.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, ""), /searchParams/,
    "which requests are cacheable is still decided by path and method only");
});

/**
 * The reduction is only safe while the route reads nothing but `date` and
 * `month`. A third query parameter, or any header or Cloudflare property, would
 * be collapsed onto one cached body and served to everybody. This fails the day
 * that changes, so the key rule is updated together with the route.
 */
test("the summary route still reads only the date and month parameters, and nothing from headers", () => {
  const source = readFileSync("app/api/live/summary/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const keys = [...source.matchAll(/searchParams\.get\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]).sort();
  assert.deepEqual(keys, ["date", "month"], "update worker/summary-cache-key.ts together with any new parameter");
  assert.doesNotMatch(source, /searchParams\.(getAll|entries|keys|values|forEach|has)\b|Object\.fromEntries\(\s*[\w.]*searchParams|\.search\b|\.searchParams\s*\)/,
    "no other way of reading the query string");
  assert.doesNotMatch(source, /request\.headers|request\.cf\b|headers\.get\(|cookies?\b/i,
    "an answer that depends on a header or a cookie could not share a cache entry");
});

test("only the exact summary path is reduced; the key module knows nothing about other routes", () => {
  const source = readFileSync("worker/summary-cache-key.ts", "utf8");
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, ""), /vinext|cloudflare:workers|D1Database/,
    "the key rule stays free of Worker imports so it can be tested directly");
});

test("a cold probe key is a real month, so it is kept in the key and reads a cache entry nobody uses", () => {
  const seen = new Set();
  for (let seed = 0; seed < 2400; seed++) {
    const month = coldSummaryMonth(seed);
    assert.match(month, /^20\d{2}-(0[1-9]|1[0-2])$/);
    // The route accepts it as given (it is not silently replaced by the service month) ...
    assert.equal(availabilityPeriod(month, "2026-09-30").month, month);
    // ... and the gateway keeps it, so it is its own cache entry.
    assert.equal(canonical(`/api/live/summary?month=${month}`), `${ORIGIN}/api/live/summary?month=${month}`);
    seen.add(month);
  }
  assert.equal(seen.size, 1200, "every seed maps into the same 1,200 months, 2000-01 to 2099-12");
  assert.equal(coldSummaryMonth(Number.MAX_SAFE_INTEGER) > "1999", true);
  assert.match(coldSummaryMonth(-5), /^20\d{2}-\d{2}$/);
});
