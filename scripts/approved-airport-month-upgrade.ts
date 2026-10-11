/** Prepared repair only. Invoke once AFTER the owner's explicit DB-write approval.
 * No collector/provider/migration; upgrades one existing monthly extension. */
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
import {prepareAirportMonths,rollupsOf,type AirportCompositionRecord} from '../lib/airport-monthly-store';
import {readAirportMonths} from '../app/api/live/airport-months/route';
import {shiftKstDay} from '../lib/kst';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const target='2026-10-11',source='airport_months_v2_20261011';
if(process.env.RPK_ONESHOT_CONFIRM!=='IMPORT'||process.env.RPK_ONESHOT_SOURCES!==source)throw Error('MONTH_REPAIR_NOT_CONFIRMED');
const config=resolveProductionDatabaseConfig('production');
if(config.databaseId!=='a86b7e71-ddd8-4677-a65d-aa11490c578c')throw Error('MONTH_REPAIR_WRONG_TARGET');
let httpRequests=0;
const once:typeof fetch=async(input,init)=>{
 if(++httpRequests>4)throw Error('MONTH_REPAIR_HTTP_BOUND');
 const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30_000)});
 // Throw before the adapter can retry an ambiguous mutation outcome.
 if(!response.ok)throw Error(`MONTH_REPAIR_HTTP_${response.status}`);
 return response;
};
const db=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken,once);
const read=await db.prepare(`SELECT day,payload,source_hash AS sourceHash FROM airport_daily_composition
 WHERE day>=? AND day<=? ORDER BY day DESC LIMIT 63`).bind(shiftKstDay(target,-62),target).all<AirportCompositionRecord>();
if(!read.success)throw Error('MONTH_REPAIR_SOURCE_READ_FAILED');
const anchor=read.results[0];
if(anchor?.day!==target)throw Error('MONTH_REPAIR_ANCHOR_CHANGED');
const before=JSON.parse(anchor.payload) as Record<string,unknown>;
const extension=before.monthlyRollups as {version?:number;asOf?:string}|undefined;
const currentRollups=rollupsOf(before);
if(currentRollups?.asOf===target&&currentRollups.sidesVersion===AIRPORT_SIDES_VERSION&&currentRollups.destinationsVersion===DESTINATIONS_VERSION){console.log(JSON.stringify({repair:source,status:'ALREADY_UPGRADED',providerRequests:0,usage:db.usageSnapshot()}));}
else {
 if(extension?.version!==1||extension.asOf!==target)throw Error('MONTH_REPAIR_VERSION_CHANGED');
 let attempted=false;
 // The shared calculation is reused, but every mutation is restricted to the
 // one approved anchor with optimistic concurrency and unchanged daily fields.
 const guarded={prepare(sql:string){return {bind(...values:unknown[]){const statement=db.prepare(sql).bind(...values);return {
  all:statement.all.bind(statement),async run(){
   if(attempted||!sql.startsWith('UPDATE airport_daily_composition SET payload=')||values[3]!==target||values[5]!==anchor.sourceHash)throw Error('MONTH_REPAIR_WRITE_SCOPE');
   const next=JSON.parse(String(values[0])) as Record<string,unknown>;
   if(JSON.stringify({...next,monthlyRollups:null})!==JSON.stringify({...before,monthlyRollups:null}))throw Error('MONTH_REPAIR_DAILY_FIELDS_CHANGED');
   const usage=db.usageSnapshot();if(usage.rowsRead>95000||usage.rowsWritten!==0||usage.unmeasuredStatements!==0)throw Error('MONTH_REPAIR_BUDGET');
   attempted=true;return statement.run();
  },
 };}};}} as unknown as Pick<D1Database,'prepare'>;
 const result=await prepareAirportMonths(guarded,target,read.results,[]);
 const current=await readAirportMonths(db as unknown as Pick<D1Database,'prepare'>,'2026-10',target);
 const usage=db.usageSnapshot();
 if(result.status!=='PREPARED'||result.records!==1||current.status!=='READY'||usage.rowsWritten>1||usage.unmeasuredStatements!==0)throw Error('MONTH_REPAIR_READBACK_FAILED');
 console.log(JSON.stringify({repair:source,status:'UPGRADED',targetDate:target,months:current.months,version:current.data?.version,
  scopes:['ALL','T1','T2','CONCOURSE','UNKNOWN'],providerRequests:0,httpRequests,result,usage,
  included:current.data?.months.map(month=>({month:month.month,includedDays:month.includedDays.length,eligibleDays:month.eligibleDays})),calculatedAt:current.calculatedAt}));
}
