import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { d1StorageHeadroom } from '../lib/storage-inventory';
import { resolveProductionDatabaseConfig } from './production-database';

export async function reportProductionD1StorageHeadroom() {
  const primary = resolveProductionDatabaseConfig('production');
  const overflow = resolveProductionDatabaseConfig('production', 'A4_OVERFLOW_DB');
  if (primary.databaseId === overflow.databaseId) throw new Error('a4_requires_distinct_databases');

  const databases = { DB: primary, A4_OVERFLOW_DB: overflow };
  const results = await Promise.all(Object.entries(databases).map(async ([binding, config]) => {
    const fetchBounded: typeof fetch = (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(3_000) });
    const db = new CloudflareD1RestDatabase(config.accountId, config.databaseId, config.apiToken, fetchBounded);
    const result = await db.prepare('SELECT 1 AS ok').all<{ ok: number }>().catch(() => null);
    const size = result?.success && result.results[0]?.ok === 1 ? result.meta?.size_after : undefined;
    return { binding, ...d1StorageHeadroom(size) };
  }));

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), d1StorageHeadroom: results }));
  for (const result of results) {
    if (result.level !== 'NORMAL') {
      console.warn(`::warning title=D1 storage ${result.level}::${result.binding} remaining bytes: ${result.remainingBytes ?? 'unknown'}`);
    }
  }
}
