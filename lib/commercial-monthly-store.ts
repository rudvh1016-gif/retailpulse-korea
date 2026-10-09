import {publicAreaIds} from './areas';
import {kstDayOf,shiftKstDay} from './kst';
import {sha256} from './hash';
import {buildCommercialMonth,compareCommercialMonths,previousCommercialMonth,type CommercialMonth,type CommercialContextRow} from './commercial-monthly';
/** Existing Actions daily group only. One indexed bounded raw scan per area per KST day.
 * Historical summaries stay compact; only the latest two months retain comparison bins.
 * No provider request, forecast mutation or new scheduler.
 */
export async function refreshCommercialMonths(db:D1Database,now=new Date()){
 const today=kstDayOf(now.toISOString()),through=shiftKstDay(today,-1),month=today.slice(0,7),previous=previousCommercialMonth(month);
 let readRows=0,changedRows=0;
 for(const area of publicAreaIds){
  const marker=await db.prepare('SELECT calculated_at AS calculatedAt FROM seoul_commercial_months WHERE area=? AND month=?').bind(area,month).first<{calculatedAt:string}>();
  if(marker?.calculatedAt&&kstDayOf(marker.calculatedAt)===today)continue;
  const source=await db.prepare('SELECT observed_at,payload FROM seoul_context WHERE area=? AND observed_at>=? AND observed_at<? ORDER BY observed_at LIMIT 12001').bind(area,previous+'-01',today).all<CommercialContextRow>();
  if(!source.success)throw new Error('COMMERCIAL_MONTH_SOURCE_READ_FAILED');
  const rows=source.results??[];
  if(rows.length>12000)throw new Error('COMMERCIAL_MONTH_SOURCE_CAP');readRows+=rows.length;
  const older=buildCommercialMonth(rows,previous,through);
  const storedOlder=await db.prepare('SELECT payload FROM seoul_commercial_months WHERE area=? AND month=?').bind(area,previous).first<{payload:string}>();
  // Preserve the older month's already computed comparison with its own predecessor.
  if(storedOlder){const stored=JSON.parse(storedOlder.payload) as CommercialMonth;
   older.categories=older.categories.map(category=>({...category,comparison:stored.categories.find(row=>row.category===category.category)?.comparison??category.comparison}));}
  const current=compareCommercialMonths(buildCommercialMonth(rows,month,through),older);
  for(const value of [older,current]){const payload=JSON.stringify(value),hash=await sha256(value);
   const result=await db.prepare(`INSERT INTO seoul_commercial_months(area,month,payload,source_hash,calculated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(area,month) DO UPDATE SET payload=excluded.payload,source_hash=excluded.source_hash,calculated_at=excluded.calculated_at
    WHERE seoul_commercial_months.source_hash<>excluded.source_hash`).bind(area,value.month,payload,hash,now.toISOString()).run();
   if(!result.success)throw new Error('COMMERCIAL_MONTH_WRITE_FAILED');changedRows+=Number(result.meta?.changes??result.meta?.rows_written??0);}
  // Same-day marker changes once even when a no-data payload is unchanged.
  if(marker&&kstDayOf(marker.calculatedAt)!==today){const stamp=await db.prepare('UPDATE seoul_commercial_months SET calculated_at=? WHERE area=? AND month=? AND calculated_at<>?').bind(now.toISOString(),area,month,now.toISOString()).run();if(!stamp.success)throw new Error('COMMERCIAL_MONTH_MARKER_FAILED');}
  const archive=(await db.prepare('SELECT month,payload FROM seoul_commercial_months WHERE area=? AND month<? ORDER BY month DESC LIMIT 2').bind(area,previous).all<{month:string;payload:string}>()).results??[];
  for(const row of archive){const value=JSON.parse(row.payload) as CommercialMonth;if(!value.categories.some(category=>category.hours.length))continue;
   const compact={...value,categories:value.categories.map(category=>({...category,hours:[]}))};
   const result=await db.prepare('UPDATE seoul_commercial_months SET payload=?,source_hash=? WHERE area=? AND month=?').bind(JSON.stringify(compact),await sha256(compact),area,row.month).run();if(!result.success)throw new Error('COMMERCIAL_MONTH_COMPACT_FAILED');changedRows++;}
 }
 return {status:'SUCCESS',readRows,changedRows,providerRequests:0};
}
