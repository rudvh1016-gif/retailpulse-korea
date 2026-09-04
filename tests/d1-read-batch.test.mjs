import assert from "node:assert/strict";
import test from "node:test";

import { readGroups } from "../lib/d1-read-batch.ts";

/**
 * A counting D1 double. Every `all()` on a statement and every `batch()` on
 * the client is one Worker → D1 round trip, which is the only cost this
 * module exists to bound.
 */
function makeClient({ failing = [] } = {}) {
  const trips = [];
  const client = {
    prepare(sql) {
      return {
        sql,
        async all() {
          trips.push({ kind: "all", sql });
          if (failing.includes(sql)) throw new Error(`boom: ${sql}`);
          return { results: [{ sql }] };
        },
      };
    },
    async batch(statements) {
      trips.push({ kind: "batch", count: statements.length });
      const broken = statements.find((statement) => failing.includes(statement.sql));
      if (broken) throw new Error(`batch rejected by ${broken.sql}`);
      return statements.map((statement) => ({ results: [{ sql: statement.sql }] }));
    },
  };
  return { client, trips };
}

test("every group leaves in one batch and comes back split per group, in order", async () => {
  const { client, trips } = makeClient();
  const result = await readGroups(client, {
    sources: [client.prepare("s")],
    realtime: [client.prepare("r")],
    probes: [client.prepare("p1"), client.prepare("p2"), client.prepare("p3")],
    tail: [client.prepare("t")],
  });
  assert.equal(result.mode, "batch");
  assert.equal(result.roundTrips, 1);
  assert.deepEqual(trips, [{ kind: "batch", count: 6 }], "exactly one D1 request for the whole read path");
  assert.deepEqual(result.rows.sources, [{ sql: "s" }]);
  assert.deepEqual(result.rows.realtime, [{ sql: "r" }]);
  assert.deepEqual(result.rows.probes, [{ sql: "p1" }, { sql: "p2" }, { sql: "p3" }]);
  assert.deepEqual(result.rows.tail, [{ sql: "t" }]);
});

test("a rejected batch isolates the broken group and keeps every other group's rows", async () => {
  // D1 batches are atomic: one bad statement rejects the whole batch. The old
  // route's safeAll turned that one statement into an empty list and kept the
  // page up; the fallback must do exactly that and nothing less.
  const { client, trips } = makeClient({ failing: ["broken"] });
  const result = await readGroups(client, {
    sources: [client.prepare("s")],
    broken: [client.prepare("broken")],
    probes: [client.prepare("p1"), client.prepare("p2")],
  });
  assert.equal(result.mode, "isolated");
  assert.deepEqual(result.rows.sources, [{ sql: "s" }], "a healthy single statement still answers");
  assert.deepEqual(result.rows.broken, [], "the broken statement becomes an empty list, never a thrown page");
  assert.deepEqual(result.rows.probes, [{ sql: "p1" }, { sql: "p2" }], "a healthy multi-statement group is re-read as its own batch");
  assert.equal(trips[0].kind, "batch", "the single batch is always tried first");
  assert.equal(trips[0].count, 4);
  // The fallback is one concurrent wave — one request per group — never the
  // old serial chain of awaits.
  assert.equal(result.roundTrips, 1 + 3);
  assert.deepEqual(trips.slice(1).map((trip) => trip.kind).sort(), ["all", "all", "batch"]);
});

test("a broken multi-statement group in the fallback becomes an empty list on its own", async () => {
  const { client } = makeClient({ failing: ["p2"] });
  const result = await readGroups(client, {
    sources: [client.prepare("s")],
    probes: [client.prepare("p1"), client.prepare("p2")],
  });
  assert.equal(result.mode, "isolated");
  assert.deepEqual(result.rows.sources, [{ sql: "s" }]);
  assert.deepEqual(result.rows.probes, []);
});

test("a short batch answer is treated as a failure rather than misaligned rows", async () => {
  const { client } = makeClient();
  client.batch = async () => [{ results: [{ sql: "only-one" }] }];
  const result = await readGroups(client, {
    a: [client.prepare("a")],
    b: [client.prepare("b")],
  });
  // The fallback re-reads singles through all(), which the double still serves.
  assert.equal(result.mode, "isolated");
  assert.deepEqual(result.rows.a, [{ sql: "a" }]);
  assert.deepEqual(result.rows.b, [{ sql: "b" }]);
});

test("no statements means no request at all", async () => {
  const { client, trips } = makeClient();
  const result = await readGroups(client, {});
  assert.deepEqual(trips, []);
  assert.equal(result.roundTrips, 0);
});
