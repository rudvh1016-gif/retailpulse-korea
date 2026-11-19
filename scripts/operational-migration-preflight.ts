/** Runs only in the existing protected deployment. The token stays in the Actions environment. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';
import { OPERATIONAL_MIGRATION, OPERATIONAL_OBJECTS, migrationGate, checkResumeEvidence, readWranglerResults, type SchemaObject } from '../lib/operational-migration-preflight';
import { resolveProductionDatabaseConfig } from './production-database';

const after = process.argv.includes('--after');
const reclaimMigrations = [
  '0034_reclaim_retired_seoul_context.sql',
  '0035_reclaim_remaining_retired_seoul_context.sql',
];
const overflowName = 'retailpulse-korea-production-overflow';
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const names = Object.keys(OPERATIONAL_OBJECTS);
const tables = names.filter(n => OPERATIONAL_OBJECTS[n as keyof typeof OPERATIONAL_OBJECTS] === 'table');
function read(sql: string, count: number) {
  // No raw child output on failure: diagnostics must never echo credentials or authenticated URLs.
  const output = execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB',
    '--remote', '--env', 'production', '--config', 'wrangler.production.jsonc', '--command', sql, '--json'],
  {encoding:'utf8',timeout:60000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe'],
    env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
  return readWranglerResults(output, count);
}

async function reportCapacity() {
  const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig('production');
  type Database = { uuid: string; name: string; file_size?: number };
  const root = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`;
  async function get<T>(path: string) {
    const response = await fetch(root + path, {
      headers: { authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('d1_metadata_http_error');
    const body = await response.json() as { success: boolean; result: T; result_info?: { total_count?: number } };
    if (!body.success) throw new Error('d1_metadata_unavailable');
    return body;
  }
  const { result: list, result_info: page } = await get<Database[]>('?per_page=100');
  if (!Array.isArray(list) || !list.every(row => /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(row?.uuid))
    || new Set(list.map(row => row.uuid)).size !== list.length) throw new Error('d1_metadata_invalid_list');
  const complete = page?.total_count === list.length || (page?.total_count == null && list.length < 100);
  const overflow = list.find(row => row.name === overflowName && row.uuid !== databaseId);
  const ids = complete && list.length <= 10 ? list.map(row => row.uuid) : [databaseId, ...(overflow ? [overflow.uuid] : [])];
  const details = await Promise.all(ids.map(async id => {
    try {
      const { result } = await get<Database>(`/${id}`);
      const size = result?.file_size;
      return [id, result?.uuid === id && typeof size === 'number' && Number.isSafeInteger(size) && size >= 0 ? size : null] as const;
    } catch {
      return [id, null] as const;
    }
  }));
  const bytes = new Map(details);
  const sizes = list.map(row => bytes.get(row.uuid) ?? null);
  console.log(JSON.stringify({
    phase: after ? 'POST_RECLAIM_CAPACITY' : 'PRE_RECLAIM_CAPACITY',
    accountDatabaseCount: complete ? list.length : null,
    accountFileSizeBytes: complete && sizes.every(value => value !== null) ? sizes.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    primaryFileSizeBytes: bytes.get(databaseId) ?? null,
    overflow: overflow ? { name: overflow.name, id: overflow.uuid, fileSizeBytes: bytes.get(overflow.uuid) ?? null } : null,
  }));
}

try {
  const expected = unstable_splitSqlQuery(readFileSync(`drizzle/${OPERATIONAL_MIGRATION}`, 'utf8')).map(sql => {
    const match = sql.replace(/--[^\n]*/g, '').trim().match(/^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
    if (!match) throw new Error('canonical_schema_unmeasured');
    return {name:match[2],type:match[1].toLowerCase(),sql};
  });
  const [migrations, objects] = read(`SELECT name FROM d1_migrations ORDER BY name LIMIT 1001;
    SELECT type,name,sql FROM sqlite_master WHERE name IN (${names.map(quote).join(',')})
    OR (type='trigger' AND tbl_name IN (${tables.map(quote).join(',')})) ORDER BY name;`, 2);
  if (migrations.length > 1000 || migrations.some(r => typeof r.name !== 'string')
    || new Set(migrations.map(r => r.name)).size !== migrations.length
    || objects.some(r => typeof r.type !== 'string' || typeof r.name !== 'string' || typeof r.sql !== 'string')) throw new Error('remote_read_unmeasured');
  const applied = migrations.some(r => r.name === OPERATIONAL_MIGRATION);
  const gate = checkResumeEvidence(migrationGate(applied, objects as unknown as SchemaObject[], expected), sql => read(sql, 1)[0]);
  const pending = readdirSync('drizzle').filter(n => n.endsWith('.sql') && !migrations.some(r => r.name === n)).sort();
  console.log(JSON.stringify({phase:after?'POST_MIGRATION':'PREFLIGHT',migration:OPERATIONAL_MIGRATION,
    registered:applied,pendingMigrations:pending,...gate,
    tables:gate.present.filter(n => OPERATIONAL_OBJECTS[n as keyof typeof OPERATIONAL_OBJECTS] === 'table').length,
    indexes:gate.present.filter(n => OPERATIONAL_OBJECTS[n as keyof typeof OPERATIONAL_OBJECTS] === 'index').length,
    triggers:gate.present.filter(n => OPERATIONAL_OBJECTS[n as keyof typeof OPERATIONAL_OBJECTS] === 'trigger').length}));
  const reclaimPending = reclaimMigrations.some(name => pending.includes(name));
  if (reclaimPending || (after && process.env.RPK_REPORT_RECLAIM_CAPACITY === '1')) {
    if (!after && process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, 'RPK_REPORT_RECLAIM_CAPACITY=1\n');
    await reportCapacity().catch(() => console.warn(JSON.stringify({
      phase: after ? 'POST_RECLAIM_CAPACITY' : 'PRE_RECLAIM_CAPACITY',
      status: 'METADATA_UNAVAILABLE',
    })));
    const [rows] = read(`SELECT COUNT(*) AS remaining FROM seoul_context WHERE rowid BETWEEN 1 AND 30000
      AND area IN ('myeongdong', 'hongdae', 'seongsu', 'itaewon') AND observed_at < '2026-11-18'`, 1);
    const remaining = rows[0]?.remaining;
    console.log(JSON.stringify({ phase: after ? 'POST_RECLAIM_ROWS' : 'PRE_RECLAIM_ROWS', remaining }));
    if (after && remaining !== 0) process.exitCode = 1;
  }
  if (gate.action === 'UNSAFE' || (after && (gate.action !== 'ALREADY_VALID' || pending.length))) process.exitCode=1;
} catch {
  console.error(JSON.stringify({phase:after?'POST_MIGRATION':'PREFLIGHT',classification:'STATE_F_UNKNOWN',action:'UNSAFE',
    reason:'read_only_inspection_failed_or_unmeasured; check Production access and canonical schema; no migration/deploy permitted'}));
  process.exitCode=1;
}
