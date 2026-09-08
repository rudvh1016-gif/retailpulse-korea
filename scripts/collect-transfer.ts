// GitHub runner only. XLS parsing never runs in the serving Worker.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { resolveProductionDatabaseConfig } from './production-database';
import { persistTransferForecast, validateTransferDownloadHeaders, transferServiceDate, TRANSFER_SOURCE, type TransferForecast } from '../lib/transfer-forecast';
import { writeSourceHealth } from '../lib/collector';

if (process.env.ENABLE_PRODUCTION_COLLECTOR !== 'true') throw new Error('production_collector_not_enabled');
const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production');
const db=new CloudflareD1RestDatabase(accountId,databaseId,apiToken) as unknown as D1Database;
const now=new Date();
// Before17, a deployment bootstrap can read TODAY's real file published yesterday.
// Scheduled windows after17 always collect D+1. No guessed/backfilled values.
const date=transferServiceDate(now);
const rows=await db.prepare('SELECT terminal FROM airport_transfer_forecast WHERE service_date=? AND quality_status=? AND schema_version=?').bind(date,'OFFICIAL_FORECAST','incheon-transfer-security-v1').all<{terminal:string}>();
const missing=(['T1','T2'] as const).filter(t=>!(rows.results ?? []).some(r=>r.terminal===t));
if(!missing.length){ console.log('SKIPPED_ALREADY_HEALTHY providerRequests=0 changedRows=0'); }
else {
  const health=await db.prepare('SELECT detail FROM source_health WHERE source_id=?').bind(TRANSFER_SOURCE).first<{detail:string}>();
  if(health?.detail.includes(`service_date=${date}`) && /SCHEMA_|PERMANENT_/.test(health.detail)) throw new Error('PERMANENT_FAILURE_REQUIRES_SCHEMA_REVIEW');
  const dir=mkdtempSync(join(tmpdir(),'koretail-transfer-'));
  let failure: string | null=null;
  try {
    for(const terminal of missing){
      const url=`https://www.airport.kr/pni/ap_ko/statisticPredictCrowdedOfInoutExcel.do?selTm=${terminal}&pday=${date.replaceAll('-','')}`;
      let response:Response|null=null;
      for(let attempt=0;attempt<3;attempt++){
        try { response=await fetch(url,{signal:AbortSignal.timeout(30000)}); }
        catch { if(attempt===2) throw new Error('NETWORK_DOWNLOAD_FAILURE'); }
        if(response?.ok) break;
        if(response && response.status!==429 && response.status<500) throw new Error('PERMANENT_DOWNLOAD_HTTP');
        if(attempt<2) await new Promise(r=>setTimeout(r,2000*(attempt+1)));
      }
      if(!response?.ok) throw new Error('NETWORK_DOWNLOAD_FAILURE');
      validateTransferDownloadHeaders(response.headers,date,terminal);
      const raw=Buffer.from(await response.arrayBuffer());
      if(raw.length>2_000_000) throw new Error('SCHEMA_SIZE');
      const file=join(dir,`${terminal}.xls`);writeFileSync(file,raw);
      let parsed:TransferForecast;
      try { parsed=JSON.parse(execFileSync('python3',['scripts/parse-transfer.py',file,date,terminal],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']})); }
      catch { throw new Error('SCHEMA_WORKBOOK_REJECTED'); }
      const counts=await persistTransferForecast(db,parsed,now.toISOString());
      console.log(JSON.stringify({terminal,serviceDate:date,...counts,status:'OFFICIAL_FORECAST'}));
    }
  } catch(e) {failure=e instanceof Error?e.message:'COLLECTION_FAILURE';}
  finally {rmSync(dir,{recursive:true,force:true});}
  if(failure){
    await writeSourceHealth(db,TRANSFER_SOURCE,'ERROR',`${failure}; service_date=${date}; last-good rows preserved`);
    throw new Error(failure);
  }
  await writeSourceHealth(db,TRANSFER_SOURCE,'LIVE',`service_date=${date}; arrival transfer security forecast; no combined departure total`,{retrievedAt:now.toISOString(),schemaVersion:'incheon-transfer-security-v1'});
}
