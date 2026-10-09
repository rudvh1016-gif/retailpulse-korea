/** Existing realtime trigger, bounded SELECTs only. No provider, writes or recovery. */
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { readAirportTodayCoverage } from '../lib/airport-today-coverage';
import { resolveProductionDatabaseConfig } from './production-database';

try {
  const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig('production');
  const db = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
  const coverage = await readAirportTodayCoverage(db, new Date().toISOString());
  console.log(JSON.stringify({ airportTodayCoverage: coverage, providerRequests: 0, writes: 0 }));
  if (coverage.alert) {
    console.error('Today airport coverage is late; inspect the existing early/daily runs. No automatic collection requested.');
    process.exitCode = 1;
  }
} catch {
  // Do not infer zero flights from a failed read or print authenticated errors.
  console.error('airportTodayCoverage=READ_UNAVAILABLE; no missing coverage inferred; providerRequests=0 writes=0');
  process.exitCode = 1;
}
