/** Candidate only. Explicit two-read composition, not SQL routing and not bound in production.
 * Callers must bound/index both reads, then apply their real product reduction once.
 * Cross-DB joins/transactions do not exist; never split a trigger or FK group. */
export function overlayRows<T>(archive: readonly T[], active: readonly T[], key: (row: T) => string,
  immutableEqual?: (a: T, b: T) => boolean): T[] {
  const result = new Map<string, T>();
  for (const row of archive) {
    const id = key(row);
    if (result.has(id)) throw new Error('duplicate_archive_identity');
    result.set(id, row);
  }
  const seen = new Set<string>();
  for (const row of active) {
    const id = key(row);
    if (seen.has(id)) throw new Error('duplicate_active_identity');
    seen.add(id);
    const old = result.get(id);
    if (old && immutableEqual && !immutableEqual(old, row)) throw new Error('immutable_overlay_conflict');
    result.set(id, row);
  }
  return [...result.values()];
}

export interface SnapshotRow { key: string; issuedAt: string; value: number }
/** Completeness is caller-declared from the source contract, never inferred from received rows.
 * Target timestamps must NOT be passed as issuedAt. Failed/partial refresh never calls persist.
 * Atomic persistence belongs to one ACTIVE database transaction (including manifest/health).
 */
export async function promoteSnapshot(input: { expected: readonly string[]; rows: readonly SnapshotRow[];
  now: number; maxAgeMs: number; persist: (rows: readonly SnapshotRow[]) => Promise<void> }) {
  const expected = new Set(input.expected), keys = new Set(input.rows.map(row => row.key));
  if (!expected.size || input.expected.length !== expected.size || input.rows.length !== expected.size
    || keys.size !== expected.size || input.rows.some(row => !expected.has(row.key))) return 'PARTIAL_DATA';
  const times = new Set(input.rows.map(row => row.issuedAt));
  if (!Number.isFinite(input.now) || !Number.isFinite(input.maxAgeMs) || input.maxAgeMs <= 0 || times.size !== 1
    || input.rows.some(row => !Number.isFinite(row.value) || row.value < 0 || !Number.isFinite(Date.parse(row.issuedAt))
      || Date.parse(row.issuedAt) > input.now || input.now - Date.parse(row.issuedAt) > input.maxAgeMs)) return 'INVALID_PAYLOAD';
  try { await input.persist(input.rows); return 'PROMOTED'; }
  catch { return 'PERSISTENCE_FAILED'; }
}
