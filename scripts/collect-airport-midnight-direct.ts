/** Runs only inside the reviewed A1 reusable child, after its concurrency wait. */
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { airportMidnightRecoveryActivation, A1_SOURCE } from '../lib/airport-midnight-recovery';
import { airportDirectContext, executeAirportMidnightDirect } from '../lib/airport-midnight-direct-recovery';
import { runSelectedProductionSources } from '../lib/production-runner';
import { collectAirportComposition } from '../lib/airport-composition-history';
import { measureSource, readPublicEvidence, verifyPublicMeasurement } from '../lib/operational-evidence';
import { resolveProductionDatabaseConfig } from './production-database';
import { airportMidnightReaders } from './airport-midnight-recovery';

const nowIso = new Date().toISOString();
// Check the unchanged closed gate before config, credentials, DB or provider access.
const gate = airportMidnightRecoveryActivation(nowIso);
if (!gate.allowed) {
  console.log(JSON.stringify({ airportMidnightRecovery: 'CENTRAL_RECOVERY_DORMANT', providerRequests: 0, writes: 0 }));
} else if (!airportDirectContext(process.env, nowIso)) {
  console.error('airportMidnightRecovery=DIRECT_CONTEXT_UNVERIFIED; providerRequests=0 writes=0');
  process.exitCode = 1;
} else {
  try {
    const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig('production');
    const db = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
    const database = db as unknown as D1Database;
    const result = await executeAirportMidnightDirect({
      ...airportMidnightReaders(db), env: process.env, now: () => new Date().toISOString(),
      collectA1: async () => {
        const [source] = await runSelectedProductionSources({ DB: database,
          DATA_GO_KR_SERVICE_KEY: process.env.DATA_GO_KR_SERVICE_KEY,
          A1_SHARED_REQUEST_BUDGET: true, A1_MAX_REQUESTS: 125, A1_RESCAN_TODAY: false,
          A1_EXPECTED_TARGET_DATE: process.env.RPK_A1_EXPECTED_TARGET_DATE }, ['airport_recent']);
        console.log(JSON.stringify(source));
        // Same DB-only preparation as native A1; no holidays/A2/new provider/retention work.
        if (source.status === 'SUCCESS') console.log(JSON.stringify({ context: 'airport_composition',
          ...await collectAirportComposition(database) }));
        return source;
      },
      verifyToday: async (targetDate, verifiedAt) => {
        const measured = await measureSource(database, A1_SOURCE, verifiedAt);
        if (targetDate !== airportDirectContext(process.env, verifiedAt)?.targetDate)
          return { dataValid: false, storageValid: false, publicValid: null };
        verifyPublicMeasurement(measured, await readPublicEvidence(verifiedAt));
        return { dataValid: measured.dataValid, storageValid: measured.storageValid, publicValid: measured.publicValid };
      },
    });
    console.log(JSON.stringify({ airportMidnightRecovery: result }));
    if (result.state.startsWith('HUMAN_REVIEW')) process.exitCode = 1;
  } catch {
    console.error('airportMidnightRecovery=READ_OR_EXECUTION_UNAVAILABLE; human review required; no automatic retry');
    process.exitCode = 1;
  }
}
