/**
 * One D1 round trip for a whole read path.
 *
 * Production, 2026-09-04 (site-smoke run 33836136846): an uncached
 * `/api/live/summary` took 3.5–4.2 s while the same payload served from the
 * edge cache took ~65 ms, and the read-budget diagnostic showed the entire
 * path reading ~2,500 indexed rows. The rows were never the cost. The route
 * awaited 18 D1 calls one after another — 15 single statements and three
 * 21-statement probe batches — and each call is a full Worker → D1 round
 * trip. At the ~200 ms a round trip costs from the edge, 18 in sequence is
 * the whole 3.6 s. The page showed "확인 불가" for exactly that long before
 * the numbers arrived.
 *
 * `readGroups` sends every statement of every group in ONE `batch()`. D1
 * executes a batch sequentially inside one request, so the cost is one round
 * trip plus the same per-statement work as before; rows read are unchanged.
 *
 * The isolation the route relied on is kept, just moved: a D1 batch is
 * atomic and rejects as a whole if any statement fails, so on a rejected
 * batch each group is re-read on its own, concurrently, with the failing
 * group becoming an empty list exactly as `safeAll` made it before. The
 * happy path is one round trip; the broken-statement path is one failed
 * round trip plus one concurrent wave, never the old serial chain.
 */

export type ReadRow = Record<string, unknown>;

/** The slice of a D1 prepared statement a read needs. */
export interface ReadStatement {
  all<T = ReadRow>(): Promise<{ results?: T[] }>;
}

/** The slice of a D1 database a batched read needs. */
export interface ReadClient {
  batch<T = ReadRow>(statements: ReadStatement[]): Promise<Array<{ results?: T[] }>>;
}

export interface ReadGroupsResult<K extends string> {
  rows: Record<K, ReadRow[]>;
  /** How the rows were obtained; tests and diagnostics read this. */
  mode: "batch" | "isolated";
  /** D1 requests actually issued, so a regression back to a chain is visible. */
  roundTrips: number;
  statementsAttempted: number;
  failedGroups: K[];
  skippedGroups: K[];
}

async function readGroupIsolated(client: ReadClient, statements: ReadStatement[]): Promise<{ rows: ReadRow[]; failed: boolean }> {
  // Each group fails independently: one broken table or statement must never
  // take down the whole response.
  try {
    if (!statements.length) return { rows: [], failed: false };
    if (statements.length === 1) return { rows: (await statements[0].all<ReadRow>()).results ?? [], failed: false };
    const results = await client.batch<ReadRow>(statements);
    if (results.length !== statements.length) throw new Error('batch result count mismatch');
    return { rows: results.flatMap((result) => result.results ?? []), failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}

export async function readGroups<K extends string>(
  client: ReadClient,
  groups: Record<K, ReadStatement[]>,
  options: { maxStatements?: number } = {},
): Promise<ReadGroupsResult<K>> {
  const names = Object.keys(groups) as K[];
  const flat = names.flatMap((name) => groups[name]);
  const maxStatements = options.maxStatements ?? Number.POSITIVE_INFINITY;
  let statementsAttempted = 0;
  let roundTrips = 0;
  const failedGroups: K[] = [];
  const skippedGroups: K[] = [];

  if (flat.length > 0 && flat.length <= maxStatements) {
    try {
      statementsAttempted += flat.length;
      roundTrips += 1;
      const results = await client.batch<ReadRow>(flat);
      if (results.length !== flat.length) throw new Error("batch result count mismatch");
      const rows = {} as Record<K, ReadRow[]>;
      let cursor = 0;
      for (const name of names) {
        const count = groups[name].length;
        rows[name] = results.slice(cursor, cursor + count).flatMap((result) => result.results ?? []);
        cursor += count;
      }
      return { rows, mode: "batch", roundTrips, statementsAttempted, failedGroups, skippedGroups };
    } catch {
      // Fall through to the isolated read below.
    }
  }

  const entries = await Promise.all(names.map(async (name) => {
    const count = groups[name].length;
    if (statementsAttempted + count > maxStatements) {
      skippedGroups.push(name);
      return [name, []] as const;
    }
    // Reserve synchronously before the concurrent wave. Count every statement
    // in a rejected batch conservatively, not just rows returned or requests.
    statementsAttempted += count;
    if (count) roundTrips += 1;
    const result = await readGroupIsolated(client, groups[name]);
    if (result.failed) failedGroups.push(name);
    return [name, result.rows] as const;
  }));
  const rows = Object.fromEntries(entries) as Record<K, ReadRow[]>;
  return { rows, mode: "isolated", roundTrips, statementsAttempted, failedGroups, skippedGroups };
}
