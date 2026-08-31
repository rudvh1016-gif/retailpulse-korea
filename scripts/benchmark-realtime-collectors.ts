/**
 * Free-tier CPU benchmark for the REALTIME group (A4-T1, A4-T2, S1).
 *
 * docs/ZERO_COST_HYBRID_AUDIT.md gate D.5 forbids enabling any Worker Cron
 * before a real benchmark, because Workers Free allows only 10 ms CPU per
 * Cron invocation. This runs the ACTUAL production collectors — not a
 * reimplementation — against production-shaped fixtures with a counting
 * no-op D1, so the measurement covers the same normalization, SHA-256 and
 * statement-building work a Worker Cron would perform.
 *
 * ZERO provider calls: globalThis.fetch is stubbed. ZERO D1 writes.
 *
 * CPU is measured with process.cpuUsage() (user+system), which excludes
 * time blocked on I/O and is therefore the closest Node-side analogue of
 * Cloudflare's CPU accounting. It is a MEASURED_LOCAL value, not
 * OFFICIAL_USAGE: only Cloudflare can report真 production Worker CPU.
 */
import {
  collectAirportCongestion,
  collectAirportCongestionT2,
  collectSeoulRealtime,
} from "../lib/collector";

/** Seoul publishes a 24-entry hourly forecast per area; the test fixture's 2 is not production-shaped. */
const S1_FORECAST_ENTRIES = 24;
/** A4-T1 requests numOfRows=50 for terminal P01. */
const A4_T1_ROWS = 50;
/** A4-T2 requests numOfRows=20 and may walk up to 3 pages. */
const A4_T2_ROWS_PER_PAGE = 20;
const A4_T2_PAGES = 3;

function seoulPayload(areaCode: string) {
  return {
    "SeoulRtd.citydata_ppltn": [{
      AREA_NM: "명동 관광특구", AREA_CD: areaCode,
      AREA_CONGEST_LVL: "약간 붐빔",
      AREA_CONGEST_MSG: "사람이 몰려있을 가능성이 크고 위치에 따라 붐빔이 느껴질 수 있어요.",
      AREA_PPLTN_MIN: "34000", AREA_PPLTN_MAX: "36000",
      MALE_PPLTN_RATE: "45.1", FEMALE_PPLTN_RATE: "54.9",
      RESNT_PPLTN_RATE: "20.5", NON_RESNT_PPLTN_RATE: "79.5",
      REPLACE_YN: "N", PPLTN_TIME: "2026-08-31 09:55", FCST_YN: "Y",
      FCST_PPLTN: Array.from({ length: S1_FORECAST_ENTRIES }, (_, index) => ({
        FCST_TIME: `2026-08-31 ${String(index).padStart(2, "0")}:00`,
        FCST_CONGEST_LVL: "보통", FCST_PPLTN_MIN: "30000", FCST_PPLTN_MAX: "32000",
      })),
    }],
    RESULT: { "RESULT.CODE": "INFO-000", "RESULT.MESSAGE": "정상 처리되었습니다." },
  };
}

function congestionPayload(terminalId: string, rows: number, totalCount: number) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
      body: {
        totalCount,
        items: Array.from({ length: rows }, (_, index) => ({
          terminalId,
          gateId: `DG${(index % 6) + 1}_${String.fromCharCode(65 + (index % 4))}`,
          waitTime: String(5 + (index % 55)),
          waitLength: String(10 + (index % 90)),
          occurtime: "202608311000",
          operatingTime: "05:00~22:00",
        })),
      },
    },
  };
}

/** Counts statements and reports D1-shaped meta without touching a database. */
class CountingD1 {
  statements = 0;
  batches = 0;
  prepare() {
    const statement = {
      bind: () => statement,
      run: async () => ({ success: true, meta: { changes: 1, rows_written: 1 }, results: [] }),
    };
    return statement as never;
  }
  async batch(list: unknown[]) {
    this.batches += 1;
    this.statements += list.length;
    return list.map(() => ({ success: true, meta: { changes: 1, rows_written: 1 } })) as never;
  }
}

interface Measurement {
  source: string;
  status: string;
  cpuMicros: number;
  wallMillis: number;
  statements: number;
  providerCalls: number;
}

async function measure(source: string, run: (db: CountingD1) => Promise<{ status: string }>, providerCalls: () => number): Promise<Measurement> {
  const db = new CountingD1();
  const before = process.cpuUsage();
  const startedAt = performance.now();
  const result = await run(db);
  const cpu = process.cpuUsage(before);
  return {
    source,
    status: result.status,
    cpuMicros: cpu.user + cpu.system,
    wallMillis: Number((performance.now() - startedAt).toFixed(2)),
    statements: db.statements,
    providerCalls: providerCalls(),
  };
}

let providerCallCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  providerCallCount += 1;
  const url = String(input);
  const body = url.includes("openapi.seoul.go.kr")
    ? seoulPayload("POI003")
    : url.includes("statusOfDepartureCongestionT2")
      ? congestionPayload("P03", A4_T2_ROWS_PER_PAGE, A4_T2_ROWS_PER_PAGE * A4_T2_PAGES)
      : congestionPayload("P01", A4_T1_ROWS, A4_T1_ROWS);
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const env = { DATA_GO_KR_SERVICE_KEY: "benchmark-key", SEOUL_OPEN_DATA_KEY: "benchmark-key" };
const SOURCES = [
  ["airport_congestion", (db: CountingD1) => collectAirportCongestion({ ...env, DB: db as never })],
  ["airport_congestion_t2", (db: CountingD1) => collectAirportCongestionT2({ ...env, DB: db as never })],
  ["seoul_realtime", (db: CountingD1) => collectSeoulRealtime({ ...env, DB: db as never })],
] as const;

/**
 * The first iteration carries module warm-up and JIT cost, which a cold
 * Worker isolate also pays. Later iterations approximate a warm isolate.
 * Both are reported so neither figure can be cherry-picked.
 */
const ITERATIONS = 12;
const rounds: Measurement[][] = [];
for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
  const round: Measurement[] = [];
  for (const [source, run] of SOURCES) {
    const before = providerCallCount;
    round.push(await measure(source, run, () => providerCallCount - before));
  }
  rounds.push(round);
}
globalThis.fetch = originalFetch;

const OFFICIAL_CRON_CPU_LIMIT_MS = 10;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const roundCpuMs = (round: Measurement[]) => round.reduce((sum, m) => sum + m.cpuMicros, 0) / 1000;

const coldMs = Number(roundCpuMs(rounds[0]).toFixed(3));
const warmRounds = rounds.slice(1);
const warmMedianMs = Number(median(warmRounds.map(roundCpuMs)).toFixed(3));
const warmMinMs = Number(Math.min(...warmRounds.map(roundCpuMs)).toFixed(3));
const warmMaxMs = Number(Math.max(...warmRounds.map(roundCpuMs)).toFixed(3));

const perSource = SOURCES.map(([source], index) => {
  const warm = warmRounds.map((round) => round[index].cpuMicros / 1000);
  const first = rounds[0][index];
  return {
    source,
    status: first.status,
    statements: first.statements,
    providerCalls: first.providerCalls,
    coldCpuMillis: Number((first.cpuMicros / 1000).toFixed(3)),
    warmMedianCpuMillis: Number(median(warm).toFixed(3)),
  };
});

console.log(JSON.stringify({
  benchmark: "realtime-worker-cron-cpu",
  runtime: `node ${process.version}`,
  measurementClass: "MEASURED_LOCAL",
  note: "Node CPU on this runner. Cloudflare production Worker CPU is BLOCKED (no account access from this environment).",
  officialLimit: { source: "Cloudflare Workers Free", cronCpuMs: OFFICIAL_CRON_CPU_LIMIT_MS, subrequestsPerInvocation: 50 },
  fixtureShape: { a4t1Rows: A4_T1_ROWS, a4t2RowsPerPage: A4_T2_ROWS_PER_PAGE, a4t2Pages: A4_T2_PAGES, s1Areas: 3, s1ForecastEntries: S1_FORECAST_ENTRIES },
  iterations: ITERATIONS,
  perSource,
  totals: {
    coldCpuMillis: coldMs,
    warmMedianCpuMillis: warmMedianMs,
    warmMinCpuMillis: warmMinMs,
    warmMaxCpuMillis: warmMaxMs,
    statementsPerInvocation: rounds[0].reduce((sum, m) => sum + m.statements, 0),
    providerCallsPerInvocation: rounds[0].reduce((sum, m) => sum + m.providerCalls, 0),
    warmMedianBudgetPercent: Number(((warmMedianMs / OFFICIAL_CRON_CPU_LIMIT_MS) * 100).toFixed(1)),
    coldBudgetPercent: Number(((coldMs / OFFICIAL_CRON_CPU_LIMIT_MS) * 100).toFixed(1)),
  },
  verdict: warmMedianMs > OFFICIAL_CRON_CPU_LIMIT_MS ? "FAIL" : "REVIEW",
}, null, 2));
