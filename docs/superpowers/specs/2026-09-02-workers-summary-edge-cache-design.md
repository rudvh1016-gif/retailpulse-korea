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
