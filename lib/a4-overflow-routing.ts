/** Isolated routing policy. Not a production feature flag or runtime integration. */
type Terminal = 'T1' | 'T2';
type Candidate = { terminal: string; zone: string | number; observedAt: string; sourceId: string };
type Read<T> = { state: 'disabled' | 'error' } | { state: 'ok'; rows: readonly T[] };
const source = {
  T1: 'INCHEON_DEPARTURE_CONGESTION',
  T2: 'INCHEON_DEPARTURE_CONGESTION_T2',
};

export function a4Instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const local = value.slice(0,10);
  const day = new Date(local + 'T00:00:00Z');
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0,10) !== local) return NaN;
  return Date.parse(value);
}

export function selectA4WriteTarget(
  config: { mode?: string; schemaReady?: boolean; cutoverAt?: string },
  terminal: Terminal, rows: readonly Candidate[],
): 'primary' | 'overflow' {
  if (!config.mode || config.mode === 'disabled') return 'primary';
  if (config.mode !== 'enabled') throw new Error('a4_overflow_invalid_mode');
  const cutover = a4Instant(config.cutoverAt ?? '');
  if (!config.schemaReady || !Number.isFinite(cutover)) throw new Error('a4_overflow_not_ready');
  if (!rows.length) throw new Error('a4_overflow_empty_write');
  for (const row of rows) {
    if (row.terminal !== terminal || row.sourceId !== source[terminal]) throw new Error('a4_overflow_wrong_source');
    const time = a4Instant(row.observedAt);
    if (!Number.isFinite(time)) throw new Error('a4_overflow_invalid_timestamp');
    if (time < cutover) throw new Error('a4_overflow_before_cutover');
  }
  return 'overflow';
}

function validate(terminal: Terminal, rows: readonly Candidate[]): number | null {
  if (!rows.length) return null;
  const time = a4Instant(rows[0].observedAt);
  const seen = new Set<string>();
  if (!Number.isFinite(time)) return NaN;
  for (const row of rows) {
    const zone = String(row.zone);
    if (row.terminal !== terminal || row.sourceId !== source[terminal]
      || a4Instant(row.observedAt) !== time || !zone.trim() || seen.has(zone)) return NaN;
    seen.add(zone);
  }
  return time;
}

/**
 * Overflow candidates must have been verified against the exact committed primary
 * pointer and immutable manifest by the caller. Do not pass an unverified MAX query.
 * Freshness/partial coverage are not inferred or upgraded by this selection.
 */
export function selectA4Generation<T extends Candidate>(
  terminal: Terminal, primary: readonly T[], overflow: Read<T>,
): { source: 'primary' | 'overflow' | 'none'; rows: readonly T[]; degraded: boolean } {
  const primaryTime = validate(terminal, primary);
  const overflowTime = overflow.state === 'ok' ? validate(terminal, overflow.rows) : null;
  const primaryGood = primaryTime !== null && Number.isFinite(primaryTime);
  const degraded = overflow.state === 'error' || Number.isNaN(primaryTime) || Number.isNaN(overflowTime);
  if (overflow.state === 'ok' && overflowTime !== null && Number.isFinite(overflowTime)
    && (!primaryGood || overflowTime > primaryTime)) {
    return { source: 'overflow', rows: overflow.rows, degraded };
  }
  return primaryGood ? { source: 'primary', rows: primary, degraded } : { source: 'none', rows: [], degraded };
}
