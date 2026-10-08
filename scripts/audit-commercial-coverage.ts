/** Zero provider calls, writes, migrations or retention changes. Existing D1 auth only. */
import {writeFileSync} from 'node:fs';
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
import {assertCommercialAuditReadOnly,COMMERCIAL_AUDIT_AREAS,COMMERCIAL_AUDIT_ROW_CAP,
 commercialAuditContextSql,commercialAuditCategoriesSql} from '../lib/commercial-coverage-audit';
const at=new Date(),today=new Date(at.getTime()+9*3_600_000).toISOString().slice(0,10);
const lower=new Date(at.getTime()-90*86_400_000+9*3_600_000).toISOString().slice(0,10);
const upper=new Date(at.getTime()+86_400_000+9*3_600_000).toISOString().slice(0,10);
const currentMonth=today.slice(0,7),previousMonth=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-2,1)).toISOString().slice(0,7);
const completedDays=Number(today.slice(8))-1,ceiling=Number(process.env.RPK_READ_BUDGET_CEILING??100_000);
if(!Number.isFinite(ceiling)||ceiling<=0||ceiling>100_000)throw new Error('INVALID_COMMERCIAL_AUDIT_CEILING');
const config=resolveProductionDatabaseConfig('production');
const db=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
const areas:unknown[]=[];const output=()=>({diagnostic:'commercial-coverage-read-only',at:at.toISOString(),lower,upper,currentMonth,
 previousMonth,completedDays,areas,usage:db.usageSnapshot(),nullMeaning:'Stored normalization cannot separate unpublished from missing values.'});
function persist(){writeFileSync('commercial-coverage-audit.json',JSON.stringify(output(),null,2));}
async function read(sql:string,binds:unknown[]){
 assertCommercialAuditReadOnly(sql);if(db.usageSnapshot().rowsRead>=ceiling)throw new Error('COMMERCIAL_AUDIT_READ_CEILING');
 const result=await db.prepare(sql).bind(...binds).all<Record<string,unknown>>();
 if(!result.success)throw new Error('COMMERCIAL_AUDIT_QUERY_FAILED');
 const usage=db.usageSnapshot();persist();if(usage.rowsWritten!==0||usage.unmeasuredStatements!==0)throw new Error('COMMERCIAL_AUDIT_WRITE_OR_UNMEASURED');
 if(usage.rowsRead>ceiling)throw new Error('COMMERCIAL_AUDIT_READ_CEILING');return result.results??[];
}
try{
 for(const area of COMMERCIAL_AUDIT_AREAS){
  const binds=[area,lower,upper];const plan=await read('EXPLAIN QUERY PLAN '+commercialAuditContextSql,binds);
  if(!plan.some(row=>/SEARCH seoul_context USING.*INDEX/i.test(String(row.detail)))
    ||plan.some(row=>/SCAN seoul_context\b/i.test(String(row.detail))))throw new Error('COMMERCIAL_AUDIT_UNBOUNDED_PLAN');
  const [context]=await read(commercialAuditContextSql,binds);
  if(Number(context.rawRows)>COMMERCIAL_AUDIT_ROW_CAP)throw new Error('COMMERCIAL_AUDIT_SOURCE_ROW_CAP');
  const categories=await read(commercialAuditCategoriesSql,[...binds,completedDays]);
  const summary=categories.map(row=>{const {completedPrefixHours,...rest}=row;const keys=new Set((JSON.parse(String(completedPrefixHours)) as Array<string|null>).filter(Boolean));
   const previous=categories.find(value=>value.category===row.category&&value.month===previousMonth);
   const older=new Set(previous?(JSON.parse(String(previous.completedPrefixHours)) as Array<string|null>).filter(Boolean):[]);
   return {...rest,completedPrefixHours:keys.size,matchedPreviousPrefixHours:row.month===currentMonth?[...keys].filter(key=>older.has(key)).length:null};});
  areas.push({area,context,categories:summary});persist();
 }
 console.log(JSON.stringify(output(),null,2));
}catch(error){persist();console.log(JSON.stringify(output(),null,2));throw error;}
