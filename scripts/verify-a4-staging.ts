import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';
import { collectAirportCongestion, collectAirportCongestionT2 } from '../lib/collector';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { createWitnessedA4Reader } from '../lib/a4-overflow-public-read';
import { isA4SchemaMissing } from '../lib/a4-overflow-routing';
import { resolveProductionDatabaseConfig } from './production-database';

const production = resolveProductionDatabaseConfig('production');
const standby = resolveProductionDatabaseConfig('production','A4_OVERFLOW_DB');
const apiToken=process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!apiToken) throw new Error('a4_staging_provision_token_missing');
const control=new CloudflareD1RestDatabase(production.accountId,production.databaseId,production.apiToken);
try {
  const ready=await control.prepare('SELECT COUNT(*) n FROM a4_cutover WHERE cutover_at IS NOT NULL').first<{n:number}>();
  if (ready?.n===2) {
    console.log('A4 staging verification already admitted both terminals; no fixture writes');
    process.exit(0);
  }
} catch (error) {
  if (!isA4SchemaMissing(error,'a4_cutover')) throw error;
}

const root=`https://api.cloudflare.com/client/v4/accounts/${production.accountId}/d1/database`;
type Database = { uuid:string; name:string };
async function cloudflare<T>(path:string,body?:object):Promise<T> {
  const response=await fetch(root+path,{method:body?'POST':'GET',
    headers:{authorization:`Bearer ${apiToken}`,'content-type':'application/json'},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`a4_staging_metadata_http_${response.status}`);
  const payload=await response.json() as {success:boolean;result:T};
  if(!payload.success)throw new Error('a4_staging_metadata_unverified');
  return payload.result;
}
async function isolatedDatabase(kind:'primary'|'overflow') {
  const name=`retailpulse-korea-a4-verification-${kind}`;
  const list=await cloudflare<Database[]>('?per_page=100');
  const row=list.find(item=>item.name===name)??await cloudflare<Database>('',{name,primary_location_hint:'apac'});
  if(row.name!==name||!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(row.uuid)
    ||[production.databaseId,standby.databaseId].includes(row.uuid))throw new Error('a4_staging_database_unverified');
  return row.uuid;
}
const primaryId=await isolatedDatabase('primary'),overflowId=await isolatedDatabase('overflow');
if(primaryId===overflowId)throw new Error('a4_staging_requires_distinct_databases');
const primary=new CloudflareD1RestDatabase(production.accountId,primaryId,production.apiToken);
const overflow=new CloudflareD1RestDatabase(production.accountId,overflowId,production.apiToken);
const schemaPrimary=new CloudflareD1RestDatabase(production.accountId,primaryId,apiToken);
const schemaOverflow=new CloudflareD1RestDatabase(production.accountId,overflowId,apiToken);
const loadSql=(path:string)=>unstable_splitSqlQuery(readFileSync(path,'utf8'))
  .map(sql=>sql.replace(/^(?:\s*--[^\n]*\n)+/,'').trim());
const names='airport_congestion|collector_runs|source_health';
const base= ['0001_crazy_nekra','0003_minor_network'].flatMap(file=>loadSql(`drizzle/${file}.sql`))
  .filter(sql=>new RegExp(`^CREATE TABLE [\`"]?(?:${names})[\`"]?\\s|^CREATE UNIQUE INDEX [\\s\\S]+ ON [\`"]?(?:${names})[\`"]?\\s*\\(`,'i').test(sql.trim()));
const latestPrimary=loadSql('drizzle/0036_airport_congestion_cutover.sql');
const latestOverflow=loadSql('db/a4-overflow-migrations/0000_a4_generation.sql');
const retention=loadSql('db/a4-overflow-migrations/0001_a4_retention.sql');
const idempotent=(sql:string)=>sql.replace(/^CREATE (UNIQUE INDEX|INDEX|TABLE|TRIGGER) /i,'CREATE $1 IF NOT EXISTS ');
await schemaPrimary.execute([...base,...latestPrimary].map(sql=>({sql:idempotent(sql.trim())})));
const waitRaw=await schemaPrimary.prepare("SELECT name FROM pragma_table_info('airport_congestion') WHERE name='wait_time_raw'").first();
if(!waitRaw)await schemaPrimary.prepare('ALTER TABLE airport_congestion ADD COLUMN wait_time_raw TEXT').run();
await schemaOverflow.execute([...latestOverflow,...retention].map(sql=>({sql:idempotent(sql.trim())})));

// These fixture-only databases stay isolated. A deployment rerun reuses them
// without resetting production or creating additional resources.
await primary.execute(['a4_cutover','a4_pointer','source_health','collector_runs','airport_congestion']
  .map(table=>({sql:`DELETE FROM ${table}`})));
const primaryBinding=primary as unknown as D1Database,overflowBinding=overflow as unknown as D1Database;
const read=createWitnessedA4Reader(primaryBinding,overflowBinding);
const producerFetch=globalThis.fetch;
const kst=(utcMs:number)=>new Date(utcMs+9*3_600_000).toISOString().slice(0,19).replace(/\D/g,'');
const at=Date.now()-5*60_000;
const failure='a4_staging_injected';
const counts=async (table:string)=>Number((await primary.prepare(`SELECT COUNT(*) n FROM ${table}`).first<{n:number}>())?.n);
for (const terminal of ['T1','T2'] as const) {
  const collector=terminal==='T1'?collectAirportCongestion:collectAirportCongestionT2;
  const source=terminal==='T1'?'INCHEON_DEPARTURE_CONGESTION':'INCHEON_DEPARTURE_CONGESTION_T2';
  const gates=terminal==='T1'?['DG1_E','DG1_W']:['DG1_A','DG1_B'];
  let observedAt=kst(at),calls=0;
  const env={DB:primaryBinding,A4_OVERFLOW_DB:overflowBinding,DATA_GO_KR_SERVICE_KEY:'test-fixture'};
  const before=await counts('airport_congestion');
  globalThis.fetch=async(input,init)=>{
    if(new URL(String(input)).hostname!=='apis.data.go.kr')return producerFetch(input,init);
    calls++;
    return Response.json({response:{header:{resultCode:'00'},body:{totalCount:gates.length,items:gates.map(gateId=>({
      terminalId:terminal==='T1'?'P01':'P03',gateId,occurtime:observedAt,waitLength:'0',waitTime:'60+',
    }))}}});
  };
  try {
    await primary.prepare('INSERT INTO a4_cutover VALUES(?,?)').bind(terminal,new Date(at-60_000).toISOString()).run();
    await schemaPrimary.prepare(`CREATE TRIGGER IF NOT EXISTS a4_reject_fixture_write BEFORE INSERT ON collector_runs
      WHEN NEW.run_id LIKE 'a4-overflow-v1:%' BEGIN SELECT RAISE(ABORT,'${failure}'); END`).run();
    const rejected=await collector(env);
    assert.equal(rejected.detail,'A4_OVERFLOW_STORAGE_UNVERIFIED');
    assert.equal((await read(terminal)).state,'ok');
    assert.equal(await primary.prepare('SELECT digest FROM a4_pointer WHERE terminal=?').bind(terminal).first(),null);
    assert.equal(await primary.prepare('SELECT status FROM source_health WHERE source_id=?').bind(source).first(),null);
    assert.equal(await primary.prepare('SELECT status FROM collector_runs WHERE source_id=?').bind(source).first(),null);
    assert.equal(await counts('airport_congestion'),before);
    await schemaPrimary.prepare('DROP TRIGGER a4_reject_fixture_write').run();

    observedAt=kst(at+60_000);
    const captured=await collector(env);
    assert.equal(captured.detail,'A4_OVERFLOW_PUBLICATION');
    const first=await read(terminal);
    assert.ok(first.state==='ok'&&first.current&&first.rows.length===gates.length);
    const duplicate=await collector(env);
    assert.equal(duplicate.status,'SKIPPED_NO_NEW_PUBLICATION');
    assert.deepEqual(await read(terminal),first);
    assert.equal(await counts('airport_congestion'),before);

    await primary.prepare('DELETE FROM a4_cutover WHERE terminal=?').bind(terminal).run();
    observedAt=kst(at+120_000);
    assert.equal((await collector(env)).status,'SUCCESS');
    assert.equal(await counts('airport_congestion'),before+gates.length);
    const retained=await read(terminal);
    assert.ok(retained.state==='ok'&&!retained.current&&retained.pointer?.digest===first.pointer?.digest);
    assert.equal(calls,4);
    console.log(JSON.stringify({terminal,staging:'PASS',atomicRollback:true,immutablePointer:true,
      duplicateSuppressed:true,normalCollectorRollback:true,fixtureProviderCalls:calls}));
  } finally {
    globalThis.fetch=producerFetch;
    await schemaPrimary.prepare('DROP TRIGGER IF EXISTS a4_reject_fixture_write').run();
  }
}
console.log(JSON.stringify({a4Staging:'PASS',primary:primary.usageSnapshot(),overflow:overflow.usageSnapshot(),externalProviderCalls:0}));
