// Read-only, secret-free evidence of how many D1-backed route executions a
// short burst of real client requests costs on the public site.
//
// Each answer carries the `generatedAt` of the execution that produced it, so
// the number of DISTINCT `generatedAt` values in a burst is the number of times
// the route ran (and read D1); repeats of one value were served from the shared
// edge copy. The flight request is sent exactly as app/flights-client.ts sends
// it: `?date=<today>&_day=<today>` with fetch's `cache: "no-cache"` headers.
// The summary, edge-cached since September, is the control.
//
// A second pass repeats each request three times at the clients' own polling
// interval (flights every 120 s; the summary every 120 s while any source is in
// error, else 300 s; 125 s is used here) to show what ONE open screen costs
// when no other visitor shares the edge copy.
//
// Usage: node scripts/edge-cache-probe.mjs https://koretaildata.com
const origin = (process.argv[2] ?? "https://koretaildata.com").replace(/\/$/, "");
const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const REQUESTS = 6;
const GAP_MS = 5_000;
const targets = [
  { name: "flights", url: `${origin}/api/live/flights?date=${day}&_day=${day}`, headers: { accept: "application/json", "cache-control": "max-age=0", pragma: "no-cache" } },
  { name: "summary", url: `${origin}/api/live/summary`, headers: { accept: "application/json" } },
];
for (const target of targets) {
  const generations = new Map();
  for (let index = 0; index < REQUESTS; index++) {
    const started = Date.now();
    let row;
    try {
      const response = await fetch(target.url, { headers: target.headers });
      const body = await response.json().catch(() => null);
      const generatedAt = typeof body?.generatedAt === "string" ? body.generatedAt : null;
      generations.set(generatedAt, (generations.get(generatedAt) ?? 0) + 1);
      row = { status: response.status, cfCacheStatus: response.headers.get("cf-cache-status"), age: response.headers.get("age"),
        cacheControl: response.headers.get("cache-control"), mode: body?.mode ?? null, generatedAt };
      // What decides an open page's summary re-check (app/live-summary.tsx summaryRecheckDelay):
      // A5 coverage for both directions and the sources in ERROR/DEGRADED/MISSING.
      if (target.name === "summary" && index === 0) console.log(JSON.stringify({ probe: "summary-recheck-inputs",
        forecastCoverage: body?.airport?.forecastCoverage?.all ?? null,
        arrivalForecastCoverage: body?.airport?.arrivalForecast?.forecastCoverage?.all ?? null,
        problemSources: (body?.sources ?? []).filter((source) => ["ERROR", "DEGRADED", "MISSING"].includes(source?.status))
          .map((source) => `${source.sourceId}:${source.status}`) }));
    } catch (error) {
      row = { error: String(error?.message ?? error).replace(/[^\w .:-]+/g, "_").slice(0, 120) };
    }
    console.log(JSON.stringify({ probe: "edge-cache", target: target.name, index, ms: Date.now() - started, ...row }));
    if (index < REQUESTS - 1) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }
  const distinct = [...generations.keys()].filter(Boolean);
  console.log(JSON.stringify({ probe: "edge-cache-burst", target: target.name, requests: REQUESTS, gapMs: GAP_MS,
    routeExecutions: distinct.length, unreadable: generations.get(null) ?? 0, generations: Object.fromEntries(generations) }));
}

const POLL_MS = 125_000;
// Both screens poll at the same time, as one open page does; about four minutes in total.
await Promise.all(targets.map(async (target) => {
  const generations = new Map();
  for (let index = 0; index < 3; index++) {
    if (index) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    try {
      const response = await fetch(target.url, { headers: target.headers });
      const body = await response.json().catch(() => null);
      const generatedAt = typeof body?.generatedAt === "string" ? body.generatedAt : null;
      generations.set(generatedAt, (generations.get(generatedAt) ?? 0) + 1);
      console.log(JSON.stringify({ probe: "edge-cache-poll", target: target.name, index, status: response.status,
        cfCacheStatus: response.headers.get("cf-cache-status"), age: response.headers.get("age"), generatedAt }));
    } catch (error) {
      console.log(JSON.stringify({ probe: "edge-cache-poll", target: target.name, index, error: String(error?.message ?? error).replace(/[^\w .:-]+/g, "_").slice(0, 120) }));
    }
  }
  console.log(JSON.stringify({ probe: "edge-cache-poll-summary", target: target.name, polls: 3, pollMs: POLL_MS,
    routeExecutions: [...generations.keys()].filter(Boolean).length }));
}));
