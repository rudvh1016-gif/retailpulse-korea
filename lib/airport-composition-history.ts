import { summarizeAirlineRanking, type AirlineRankingFlightRow, type AirlineRankingForScope } from './airline-ranking';
import { lookupAirline } from './airline-country';
import { kstDayOf,shiftKstDay } from './kst';
import { dailyFlightProfile } from './airport-day-profile';
import { compositionHash, prepareAirportMonths } from './airport-monthly-store';
import { previousFlightMonth } from './airport-monthly-flights';
export function compareComposition(current:AirlineRankingForScope,past:AirlineRankingForScope) {
  const changes=(kind:'airlines'|'countries')=>{
    const key=(row:{iata?:string|null;country?:string|null})=>kind==='airlines'?row.iata:row.country;
    return [...new Set([...current[kind],...past[kind]].map(key).filter((v):v is string=>!!v))].map(id=>{
      const value=current[kind].find(row=>key(row)===id)?.flights??0;
      const baseline=past[kind].find(row=>key(row)===id)?.flights??0;
      return {id,current:value,previous:baseline,delta:value-baseline,percent:baseline>0?(value-baseline)/baseline*100:null};
    }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.id.localeCompare(b.id));
  };
  return {airlines:changes('airlines'),countries:changes('countries')};
}
/**
 * Once after an existing A1 runner. Rebuild bounded days to detect historical corrections.
 * Skip no-op UPSERT requests only after reading and recomputing the day's raw rows.
 *
 * The payload also carries the day's flight profile (lib/airport-day-profile.ts)
 * from the same rows: hours, gate sides and destinations per terminal. It is
 * read only by the airport-days route. A day is marked complete only when a
 * scan covering it ran after the day had ended.
 */
export async function collectAirportComposition(db:D1Database,now=new Date()) {
  const today=kstDayOf(now.toISOString());
  const scanResult=await db.prepare("SELECT detail, started_at AS startedAt FROM collector_runs WHERE source_id='INCHEON_FLIGHT_DETAIL' AND status='SUCCESS' AND started_at>=? ORDER BY started_at DESC LIMIT 400")
    .bind(previousFlightMonth(today.slice(0,7))+'-01T00:00:00+09:00').all<{detail:string;startedAt:string}>();
  if(scanResult.success===false)throw new Error('Composition scan evidence read failed');
  const scans=(scanResult.results ?? [])
    .map(row=>{const match=/^recent (\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2});/.exec(row.detail); return match?{from:match[1],to:match[2],startedAt:row.startedAt}:null;})
    .filter((scan):scan is {from:string;to:string;startedAt:string}=>scan!==null);
  const retainedResult=await db.prepare('SELECT day,payload,source_hash AS sourceHash FROM airport_daily_composition WHERE day>=? AND day<=? ORDER BY day DESC LIMIT 64')
    .bind(shiftKstDay(today,-63),today).all<{day:string;payload:string;sourceHash:string}>();
  if(retainedResult.success===false)throw new Error('Composition retained evidence read failed');
  const retained=retainedResult.results??[];
  const records=new Map(retained.map(record=>[record.day,record]));
  let written=0;
  for(let days=0;days<=28;days++) {
    const day=shiftKstDay(today,-days);
    const covering=scans.filter(scan=>scan.from<=day && scan.to>=day);
    if(!covering.length) continue;
    const dayEnd=Date.parse(`${shiftKstDay(day,1)}T00:00:00+09:00`);
    const complete=covering.some(scan=>Date.parse(scan.startedAt)>=dayEnd);
    const selected=await db.prepare(`SELECT physical_flight_id AS physicalFlightId,terminal,flight_number AS operatingFlight,
      retrieved_at AS retrievedAt,gate,scheduled_at AS scheduledAt,status,airport_code AS airportCode
      FROM airport_flights WHERE direction='departure' AND scheduled_at>=? AND scheduled_at<?
      AND physical_flight_id IS NOT NULL LIMIT 2001`).bind(day,shiftKstDay(day,1)).all<AirlineRankingFlightRow & Record<string,unknown>>();
    if(selected.success===false)throw new Error('Composition raw read failed');
    const rows=selected.results ?? [];
    if(!rows.length || rows.length>=2001) continue;
    const summary=summarizeAirlineRanking(rows,lookupAirline,300);
    const profile=dailyFlightProfile(rows,day,complete);
    // Retrieval time is provenance, excluded from semantic count hash.
    const prior=records.get(day);
    let monthlyRollups:unknown;
    let damaged=false;
    try {
      const parsed=prior?JSON.parse(prior.payload):undefined;
      monthlyRollups=parsed?.monthlyRollups;
      damaged=!!prior && await compositionHash(parsed)!==prior.sourceHash;
      if(damaged)monthlyRollups=undefined;
    } catch { damaged=!!prior; /* daily recovery does not trust unreadable extensions */ }
    const payload={...summary,profile,...(monthlyRollups?{monthlyRollups}:{})};
    const hash=await compositionHash(payload);
    // Preserve fresh in-memory provenance for monthly preparation, even without a DB write.
    if(prior?.sourceHash===hash && !damaged){
      records.set(day,{day,payload:JSON.stringify(payload),sourceHash:hash});
      continue;
    }
    const result=await db.prepare(`INSERT INTO airport_daily_composition(day,payload,source_hash,calculated_at) VALUES(?,?,?,?)
      ON CONFLICT(day) DO UPDATE SET payload=excluded.payload,source_hash=excluded.source_hash,calculated_at=excluded.calculated_at
      WHERE airport_daily_composition.source_hash<>excluded.source_hash OR ?`).bind(day,JSON.stringify(payload),hash,now.toISOString(),Number(damaged)).run();
    if(result.success===false)throw new Error('Composition write failed');
    written+=Number(result.meta?.changes??0);
    records.set(day,{day,payload:JSON.stringify(payload),sourceHash:hash});
  }
  const monthly=await prepareAirportMonths(db,today,[...records.values()],scans);
  return {status:'SUCCESS',records:written+monthly.records,monthly};
}
