/**
 * The public read of A6 monthly passenger statistics (lib/airport-monthly-stats.ts
 * writes them). Kept apart from the collector so the Worker route and the page
 * never bundle the provider client.
 */
export type AirportStatsOperationId = "ROUTE_COUNTRY_PASSENGERS" | "TIME_BAND_PASSENGERS";

export interface AirportStatsRow {
  /** The provider's own label: a country name or a time band, as published. */
  label: string;
  region: string | null;
  arrivals: number | null;
  departures: number | null;
  /** The provider's own total field; never computed here. */
  total: number | null;
  /** A provider total/subtotal row: use it or its parts, never both. */
  aggregate: boolean;
  /** Time bands only, when the label reads unambiguously. */
  startHour: number | null;
  endHour: number | null;
}

export interface AirportStatsMonth {
  operationId: AirportStatsOperationId;
  /** YYYY-MM, the month the request asked for. */
  month: string;
  rows: AirportStatsRow[];
  retrievedAt: string;
  completeness?: "COMPLETE" | "TOTAL_NOT_PROVIDED";
}

function previousMonthOf(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const index = year * 12 + value - 2;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The stored month at or before `month`, and the month before it, for one public read. */
export async function readAirportMonthlyStats(db: Pick<D1Database, "prepare">, month: string): Promise<{
  month: string | null;
  previousMonth: string | null;
  current: Partial<Record<AirportStatsOperationId, AirportStatsMonth>>;
  previous: Partial<Record<AirportStatsOperationId, AirportStatsMonth>>;
  rowsRead: number;
}> {
  // Each operation selects its own newest month, so a newly published route
  // table never hides the last-good time-band table (or vice versa).
  const results=await Promise.all((["ROUTE_COUNTRY_PASSENGERS","TIME_BAND_PASSENGERS"] as const).map(async operation=>{
    const result=await db.prepare(`SELECT operation_id AS operationId, month, payload, retrieved_at AS retrievedAt
      FROM airport_monthly_stats WHERE operation_id=? AND month<=? ORDER BY month DESC LIMIT 2`).bind(operation,month).all<StoredAirportMonth>();
    if(result.success===false)throw Error('AIRPORT_MONTHLY_STATS_READ_FAILED');return result.results??[];
  }));
  const current:Partial<Record<AirportStatsOperationId,AirportStatsMonth>>={},previous:Partial<Record<AirportStatsOperationId,AirportStatsMonth>>={};
  for(const rows of results){
    const latest=rows[0];if(!latest)continue;
    const value=decodeAirportStatsMonth(latest);if(value)current[value.operationId]=value;
    const prior=rows.find(row=>row.month===previousMonthOf(latest.month)),before=prior&&decodeAirportStatsMonth(prior);if(before)previous[before.operationId]=before;
  }
  const primary=current.ROUTE_COUNTRY_PASSENGERS??current.TIME_BAND_PASSENGERS;
  const prior=primary&&previous[primary.operationId];
  return {month:primary?.month??null,previousMonth:prior?.month??null,current,previous,rowsRead:results.reduce((total,rows)=>total+rows.length,0)};
}

export interface StoredAirportMonth {operationId:AirportStatsOperationId;month:string;payload:string;retrievedAt:string}
export function decodeAirportStatsMonth(row:StoredAirportMonth):AirportStatsMonth|null{
 try{const payload=JSON.parse(row.payload) as {rows?:AirportStatsRow[];completeness?:string};
  if(!Array.isArray(payload.rows)||!payload.rows.every(item=>typeof item.label==='string'&&[item.arrivals,item.departures,item.total].every(value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0)))return null;
  return {operationId:row.operationId,month:row.month,rows:payload.rows,retrievedAt:row.retrievedAt,completeness:payload.completeness==='COMPLETE'?'COMPLETE':'TOTAL_NOT_PROVIDED'};
 }catch{return null;}
}

/** Two exact route months plus bounded metadata; never provider reads or fallback months. */
export async function readAirportPassengerComparison(db:Pick<D1Database,'prepare'>,selectedMonth:string,baselineMonth:string){
 const [result,available]=await Promise.all([
  db.prepare(`SELECT operation_id AS operationId,month,payload,retrieved_at AS retrievedAt FROM airport_monthly_stats
    WHERE operation_id='ROUTE_COUNTRY_PASSENGERS' AND month IN (?,?) ORDER BY month LIMIT 2`).bind(selectedMonth,baselineMonth).all<StoredAirportMonth>(),
  db.prepare(`SELECT month FROM airport_monthly_stats WHERE operation_id='ROUTE_COUNTRY_PASSENGERS' AND month>=? AND month<=? ORDER BY month LIMIT 12`).bind(selectedMonth.slice(0,4)+'-01',selectedMonth.slice(0,4)+'-12').all<{month:string}>()
 ]);
 if(result.success===false||available.success===false)throw Error('AIRPORT_MONTHLY_STATS_READ_FAILED');
 const exact=(month:string)=>{const row=result.results?.find(row=>row.month===month);if(!row)return null;const value=decodeAirportStatsMonth(row);if(!value)throw Error('AIRPORT_MONTHLY_STATS_PAYLOAD_INVALID');return value;};
 return {selectedMonth,baselineMonth,selected:exact(selectedMonth),baseline:exact(baselineMonth),availableMonths:(available.results??[]).map(row=>row.month)};
}
