/** Existing witness integration. Prepared only: no permission or execution enable is granted. */
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { readAirportTodayCoverage, type airportTodayCoverage } from '../lib/airport-today-coverage';
import { OperationalMemory } from '../lib/operational-memory';
import { airportRequestBudgetAvailable } from '../lib/airport-request-budget';
import { airportMidnightSourceBlocked } from '../lib/airport-recovery-protection';
import { measureSource, readPublicEvidence, verifyPublicMeasurement } from '../lib/operational-evidence';
import {
  A1_RECOVERY_WORKFLOW_ID, A1_SOURCE, dispatchAirportMidnightRecovery,
  executeAirportMidnightRecovery, readAirportDispatchReceipt, readAirportRunSnapshot, saveAirportDispatchReceipt,
  type AirportWorkflowRun,
} from '../lib/airport-midnight-recovery';

// This workflow has contents:read. A token's presence is never evidence of actions:write.
export const A1_RECOVERY_DISPATCH_PERMISSION_GRANTED = false;

export async function checkAirportMidnightRecovery(db: CloudflareD1RestDatabase,
  coverage: ReturnType<typeof airportTodayCoverage>, nowIso: string) {
  const database = db as unknown as D1Database;
  const memory = new OperationalMemory(database);
  return executeAirportMidnightRecovery({
    memory, nowIso, witnessRunId: process.env.GITHUB_RUN_ID ?? 'local-witness',
    dispatchPermissionGranted: A1_RECOVERY_DISPATCH_PERMISSION_GRANTED,
    readCoverage: () => readAirportTodayCoverage(db, nowIso),
    readSnapshot: () => readAirportRunSnapshot(nowIso),
    sourceBlocked: () => airportMidnightSourceBlocked(database),
    budgetAvailable: () => airportRequestBudgetAvailable(database, nowIso),
    dispatch: targetDate => dispatchAirportMidnightRecovery(process.env.GITHUB_TOKEN ?? '', targetDate),
    readRun: async runId => {
      const response = await fetch(`https://api.github.com/repos/rudvh1016-gif/retailpulse-korea/actions/runs/${runId}`,
        { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok) throw new Error('recovery_run_read_unavailable');
      const run = await response.json() as AirportWorkflowRun;
      if (run.workflow_id !== A1_RECOVERY_WORKFLOW_ID) throw new Error('recovery_run_not_allowlisted');
      return run;
    },
    saveReceipt: (request, attemptId, runId) => saveAirportDispatchReceipt(memory, request, attemptId, runId),
    readReceipt: attempt => readAirportDispatchReceipt(database, attempt),
    verifyPublicToday: async targetDate => {
      if (coverage.today !== targetDate) return null;
      const measurement = await measureSource(database, A1_SOURCE, nowIso);
      verifyPublicMeasurement(measurement, await readPublicEvidence(nowIso));
      return measurement.publicValid;
    },
  });
}
