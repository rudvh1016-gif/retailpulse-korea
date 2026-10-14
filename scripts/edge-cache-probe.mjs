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
