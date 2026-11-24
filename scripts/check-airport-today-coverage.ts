/** Existing realtime trigger, bounded SELECTs only. No provider, writes or recovery. */
import { failureText } from '../lib/airport-midnight-direct-recovery';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { readAirportTodayCoverage } from '../lib/airport-today-coverage';
import { resolveProductionDatabaseConfig } from './production-database';
import { observeAirportA1Locks } from '../lib/a1-lock-observation';
import { OperationalMemory } from '../lib/operational-memory';
import { checkAirportMidnightCandidate } from './airport-midnight-recovery';
import { reportProductionD1StorageHeadroom } from './report-d1-storage-headroom';
import { appendFileSync } from 'node:fs';

try {
  const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig('production');
  const db = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
  const nowIso = new Date().toISOString();
  const coverage = await readAirportTodayCoverage(db, nowIso);
  console.log(JSON.stringify({ airportTodayCoverage: coverage, providerRequests: 0, writes: 0 }));
  const candidate = await checkAirportMidnightCandidate(db, coverage, nowIso);
  console.log(JSON.stringify({ airportMidnightCandidate: candidate, providerRequests: 0, writes: 0 }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `a1_recovery_eligible=${candidate.eligible}\na1_target_date=${candidate.targetDate}\n`);
  // A stale receipt is an operator clue only, not a verified terminal result.
  if (candidate.reason === 'INFLIGHT_LOCK' || candidate.reason === 'DAILY_ATTEMPT_ALREADY_SPENT') {
    const airportA1LockObservation = await observeAirportA1Locks(new OperationalMemory(db as unknown as D1Database), nowIso);
    console.log(JSON.stringify({ airportA1LockObservation, providerRequests: 0, writes: 0 }));
  }
  if (coverage.alert) {
    console.error('Today airport coverage is late; inspect the early/daily runs and guarded fallback disposition.');
    process.exitCode = 1;
  }
} catch (error) {
  // Do not infer zero flights from a failed read. failureText names the failure without credentials.
  console.error(`airportTodayCoverage=READ_UNAVAILABLE; error=${failureText(error)}; no missing coverage inferred; providerRequests=0 writes=0`);
  process.exitCode = 1;
}

// Keep capacity observation independent of A1 availability and recovery admission.
if (process.env.GITHUB_REF === 'refs/heads/main') {
  await reportProductionD1StorageHeadroom().catch(() => {
    console.warn('::warning title=D1 storage UNKNOWN::Production storage configuration unavailable');
  });
}
