import sides from '../config/airport-sides.v1.json' with { type: 'json' };
import destinations from '../config/airport-destinations.v1.json' with { type: 'json' };
import { AIRLINE_REGISTRY, AIRLINE_REGISTRY_SOURCE } from './airline-registry';
import { SUPPRESSED_AIRLINE_DESIGNATORS } from './airline-country';
import { PROFILE_VERSION } from './airport-day-profile';
import { AIRPORT_SIDES_VERSION } from './airport-sides';
import { sha256 } from './hash';
import { compositionHash, type AirportCompositionRecord } from './airport-monthly-store';

// Bump when aggregation/normalization semantics change, even without table changes.
const CALCULATION_VERSION = 1;
export const compositionClassification = () => sha256({ calculation: CALCULATION_VERSION,
  profile: PROFILE_VERSION, sides, destinations, airlines: AIRLINE_REGISTRY,
  airlineSource: AIRLINE_REGISTRY_SOURCE, suppressed: SUPPRESSED_AIRLINE_DESIGNATORS });
export interface CompositionObserver { epoch: string; tokens: Map<string,string> }
export interface CompositionProof { epoch: string; token: string; classification: string; scans: string }

/** Missing or partial migration keeps the original raw-read path. Other DB errors propagate. */
export async function compositionObserver(db:D1Database,from:string,to:string):Promise<CompositionObserver|null> {
  const schema = await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='airport_flights' AND name IN ('airport_composition_insert','airport_composition_update','airport_composition_delete') ORDER BY name").all<{name:string;sql:string}>();
  if(schema.success===false)throw new Error('Composition observer schema read failed');
  // Exact normalized definitions from migration 0027; names alone do not prove observation.
  if(schema.results?.length!==3 || await sha256(schema.results.map(row=>row.sql.replace(/\s+/g,' ').trim()))!=='1983ffe9bb122f96777ed0458c713808f6c56fa60a523f6691a68fec5823c4be')return null;
  try {
    const epochs=await db.prepare('SELECT epoch FROM airport_composition_observer WHERE id=1').all<{epoch:string}>();
    if(epochs.success===false)throw new Error('Composition observer epoch read failed');
    if(!epochs.results?.[0]?.epoch)return null;
    const rows=await db.prepare('SELECT day,token FROM airport_composition_generations WHERE day>=? AND day<=?').bind(from,to).all<{day:string;token:string}>();
    if(rows.success===false || !rows.results)throw new Error('Composition observer generation read failed');
    return {epoch:epochs.results[0].epoch,tokens:new Map(rows.results.map(row=>[row.day,row.token]))};
  } catch(error) {
    if(/no such table: (?:main\.)?airport_composition_(?:observer|generations)\b/i.test(String(error)))return null;
    throw error;
  }
}
export function observerToken(observer:CompositionObserver,day:string) {
  return observer.tokens.get(day)??observer.epoch;
}
function validProfile(value:unknown,day:string):boolean {
  const p=value as Record<string,unknown>|null;
  const count=(n:unknown):n is number=>typeof n==='number' && Number.isSafeInteger(n) && n>=0;
  if(!p || p.day!==day || p.v!==PROFILE_VERSION || p.complete!==true || p.sidesVersion!==AIRPORT_SIDES_VERSION
    || !count(p.unknownBuilding) || !count(p.cancelled))return false;
  return ['T1','T2','CONCOURSE'].every(key=>{
    const t=p[key] as Record<string,unknown>|null;
    if(!t || !count(t.total) || !Array.isArray(t.hours) || t.hours.length!==24
      || !Array.isArray(t.sides) || t.sides.length!==4 || !t.destinations || typeof t.destinations!=='object' || Array.isArray(t.destinations))return false;
    return [t.hours,t.sides,Object.values(t.destinations)].every(values=>values.every(count) && values.reduce((a,b)=>a+b,0)===t.total);
  });
}
export async function reusableComposition(record:AirportCompositionRecord|undefined,day:string,proof:CompositionProof):Promise<boolean> {
  if(!record)return false;
  try {
    const payload=JSON.parse(record.payload);
    const stored=payload.compositionProof;
    return validProfile(payload.profile,day)
      && stored?.epoch===proof.epoch && stored?.token===proof.token
      && stored?.classification===proof.classification && stored?.scans===proof.scans
      && await compositionHash(payload)===record.sourceHash;
  } catch { return false; }
}
