# Workers summary edge cache design

## Scope

Cache only public `GET`/`HEAD /api/live/summary` responses at Cloudflare's edge. Keep every other request on the uncached default entrypoint. Do not add KV, R2, Durable Objects, Cache API state, paid services, a provider request, or a Cron Trigger.

## Official constraints verified on 2026-09-02

- Workers Caching is configured with `cache.enabled` and requires Wrangler 4.69 or newer.
- Per-entrypoint cache overrides require Wrangler 4.107 or newer. The current published Wrangler is 4.128.0.
- A cache hit is served without invoking the Worker; the request still counts toward the Workers Free daily request allowance.
- The default cache key includes the full URL, including its query string.
- `private` and `no-store` responses bypass Workers Caching.
- `CF-Cache-Status` reports MISS/HIT/BYPASS and `Age` is present on a cached hit.
- Cache API is data-center-local and does not support `stale-while-revalidate`, so it is not the preferred mechanism.

## Architecture

The default Worker entrypoint remains an uncached gateway. It preserves HTTPS redirects, image handling, pages, health, writes, and all other routes. Only a `GET` or `HEAD` whose path is exactly `/api/live/summary` is forwarded through `ctx.exports.SummaryCache.fetch(request)`.

`SummaryCache` is a named `WorkerEntrypoint` that calls the existing vinext handler. Wrangler enables caching only for this named entrypoint in Production; default and staging entrypoints stay uncached. Cache entries remain version-local so a deployment starts cold and cannot serve a previous version's payload.

No custom cache key is used. Therefore `/api/live/summary`, `?date=2026-09-01`, and `?date=2026-09-02` are distinct keys. (From 2026-09-30 the URL handed to `SummaryCache` is first reduced to the parameters the route reads; see "Update — 2026-09-30" below. The default key rule itself is unchanged.)

## Admission and freshness

The existing 60-second fresh and 300-second stale-while-revalidate policy remains. A summary is cacheable only when the outer D1 path succeeded, source health is non-empty, and at least one core area has realtime or weather data. Degraded and outer-failure payloads return `Cache-Control: no-store` and cannot populate the edge cache. `/api/health` remains `no-store` and is never routed through the cached entrypoint.

## Verification

Regression tests cover production-only entrypoint configuration, exact summary routing, non-GET bypass, query-string preservation, and degraded `no-store` admission. Production smoke records repeated default and dated requests, requires an eventual HIT, compares `generatedAt`, and proves two explicit dates never cross-contaminate.

## Implementation record — 2026-09-02

Checked against the installed Wrangler config schema rather than release notes
alone, because the version requirement decides whether this design is even
expressible:

- Wrangler 4.92.0, the version this repository pinned, defines only a
  whole-Worker `cache.enabled`. Its schema carries no `exports` map, so a
  per-entrypoint override could not be written at all. The one available
  switch would have cached the default entrypoint, and with it every write,
  `/api/health` and page — the opposite of this design.
- Wrangler 4.128.0 defines `Exports`, `ConfiguredExport` and
  `WorkerEntrypointExport`, the last carrying the per-entrypoint
  `cache.enabled` this design depends on. The dependency was upgraded for
  that reason and for no other.
- `wrangler deploy --dry-run --env production` accepts the resulting
  configuration.

`worker/index.ts` exports `SummaryCache` as a named export and the built
bundle preserves it (`export { SummaryCache, worker_entry_default as default }`).
The Wrangler `exports` map names that export, so losing it would leave the
deployment pointing at an entrypoint that does not exist;
`tests/edge-cache.test.mjs` asserts the source contract.

`wrangler.production.jsonc` deliberately carries no comments despite its
extension: existing tests parse it with strict `JSON.parse`.

Cache admission lives in `lib/summary-cache-policy.ts` rather than in the
response builder. `safeAll` turns a failing statement into an empty list so one
broken query cannot take the page down, which means a partly dead D1 still
answers 200 with a well-formed but empty `live-summary` body. Freshness is
therefore decided by the payload, never by the status code.

Still outstanding: Production deployment, and the real `CF-Cache-Status`,
`Age` and cross-date isolation measurements, which can only be taken against
the deployed Worker.

## Update — 2026-09-30: query strings the route ignores no longer make a cache entry

Problem: the default key is path + query string, and the route reads only `date` and `month`. `?x=1`, `?x=2`, `?_=<time>` each missed the cache and ran the whole D1 batch (about 30 statements and 2.5k rows read).

Change: the gateway (`worker/index.ts`) builds the URL for `SummaryCache` with `worker/summary-cache-key.ts`. It keeps `date` (only a real KST day) and `month` (only a real `YYYY-MM`), in that order and with the value the route would use (first occurrence, like `searchParams.get`), and drops everything else. A request already in that form is forwarded as it is. A value the route treats as absent (`?date=garbage`) shares the key of the request without it, because the route answers both with today.

What is preserved: `date` and `month` still separate entries (tests/summary-cache-key.test.mjs runs the real route on the original and the reduced URL and requires the same answer; the smoke still proves two dates never cross-contaminate). `worker/summary-cache-routing.ts` still decides only by path and method and never reads the query string. No check in `tests/edge-cache.test.mjs` was removed. One assertion ("the original request, query string included, must be forwarded verbatim") now reads "the request is asked through the canonical-key helper, and a request that already carries only date and month is forwarded as the very same request"; the purpose it served, that two service dates never share a key, is asserted there directly.

Official custom-key option reviewed, not used: Workers Caching documents `cf.cacheKey` on a `ctx.exports` loopback fetch, which replaces path + query as the URL component of the key. It was not chosen because (1) the local emulation (miniflare 4.20260515.0, workerd 1.20260515.1) shows no Workers Cache support that could be exercised here, so a `cf.cacheKey` mistake would only be visible on the real edge; (2) re-addressing the request relies only on the default key rule that the production smoke has already proven (MISS to HIT, per-date isolation); (3) the route would then still see the original URL rather than the one the key was built from. `cf.cacheKey` remains the documented alternative if the URL rewrite ever has to be replaced.

Rejecting bad values with a 4xx before D1 was reviewed and not done: the route's contract is that a hand-edited URL never blanks the page (`?date=garbage` answers today), and sharing the plain key already costs no extra D1 read.

Probes: an unknown query is no longer a cold key. The smoke, the discoverability check and the production perf spec now use a real `month` far from today, 2000-01 to 2099-12 (`lib/summary-cold-month.ts`) when they need a cache entry nobody has used, and the smoke additionally asserts that an ignored query is answered by the same cached body.

Limits, stated plainly:

- `date` and `month` are real, response-changing conditions, so each distinct valid value is still its own entry and can still reach D1. This closes trivial and accidental cache misses; it is not a rate limit and does not make heavy request volume safe.
- Only the exact path `/api/live/summary` is routed to the cached entrypoint. Path variants (a trailing slash, a doubled slash, an encoded path) are not served from this cache at all, and this change does not alter that.
- A request that carries an `Authorization` header is bypassed by Workers Cache according to Cloudflare's documentation, which recommends dropping it in the outer entrypoint. The gateway now drops that one header before the cached call (the route is public and reads no header). This rests on the documentation, not on a measurement of this edge; the site smoke logs the result (`authorizationHeader`) without failing on it.
- The reduction is valid only while the route reads nothing but `date` and `month`. `tests/summary-cache-key.test.mjs` fails if the route starts reading another query parameter, a header or a Cloudflare property, so the key rule is updated together with the route.
- The behaviour of Workers Caching itself (MISS/HIT, per-version entries) was read from Cloudflare's documentation and confirmed by the production smoke, not emulated locally; the deployed Site Smoke run is the check that the sharing works on the real edge (`a query the route ignores shares the cached summary`).
- Cloudflare-account settings (a rate-limiting rule for `/api/*`) remain an owner action that needs account permission and approval; none was changed here.
