import { createA4D1Stores } from './a4-overflow-d1-adapter';

/** Prune only history older than both the retention window and an already
 * published pointer. A pointer can advance but never roll back to that history. */
export async function pruneA4Overflow(primary: D1Database, overflow: D1Database, now: Date) {
  const stores = createA4D1Stores({primary,overflow});
  const cutoff = new Date(now.getTime() - 45 * 24 * 60 * 60_000).toISOString();
  let removed = 0;
  for (const terminal of ['T1','T2'] as const) {
    const pointer = await stores.primary.get(terminal);
    if (!pointer) continue;
    const before = pointer.observedAt < cutoff ? pointer.observedAt : cutoff;
    const result = await overflow.prepare(`DELETE FROM a4_generation WHERE digest IN (
      SELECT digest FROM a4_generation WHERE terminal=? AND observed_at<? AND digest<>?
      ORDER BY observed_at LIMIT 125)`).bind(terminal,before,pointer.digest).run();
    const changes=result.meta?.changes;
    if (!result.success || typeof changes!=='number' || changes<0) throw new Error('a4_retention_unverified');
    removed += changes;
  }
  return removed;
}
