import assert from "node:assert/strict";
import test from "node:test";
import {
  A1_TODAY_MAX_PAGES,
  A1_TODAY_PAGE_SIZE,
  collectAirportFlightsToday,
  fetchA1DeparturesForDate,
  kstDate,
} from "../lib/airport-today.ts";

function flight({
  flightId,
  masterFlightId = flightId,
  scheduleDatetime,
  codeshare = "N",
  terminalId = "P01",
}) {
  return {
    fid: `${flightId}-${scheduleDatetime}`,
    flightId,
    masterFlightId,
    codeshare,
    scheduleDatetime,
    estimatedDatetime: scheduleDatetime,
    terminalId,
    gateNumber: "29",
    chkinRange: "A01-A10",
    remark: "정상",
    airline: "KE",
    airport: "NRT",
  };
}

function pagePayload(items, totalCount) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
      // Real A1 currently returns body.items directly as an array.
      body: { items, totalCount },
    },
  };
}

test("A1 scan stores D-3 through today, excludes D+1, deduplicates codeshares, and adds no calls", async () => {
  const seen = [];
  const pages = new Map([
    [1, [
      flight({ flightId: "KE027", scheduleDatetime: "202608270900" }),
      flight({ flightId: "KE028", scheduleDatetime: "202608280900" }),
    ]],
    [2, [
      flight({ flightId: "KE029", scheduleDatetime: "202608290900" }),
      flight({ flightId: "KE200", scheduleDatetime: "202608301430" }),
      flight({ flightId: "DL9001", masterFlightId: "KE200", codeshare: "Y", scheduleDatetime: "202608301430" }),
      flight({ flightId: "OZ300", scheduleDatetime: "202608301700", terminalId: "P03" }),
    ]],
    [3, [flight({ flightId: "KE400", scheduleDatetime: "202608310800" })]],
  ]);

  const result = await fetchA1DeparturesForDate("fixture-key", "2026-08-30", async (url, options) => {
    seen.push({ url: new URL(url), options });
    const pageNo = Number(url.searchParams.get("pageNo"));
    return pagePayload(pages.get(pageNo) ?? [], 205);
  });

  assert.equal(A1_TODAY_PAGE_SIZE, 100);
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.totalCount, 205);
  assert.equal(result.windowStartDate, "2026-08-27");
  assert.equal(result.sourceRowsInRange, 6);
  assert.equal(result.sourceRowsForDate, 3);
  assert.equal(result.trackedToday, 2);
  assert.equal(result.records.length, 5);
  assert.deepEqual(result.records.map((record) => record.scheduledAt.slice(0, 10)).sort(), [
    "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-30",
  ]);
  assert.deepEqual(seen.map(({ url }) => url.searchParams.get("pageNo")), ["1", "2", "3"]);
  for (const { url, options } of seen) {
    assert.equal(url.searchParams.get("numOfRows"), "100");
    assert.equal(url.searchParams.get("type"), "json");
    assert.equal(url.searchParams.get("serviceKey"), "fixture-key");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["numOfRows", "pageNo", "serviceKey", "type"]);
    assert.deepEqual(options, { timeoutMs: 30_000, retries: 0 });
  }
});

class MemoryD1 {
  flights = new Map();

  prepare(sql) {
    return {
      bind: (...params) => ({
        sql,
        params,
        run: async () => ({ meta: { rows_written: 1 } }),
      }),
    };
  }

  async batch(statements) {
    return statements.map(({ params }) => {
      const physicalFlightId = params[20];
      const sourceHash = params[19];
      const previous = this.flights.get(physicalFlightId);
      if (previous?.sourceHash === sourceHash) return { meta: { rows_written: 0 } };
      this.flights.set(physicalFlightId, {
        physicalFlightId,
        scheduledAt: params[11],
        sourceHash,
      });
      return { meta: { rows_written: 1 } };
    });
  }
}

test("overlapping next-day import upserts recent flights and never deletes older history", async () => {
  const db = new MemoryD1();
  let calls = 0;
  const aug30 = [
    flight({ flightId: "KE027", scheduleDatetime: "202608270900" }),
    flight({ flightId: "KE028", scheduleDatetime: "202608280900" }),
    flight({ flightId: "KE029", scheduleDatetime: "202608290900" }),
    flight({ flightId: "KE030", scheduleDatetime: "202608301430" }),
    flight({ flightId: "DL9030", masterFlightId: "KE030", codeshare: "Y", scheduleDatetime: "202608301430" }),
    flight({ flightId: "KE031", scheduleDatetime: "202608310900" }),
  ];
  const aug31 = [
    flight({ flightId: "KE028", scheduleDatetime: "202608280900" }),
    flight({ flightId: "KE029", scheduleDatetime: "202608290900" }),
    flight({ flightId: "KE030", scheduleDatetime: "202608301430" }),
    flight({ flightId: "KE031", scheduleDatetime: "202608310900" }),
    flight({ flightId: "KE901", scheduleDatetime: "202609010900" }),
  ];
  const fetcher = async (_url, options) => {
    calls += 1;
    assert.deepEqual(options, { timeoutMs: 30_000, retries: 0 });
    return pagePayload(calls === 1 ? aug30 : aug31, calls === 1 ? aug30.length : aug31.length);
  };

  const first = await collectAirportFlightsToday(
    { DB: db, DATA_GO_KR_SERVICE_KEY: "fixture-key" },
    new Date("2026-08-30T03:00:00.000Z"),
    fetcher,
  );
  const second = await collectAirportFlightsToday(
    { DB: db, DATA_GO_KR_SERVICE_KEY: "fixture-key" },
    new Date("2026-08-31T03:00:00.000Z"),
    fetcher,
  );

  assert.equal(first.trackedToday, 1);
  assert.equal(second.trackedToday, 1);
  assert.equal(calls, 2);
  assert.deepEqual([...db.flights.values()].map((row) => row.scheduledAt.slice(0, 10)).sort(), [
    "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
  ]);
  assert.equal(db.flights.size, 5);
});

test("A1 today fallback refuses an unbounded population before requesting page 2", async () => {
  let calls = 0;
  await assert.rejects(
    fetchA1DeparturesForDate("fixture-key", "2026-08-30", async () => {
      calls += 1;
      return pagePayload([flight({ flightId: "KE100", scheduleDatetime: "202608270900" })], A1_TODAY_PAGE_SIZE * A1_TODAY_MAX_PAGES + 1);
    }),
    /a1_today_population_exceeds_bound/,
  );
  assert.equal(calls, 1);
});

test("A1 today fallback fails closed on an incomplete middle page", async () => {
  await assert.rejects(
    fetchA1DeparturesForDate("fixture-key", "2026-08-30", async (url) => {
      const pageNo = Number(url.searchParams.get("pageNo"));
      return pagePayload(pageNo === 1 ? [flight({ flightId: "KE100", scheduleDatetime: "202608270900" })] : [], 201);
    }),
    /a1_today_incomplete_page_2/,
  );
});

test("KST target date is computed independently of runner timezone", () => {
  assert.equal(kstDate(new Date("2026-08-29T15:01:00.000Z")), "2026-08-30");
});

test("A1 request budget counts every attempt, retries a page once, and aborts before exceeding the budget", async () => {
  const good = [flight({ flightId: "KE100", scheduleDatetime: "202608300900" })];
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 2) throw new Error("NETWORK_UND_ERR_CONNECT_TIMEOUT");
    return pagePayload(good, 150);
  };
  const noSleep = async () => {};
  // 150 rows -> 2 pages. Page 2's first attempt fails, its retry succeeds: 3 requests.
  const result = await fetchA1DeparturesForDate("fixture-key", "2026-08-30", flaky, { maxRequests: 3, sleep: noSleep });
  assert.equal(result.requestsIssued, 3);
  assert.equal(result.pagesFetched, 2);
  assert.equal(calls, 3);

  // The same scan with a budget of 2 must stop before issuing the third request.
  calls = 0;
  await assert.rejects(
    fetchA1DeparturesForDate("fixture-key", "2026-08-30", flaky, { maxRequests: 2, sleep: noSleep }),
    /a1_today_request_budget_2_page_2/,
  );
  assert.equal(calls, 2);

  // A page that fails twice is a real failure, not a third attempt.
  calls = 0;
  await assert.rejects(
    fetchA1DeparturesForDate("fixture-key", "2026-08-30", async () => { calls += 1; throw new Error("NETWORK_UND_ERR_CONNECT_TIMEOUT"); }, { sleep: noSleep }),
    /NETWORK_UND_ERR_CONNECT_TIMEOUT/,
  );
  assert.equal(calls, 2);
});


test("A1 does not retry permanent HTTP failures and records failure without touching last-good rows", async () => {
  const { SourceFetchError } = await import("../lib/source-adapters.ts");
  let calls = 0;
  const writes = [];
  const db = { prepare(sql) { return { bind(...values) { this.values = values; return this; }, async run() { writes.push({ sql, values: this.values }); return { success: true }; } }; } };
  const result = await collectAirportFlightsToday({ DB: db, DATA_GO_KR_SERVICE_KEY: "fixture-key" }, new Date("2026-09-05T01:00:00Z"), async () => { calls++; throw new SourceFetchError("HTTP", 401); });
  assert.equal(calls, 1);
  assert.equal(result.status, "ERROR");
  assert.equal(writes.length, 2);
  assert.ok(writes.some(x => x.sql.includes("INSERT INTO source_health") && x.values.includes("ERROR")));
  assert.ok(writes.every(x => !x.sql.includes("airport_flights")));
  assert.ok(writes.some(x => x.values.some(v => typeof v === "string" && v.includes("httpStatus=401"))));
});

test("A1 transient recovery waits twenty seconds without increasing its two-attempt bound", async () => {
  const { SourceFetchError } = await import("../lib/source-adapters.ts");
  const delays = []; let calls = 0;
  const result = await fetchA1DeparturesForDate("fixture-key", "2026-08-30", async () => {
    if (++calls === 1) throw new SourceFetchError("NETWORK", undefined, "UND_ERR_CONNECT_TIMEOUT");
    return pagePayload([flight({ flightId: "KE100", scheduleDatetime: "202608300900" })], 1);
  }, { sleep: async ms => { delays.push(ms); } });
  assert.equal(result.requestsIssued, 2);
  assert.deepEqual(delays, [20000]);
});
