import { A1_RECOVERY_WORKFLOW, A1_SOURCE } from './airport-midnight-recovery';
import { isValidKstDay, kstDayOf } from './kst';
import type { OperationalMemory } from './operational-memory';

// Diagnostic only: 30 minutes exceeds the current reusable collector's timeout.
// A receipt proves only that collection was about to start, not that it finished.
const STALE_RECEIPT_MINUTES = 30;

export async function observeAirportA1Locks(
  memory: Pick<OperationalMemory, 'readOpenControlledAttemptMetadata'>, nowIso: string,
) {
  try {
    const now = Date.parse(nowIso);
    if (!Number.isFinite(now)) return { state: 'UNAVAILABLE' } as const;
    const today = kstDayOf(nowIso);
    const rows = await memory.readOpenControlledAttemptMetadata(A1_SOURCE, A1_RECOVERY_WORKFLOW);
    if (!rows.length) return { state: 'NONE' } as const;
    const ages = rows.map(row => Math.floor((now - Date.parse(row.startedAt)) / 60_000));
    if (rows.some((row, i) => !isValidKstDay(row.targetDate) || row.targetDate > today ||
      !Number.isFinite(ages[i]) || ages[i] < 0)) return { state: 'UNAVAILABLE' } as const;
    return { state: 'OPEN', open: rows.length,
      sameDay: rows.filter(row => row.targetDate === today).length,
      priorDay: rows.filter(row => row.targetDate < today).length,
      receipted: rows.filter(row => row.receipted).length,
      staleReceipted: rows.filter((row, i) => row.receipted && ages[i] >= STALE_RECEIPT_MINUTES).length,
      oldestAgeMinutes: Math.max(...ages), terminalState: 'UNVERIFIED',
    } as const;
  } catch {
    return { state: 'UNAVAILABLE' } as const;
  }
}
