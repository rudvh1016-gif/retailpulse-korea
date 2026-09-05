import { summarizeAirlineRanking, type AirlineRankingFlightRow, type AirlineRankingForScope } from './airline-ranking';
import { lookupAirline } from './airline-country';
import { kstDayOf,shiftKstDay } from './kst';
import { sha256 } from './hash';
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
/** Once after an existing A1 runner. Rebuild bounded days; unchanged aggregates cost no writes. */
export async function collectAirportComposition(db:D1Database,now=new Date()) {
  const scans=((await db.prepare("SELECT detail FROM collector_runs WHERE source_id='INCHEON_FLIGHT_DETAIL' AND status='SUCCESS' ORDER BY started_at DESC LIMIT 100").all<{detail:string}>()).results ?? [])
    .map(row=>/^recent (\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2});/.exec(row.detail)).filter(Boolean);
  let written=0;
  for(let days=0;days<=28;days++) {
    const day=shiftKstDay(kstDayOf(now.toISOString()),-days);
    if(!scans.some(scan=>scan && scan[1]<=day && scan[2]>=day)) continue;
    const rows=(await db.prepare(`SELECT physical_flight_id AS physicalFlightId,terminal,flight_number AS operatingFlight,
      retrieved_at AS retrievedAt FROM airport_flights WHERE direction='departure' AND scheduled_at>=? AND scheduled_at<?
      AND physical_flight_id IS NOT NULL LIMIT 2001`).bind(day,shiftKstDay(day,1)).all<AirlineRankingFlightRow>()).results ?? [];
    if(!rows.length || rows.length>=2001) continue;
    const summary=summarizeAirlineRanking(rows,lookupAirline,300);
    // Retrieval time is provenance, excluded from semantic count hash.
    const hash=await sha256({all:{...summary.all,retrievedAt:null},byTerminal:Object.fromEntries(Object.entries(summary.byTerminal).map(([k,v])=>[k,{...v,retrievedAt:null}]))});
    const result=await db.prepare(`INSERT INTO airport_daily_composition(day,payload,source_hash,calculated_at) VALUES(?,?,?,?)
      ON CONFLICT(day) DO UPDATE SET payload=excluded.payload,source_hash=excluded.source_hash,calculated_at=excluded.calculated_at
      WHERE airport_daily_composition.source_hash<>excluded.source_hash`).bind(day,JSON.stringify(summary),hash,now.toISOString()).run();
    written+=Number(result.meta?.changes??0);
  }
  return {status:'SUCCESS',records:written};
}
