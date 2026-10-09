/** Owner-requested stored-data research only: eight aggregate rows, no provider and no writes. */
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import type {CommercialMonth} from '../lib/commercial-monthly';
import {resolveProductionDatabaseConfig} from './production-database';

const config=resolveProductionDatabaseConfig('production');
const db=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
const result=await db.prepare(`SELECT area,month,payload,calculated_at AS calculatedAt
 FROM seoul_commercial_months WHERE area IN (?,?,?,?) AND month IN (?,?) ORDER BY area,month LIMIT 9`)
 .bind('myeongdong','seongsu','hongdae','itaewon','2026-09','2026-10')
 .all<{area:string;month:string;payload:string;calculatedAt:string}>();
if(!result.success||result.results.length>8)throw new Error('STORED_MONTH_READ_BOUND');
const months=result.results.map(row=>{
 const value=JSON.parse(row.payload) as CommercialMonth;
 const days=new Map<string,Set<number>>();
 const categories=value.categories.map(category=>{
  const daily=new Map<string,{day:string;hours:number[];readings:number;paymentWindows:number;amountWindows:number;maxWindowsPerHour:number;minWindowsPerHour:number}>();
  for(const bin of category.hours){const day=bin[0].slice(0,2),hour=Number(bin[0].slice(3));
   const entry=daily.get(day)??{day,hours:[],readings:0,paymentWindows:0,amountWindows:0,maxWindowsPerHour:0,minWindowsPerHour:Infinity};
   if(bin[2]>0)entry.hours.push(hour);
   entry.readings+=bin[1];entry.paymentWindows+=bin[2];entry.amountWindows+=bin[4];
   entry.maxWindowsPerHour=Math.max(entry.maxWindowsPerHour,bin[2]);entry.minWindowsPerHour=Math.min(entry.minWindowsPerHour,bin[2]);daily.set(day,entry);
   const all=days.get(day)??new Set<number>();all.add(hour);days.set(day,all);
  }
  return {category:category.category,firstAt:category.firstAt,lastAt:category.lastAt,readings:category.readings,duplicates:category.duplicates,
   absentReadings:category.absentReadings,unavailablePayments:category.unavailablePayments,zeroReadings:category.zeroReadings,
   daily:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day))};
 });
 return {area:row.area,month:row.month,calculatedAt:row.calculatedAt,calendarCompletedDays:value.completedDays,
  firstAt:value.firstAt,lastAt:value.lastAt,uniqueSourceClocks:value.uniqueClocks,
  observedCalendarDays:[...days.keys()].sort(),anyCategoryHourCoverage:[...days].map(([day,hours])=>({day,hours:hours.size})),categories};
});
const usage=db.usageSnapshot();
if(usage.rowsWritten!==0||usage.unmeasuredStatements!==0||usage.rowsRead>50)throw new Error('READ_ONLY_USAGE_BOUND');
console.log(JSON.stringify({research:'stored-commercial-month-coverage',at:new Date().toISOString(),providerRequests:0,dbWrites:0,
 aggregateRows:result.results.length,usage,semantics:'day/hour bins; paymentWindows are unique published source clocks, not full-day totals',months}));
