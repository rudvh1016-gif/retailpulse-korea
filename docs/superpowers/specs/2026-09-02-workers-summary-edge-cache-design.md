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

No custom cache key is used. Therefore `/api/live/summary`, `?date=2026-09-01`, and `?date=2026-09-02` are distinct keys.

## Admission and freshness

The existing 60-second fresh and 300-second stale-while-revalidate policy remains. A summary is cacheable only when the outer D1 path succeeded, source health is non-empty, and at least one core area has realtime or weather data. Degraded and outer-failure payloads return `Cache-Control: no-store` and cannot populate the edge cache. `/api/health` remains `no-store` and is never routed through the cached entrypoint.

## Verification

Regression tests cover production-only entrypoint configuration, exact summary routing, non-GET bypass, query-string preservation, and degraded `no-store` admission. Production smoke records repeated default and dated requests, requires an eventual HIT, compares `generatedAt`, and proves two explicit dates never cross-contaminate.
