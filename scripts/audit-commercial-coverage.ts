/** Zero provider calls, writes, migrations or retention changes. Existing D1 auth only. */
import {writeFileSync} from 'node:fs';
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
import {assertCommercialAuditReadOnly,COMMERCIAL_AUDIT_AREAS,COMMERCIAL_AUDIT_ROW_CAP,
 commercialAuditObservationsSql} from '../lib/commercial-coverage-audit';
import type {SeoulContext,CategoryActivity} from '../lib/seoul-context';
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
  const binds=[area,lower,upper];const plan=await read('EXPLAIN QUERY PLAN '+commercialAuditObservationsSql,binds);
  if(!plan.some(row=>/SEARCH seoul_context USING.*INDEX/i.test(String(row.detail)))
    ||plan.some(row=>/SCAN seoul_context\b/i.test(String(row.detail))))throw new Error('COMMERCIAL_AUDIT_UNBOUNDED_PLAN');
  // One bounded indexed scan. JSON and coverage computation run on Actions.
  const raw=await read(commercialAuditObservationsSql,binds);
  if(raw.length>COMMERCIAL_AUDIT_ROW_CAP)throw new Error('COMMERCIAL_AUDIT_SOURCE_ROW_CAP');
  const canonical=new Map<string,{at:string;category:CategoryActivity;copies:number}>();
  const clocks=new Set<string>();let missingCommercialClock=0,emptyCategories=0,largestCategoryList=0;
  for(const row of raw){const context=JSON.parse(String(row.payload)) as SeoulContext;
   if(!context.commercialAt){missingCommercialClock++;continue;}clocks.add(context.commercialAt);
   largestCategoryList=Math.max(largestCategoryList,context.categories.length);if(!context.categories.length)emptyCategories++;
   for(const category of context.categories){const key=context.commercialAt+'|'+category.category;
    canonical.set(key,{at:context.commercialAt,category,copies:(canonical.get(key)?.copies??0)+1});}
  }
  const groups=new Map<string,Array<{at:string;category:CategoryActivity;copies:number}>>();
  for(const value of canonical.values()){const key=value.category.category+'|'+value.at.slice(0,7);groups.set(key,[...(groups.get(key)??[]),value]);}
  const categories=[...groups.values()].map(values=>{
   const first=values[0],times=values.map(value=>value.at).sort();
   const prefixHours=[...new Set(values.filter(value=>Number(value.at.slice(8,10))<=completedDays&&value.category.payments!==null).map(value=>value.at.slice(8,13)))];
   return {category:first.category.category,categoryGroup:first.category.group,month:first.at.slice(0,7),firstAt:times[0],lastAt:times.at(-1),
    uniqueObservations:values.length,duplicateCopies:values.reduce((sum,value)=>sum+value.copies-1,0),
    unavailablePayments:values.filter(value=>value.category.payments===null).length,
    publishedZeroPayments:values.filter(value=>value.category.payments===0).length,
    unavailableAmountRange:values.filter(value=>value.category.amountMin===null||value.category.amountMax===null).length,
    observedDays:new Set(times.map(time=>time.slice(0,10))).size,observedHours:new Set(times.map(time=>time.slice(0,13))).size,prefixHours};});
  const summary=categories.map(({prefixHours,...row})=>{const previous=categories.find(value=>value.category===row.category&&value.month===previousMonth);
   return {...row,completedPrefixHours:prefixHours.length,matchedPreviousPrefixHours:row.month===currentMonth?prefixHours.filter(key=>previous?.prefixHours.includes(key)).length:null};});
  const times=[...clocks].sort();areas.push({area,context:{rawRows:raw.length,firstContextAt:raw[0]?.observed_at??null,
   lastContextAt:raw.at(-1)?.observed_at??null,firstCommercialAt:times[0]??null,lastCommercialAt:times.at(-1)??null,
   uniqueCommercialClocks:clocks.size,missingCommercialClock,emptyCategories,largestCategoryList},categories:summary});persist();
 }
 console.log(JSON.stringify(output(),null,2));
}catch(error){persist();console.log(JSON.stringify(output(),null,2));throw error;}
