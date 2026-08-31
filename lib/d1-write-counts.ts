/**
 * Two different D1 numbers, kept separate because they answer different
 * questions and were previously conflated under one "changed writes" label.
 *
 * `changedRows` is SQLite changes(): how many logical records an UPSERT
 * actually altered, which is the evidence for changed-only semantic writes.
 * `storageWrites` is D1's `rows_written`, which counts the table row AND
 * every index write, and is the free-tier billing metric.
 *
 * They differ by each table's index count: Production A5 run 33344958504
 * reported 3312 for 828 logical rows because airport_passenger_forecast
 * carries a primary key plus two indexes — 4 storage writes per row.
 */
export interface D1WriteCounts {
  changedRows: number;
  storageWrites: number;
}

export const NO_D1_WRITES: D1WriteCounts = { changedRows: 0, storageWrites: 0 };

/** Operational detail always reports both, so neither meaning is lost. */
export function describeWrites(counts: D1WriteCounts): string {
  return `changed rows ${counts.changedRows}; storage writes ${counts.storageWrites}`;
}

/** Single batching implementation shared by every collector's persist path. */
export async function runD1Batches(db: D1Database, statements: D1PreparedStatement[]): Promise<D1WriteCounts> {
  const totals: D1WriteCounts = { changedRows: 0, storageWrites: 0 };
  for (let offset = 0; offset < statements.length; offset += 40) {
    const results = await db.batch(statements.slice(offset, offset + 40));
    for (const result of results) {
      totals.changedRows += Number(result.meta?.changes ?? 0);
      totals.storageWrites += Number(result.meta?.rows_written ?? 0);
    }
  }
  return totals;
}
