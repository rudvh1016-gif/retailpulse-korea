import {gateSideOf} from './airport-sides';
import type {MapFlight} from './airport-departure-map';

const buildings=['T1','T2','CONCOURSE'] as const;
const sides=['EAST','WEST','CENTER'] as const;
type PeakFlight=Pick<MapFlight,'scheduledAt'|'building'|'gate'>;

/**
 * Selected-day scheduled departure concentration, never passenger or shop demand.
 * The caller supplies the same physical departures as glanceFlights: codeshares
 * already collapsed, latest assignments retained and cancelled flights excluded.
 */
export function staffDeparturePeak(day:string,flights:readonly PeakFlight[]|null){
 const start=Date.parse(`${day}T00:00:00+09:00`);
 if(!flights||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(start))return null;
 const bins=Array.from({length:24},()=>[] as PeakFlight[]);
 for(const row of flights){const hour=Math.floor((Date.parse(row.scheduledAt)-start)/3_600_000);if(hour>=0&&hour<24)bins[hour].push(row);}
 const maximum=Math.max(...bins.map(rows=>rows.length));if(!maximum)return null;
 const hour=bins.findIndex(rows=>rows.length===maximum),rows=bins[hour];
 const unknown={unassigned:0,building:0,side:0};
 const gates=new Map<string,number>();
 for(const row of rows){
  const gate=row.gate?.trim();
  // Mutually exclusive exclusions: a missing gate is never a gate numbered 0.
  if(!gate){unknown.unassigned++;continue;}
  if(row.building==='UNKNOWN'){unknown.building++;continue;}
  const side=gateSideOf(row.building,gate);
  if(side==='UNVERIFIED'){unknown.side++;continue;}
  // Keep the physical building in the key; concourse gates never become T1 gates.
  const key=`${row.building}:${side}:${gate}`;
  gates.set(key,(gates.get(key)??0)+1);
 }
 const gateBuildings=buildings.flatMap(building=>{
  const zones=sides.map(side=>{
   const prefix=`${building}:${side}:`;
   const counts=[...gates].filter(([key])=>key.startsWith(prefix)).map(([key,count])=>({gate:key.slice(prefix.length),count}));
   const count=Math.max(0,...counts.map(row=>row.count));
   return {side,total:counts.reduce((sum,row)=>sum+row.count,0),count,gates:counts.filter(row=>row.count===count).map(row=>row.gate).sort((a,b)=>Number(a)-Number(b))};
  });
  return zones.some(zone=>zone.total>0)?[{building,zones}]:[];
 });
 return {hour,endHour:hour+1,flights:maximum,tiedHours:bins.filter(rows=>rows.length===maximum).length,gateBuildings,unknown};
}
export type StaffDeparturePeak=ReturnType<typeof staffDeparturePeak>;

/** Gate counts, not nearby passenger/shop crowding; retain every joint leader. */
export function staffDepartureGateLines(peak:NonNullable<StaffDeparturePeak>):string[]{
 const number=new Intl.NumberFormat('ko-KR');
 const labels={EAST:'동편',WEST:'서편',CENTER:'중앙'};
 const lines=peak.gateBuildings.map(row=>`${row.building==='CONCOURSE'?'탑승동':row.building} ${row.zones.filter(zone=>zone.side!=='CENTER'||zone.total>0).map(zone=>{
  if(!zone.count)return `${labels[zone.side]} 배정 확인 0편`;
  const tied=zone.gates.length>1;
  return `${labels[zone.side]} ${zone.gates.join('·')}번 게이트 ${tied?'각 ':''}${number.format(zone.count)}편(${tied?'공동 최다':'최다'})`;
 }).join(' / ')}.`);
 if(!lines.length)lines.push('확인된 게이트가 없어 동·서편 최다 게이트를 정하지 않았습니다.');
 const excluded=[peak.unknown.unassigned?`게이트 미배정 ${number.format(peak.unknown.unassigned)}편`:null,peak.unknown.side?`게이트 위치 미확인 ${number.format(peak.unknown.side)}편`:null,peak.unknown.building?`건물 미정 ${number.format(peak.unknown.building)}편`:null].filter(Boolean);
 if(excluded.length)lines.push(`${excluded.join(' · ')}은 위 게이트 비교에서 제외했습니다.`);
 return lines;
}
