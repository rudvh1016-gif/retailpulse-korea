/** Existing witness integration: read-only candidate, never HTTP dispatch/admission. */
import type { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { readAirportTodayCoverage, type airportTodayCoverage } from '../lib/airport-today-coverage';
import { OperationalMemory } from '../lib/operational-memory';
import { airportRequestBudgetAvailable } from '../lib/airport-request-budget';
import { airportMidnightSourceBlocked } from '../lib/airport-recovery-protection';
import { readAirportRunSnapshot } from '../lib/airport-midnight-recovery';
import { airportMidnightCandidate } from '../lib/airport-midnight-direct-recovery';

// Historical HTTP preparation remains ungranted and is no longer wired to production.
export const A1_RECOVERY_DISPATCH_PERMISSION_GRANTED = false;

export function airportMidnightReaders(db: CloudflareD1RestDatabase) {
  const database = db as unknown as D1Database;
  return {
    memory: new OperationalMemory(database),
    readCoverage: (nowIso: string) => readAirportTodayCoverage(db, nowIso),
    readSnapshot: (nowIso: string) => readAirportRunSnapshot(nowIso),
    sourceBlocked: () => airportMidnightSourceBlocked(database),
    budgetAvailable: (nowIso: string) => airportRequestBudgetAvailable(database, nowIso),
  };
}

export async function checkAirportMidnightCandidate(db: CloudflareD1RestDatabase,
  coverage: ReturnType<typeof airportTodayCoverage>, nowIso: string) {
  return airportMidnightCandidate({ ...airportMidnightReaders(db), readCoverage: async () => coverage }, nowIso);
}
