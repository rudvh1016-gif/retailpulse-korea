/** Existing realtime trigger, bounded SELECTs only. No provider, writes or recovery. */
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { readAirportTodayCoverage } from '../lib/airport-today-coverage';
import { resolveProductionDatabaseConfig } from './production-database';
import { checkAirportMidnightRecovery } from './airport-midnight-recovery';

try {
  const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig('production');
  const db = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
  const nowIso = new Date().toISOString();
  const coverage = await readAirportTodayCoverage(db, nowIso);
  console.log(JSON.stringify({ airportTodayCoverage: coverage, providerRequests: 0, writes: 0 }));
  const recovery = await checkAirportMidnightRecovery(db, coverage, nowIso);
  console.log(JSON.stringify({ airportMidnightRecovery: recovery }));
  if (coverage.alert) {
    console.error('Today airport coverage is late; inspect the early/daily runs and guarded fallback disposition.');
    process.exitCode = 1;
  }
} catch {
  // Do not infer zero flights from a failed read or print authenticated errors.
  console.error('airportTodayCoverage=READ_UNAVAILABLE; no missing coverage inferred; providerRequests=0 writes=0');
  process.exitCode = 1;
}
