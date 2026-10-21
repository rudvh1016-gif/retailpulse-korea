/** Production A1 verification wiring; only the existing current-day public summary. */
import { kstDayOf } from './kst';
import { measureSource, readPublicSummary, verifyPublicMeasurement } from './operational-evidence';
import type { RecoveryVerification } from './recovery-orchestration';

export async function verifyAirportRecoveryToday(db: D1Database, targetDate: string, nowIso: string,
  fetchImpl: typeof fetch = fetch): Promise<RecoveryVerification> {
  if (targetDate !== kstDayOf(nowIso)) return { dataValid: false, storageValid: false, publicValid: null };
  const measured = await measureSource(db, 'INCHEON_FLIGHT_DETAIL', nowIso, { airportRecovery: true });
  if (measured.dataValid === true && measured.storageValid === true)
    verifyPublicMeasurement(measured, { today: await readPublicSummary(fetchImpl), tomorrow: null });
  return { dataValid: measured.dataValid, storageValid: measured.storageValid, publicValid: measured.publicValid };
}
