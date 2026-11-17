/** Read-only contracts for separately isolated A5 and KMA recovery. No collectors in Worker imports. */
import {publicAreaIds} from './areas';
import {kstDayOf,shiftKstDay} from './kst';
import {summarizePassengerForecast,type AirportForecastAggregateRow} from './airport-today-summary';
export type ForecastFamily='A5'|'WEATHER';
export type ForecastRow=Record<string,unknown>;
export interface ForecastPublication {version:1;family:ForecastFamily;checkedAt:string;issuance:string|null;rows:ForecastRow[]}
export interface ForecastReadClients {a5?:D1Database;weather?:D1Database;unavailable?:string[]}
export function forecastFamily(source:string):ForecastFamily|null {
 if(source==='airport_passenger_forecast'||source==='airport_passenger_forecast_recovery')return 'A5';
 if(source==='weather'||source==='weather_recovery')return 'WEATHER';return null;
}
export function expectedWeatherIssuance(now:number):string {
 const shifted=new Date(now+9*3600000),minutes=shifted.getUTCHours()*60+shifted.getUTCMinutes();
 const hour=[2,5,8,11,14,17,20,23].filter(h=>h*60+30<=minutes).at(-1);
 const day=hour===undefined?shiftKstDay(shifted.toISOString().slice(0,10),-1):shifted.toISOString().slice(0,10);
 return `${day}T${String(hour??23).padStart(2,'0')}:00:00+09:00`;
}
export function validForecastPublication(value:unknown,family:ForecastFamily,now:number,requireCurrent=true):value is ForecastPublication {
 if(!value||typeof value!=='object')return false;const p=value as ForecastPublication;
 if(p.version!==1||p.family!==family||!Number.isFinite(Date.parse(p.checkedAt))||Date.parse(p.checkedAt)>now||!Array.isArray(p.rows)||p.rows.length===0)return false;
 if(family==='A5') {
  if(p.rows.length!==192||requireCurrent&&now-Date.parse(p.checkedAt)>3600000)return false;
  const today=kstDayOf(new Date(now).toISOString()),days=[today,shiftKstDay(today,1)];
  if(p.rows.some(r=>!days.includes(String(r.targetDate))||r.isAggregate!==1||!['T1','T2'].includes(String(r.terminal))||!['departure','arrival'].includes(String(r.direction))||typeof r.expectedPassengers!=='number'||!Number.isFinite(r.expectedPassengers)||r.expectedPassengers<0))return false;
  return days.every(day=>['departure','arrival'].every(direction=>{
   const summary=summarizePassengerForecast(p.rows.filter(row=>row.targetDate===day) as unknown as AirportForecastAggregateRow[],day,direction as 'departure'|'arrival');
   return summary.coverage.all==='COMPLETE'&&summary.timeline.length===24;
  }));
 }
 if(typeof p.issuance!=='string'||Date.parse(p.checkedAt)<Date.parse(p.issuance)||now-Date.parse(p.checkedAt)>4*3600000||!Number.isFinite(Date.parse(p.issuance))||Date.parse(p.issuance)>now||requireCurrent&&p.issuance!==expectedWeatherIssuance(now)||p.rows.length>200)return false;
 const firstHour=Date.parse(`${kstDayOf(new Date(now).toISOString())}T${new Date(now+9*3600000).toISOString().slice(11,13)}:00:00+09:00`);
 const expected=Array.from({length:24},(_,i)=>firstHour+i*3600000);
 const keys=new Set<string>();
 for(const r of p.rows){const key=`${r.area}:${r.targetAt}`;if(keys.has(key)||!publicAreaIds.includes(r.area as typeof publicAreaIds[number])||r.issuedAt!==p.issuance||!Number.isFinite(Date.parse(String(r.targetAt)))||typeof r.temperatureTenthC!=='number'||!Number.isFinite(r.temperatureTenthC)||typeof r.precipitationProbability!=='number'||!Number.isFinite(r.precipitationProbability)||r.precipitationProbability<0||r.precipitationProbability>100)return false;keys.add(key);}
 return publicAreaIds.every(area=>expected.every(at=>p.rows.some(r=>r.area===area&&Date.parse(String(r.targetAt))===at)));
}
export async function readForecastPublication(db:D1Database,family:ForecastFamily,now:number):Promise<ForecastPublication|null> {
 const row=await db.prepare('SELECT payload FROM recovery_forecast_publications WHERE family=?').bind(family).first<{payload:string}>();
 if(!row)return null;const p:unknown=JSON.parse(row.payload);
 if(!validForecastPublication(p,family,now))throw Error('recovery_forecast_incomplete_or_stale');return p;
}

export async function forecastRecoveryHealth(sources:Record<string,unknown>[],clients:ForecastReadClients,now:number){
 let output=[...sources];const applied:string[]=[],failed=[...(clients.unavailable??[])];
 for(const [family,db] of [['A5',clients.a5],['WEATHER',clients.weather]] as const){
  if(!db)continue;const sourceId=family==='A5'?'INCHEON_PASSENGER_FORECAST':'KMA_VILAGE_FCST';
  try{const p=await readForecastPublication(db,family,now);if(!p)throw Error('missing_publication');output=output.filter(row=>row.sourceId!==sourceId).concat([{sourceId,status:'LIVE',lastRetrievedAt:p.checkedAt,eventAt:p.issuance}]);applied.push(family);}
  catch{failed.push(family);}
 }
 for(const family of failed){const id=family==='A5'?'INCHEON_PASSENGER_FORECAST':'KMA_VILAGE_FCST';output=output.map(row=>row.sourceId===id?{...row,storedStatus:row.status,status:'STALE',recoveryStatus:'UNAVAILABLE'}:row);}
 return {sources:output,applied,failed};
}
