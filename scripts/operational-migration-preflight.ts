/** Runs only in the existing protected deployment. The token stays in the Actions environment. */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';
import { OPERATIONAL_MIGRATION, OPERATIONAL_OBJECTS, migrationGate, checkResumeEvidence, readWranglerResults, type SchemaObject } from '../lib/operational-migration-preflight';

const after = process.argv.includes('--after');
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
  if (gate.action === 'UNSAFE' || (after && (gate.action !== 'ALREADY_VALID' || pending.length))) process.exitCode=1;
} catch {
  console.error(JSON.stringify({phase:after?'POST_MIGRATION':'PREFLIGHT',classification:'STATE_F_UNKNOWN',action:'UNSAFE',
    reason:'read_only_inspection_failed_or_unmeasured; check Production access and canonical schema; no migration/deploy permitted'}));
  process.exitCode=1;
}
