/** Offline recovery evidence shared by drills. No production dispatch, binding or notification. */
import { observeQuota } from './quota-observation';

export function capacitySignal(detail: string): 'CAPACITY_EXHAUSTED' | 'UNKNOWN' {
  return /(?:D1_(?:HTTP_\d+|QUERY_FAILED)_7500_EXCEEDED_MAXIMUM_DB_SIZE|d1_storage_capacity_blocked)(?:_|\b)/i.test(detail)
    ? 'CAPACITY_EXHAUSTED' : 'UNKNOWN';
}

export interface RecoveryEvidence {
  now: number;
  expectedKeys: readonly string[];
  stored: readonly { key: string; at: string }[];
  published: readonly { key: string; at: string }[];
  maxAgeMs: number;
  successfulRuns: number;
  storageBlocked: boolean;
}
/** Pass event/issuance times, never a response generatedAt or a forecast target time. */
export function recoveryEvidence(input: RecoveryEvidence) {
  if (input.storageBlocked) return 'PERSISTENCE_FAILED';
  const expected = new Set(input.expectedKeys);
  const complete = (rows: RecoveryEvidence['stored']) => expected.size > 0
    && rows.length === expected.size && new Set(rows.map(row => row.key)).size === expected.size
    && rows.every(row => expected.has(row.key));
  if (!complete(input.stored) || !complete(input.published)) return 'PARTIAL_DATA';
  if (!Number.isFinite(input.now) || !Number.isFinite(input.maxAgeMs) || input.maxAgeMs <= 0
    || input.stored.some(row => !Number.isFinite(Date.parse(row.at))
      || Date.parse(row.at) > input.now || input.now - Date.parse(row.at) > input.maxAgeMs)) return 'STALE';
  const published = new Map(input.published.map(row => [row.key, row.at]));
  if (input.stored.some(row => Date.parse(published.get(row.key) ?? '') !== Date.parse(row.at))) return 'PUBLICATION_MISMATCH';
  return Number.isInteger(input.successfulRuns) && input.successfulRuns >= 2 ? 'RECOVERED' : 'RECOVERY_PENDING';
}

/** Supply only official REST file_size / query size_after observations here.
 * Row counts and the historical table-byte allocation estimates are different evidence. */
export function storageTrend(points: readonly { at: string; bytes: number }[], limit: number) {
  const valid = points.filter(point => Number.isFinite(Date.parse(point.at)) && Number.isSafeInteger(point.bytes) && point.bytes >= 0);
  const latest = valid.at(-1);
  const verdict = observeQuota({ resource: 'd1_storage', used: latest?.bytes ?? null, limit,
    basis: latest ? 'OFFICIAL_USAGE' : 'UNKNOWN', measurementSource: latest ? 'official_size_bytes' : null });
  const previous = valid.at(-2);
  const elapsed = latest && previous ? Date.parse(latest.at) - Date.parse(previous.at) : 0;
  const bytesPerDay = latest && previous && elapsed > 0 && latest.bytes >= previous.bytes
    ? (latest.bytes - previous.bytes) * 86400000 / elapsed : null;
  return { ...verdict, bytesPerDay, trendBasis: bytesPerDay === null ? 'UNAVAILABLE' : 'INTERNAL_ESTIMATE' };
}

/** Caller persists next in existing evidence artifacts, not in the exhausted DB.
 * This function neither sends a message nor changes any channel or permission. */
export function notificationTransition(prior: Readonly<Record<string, string>>, resource: string, state: string) {
  return { notify: prior[resource] !== state, next: { ...prior, [resource]: state } };
}
