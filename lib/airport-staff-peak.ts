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

/** Compact zone totals for this peak hour; detailed gate lists remain elsewhere. */
export function staffDepartureGateLines(peak:NonNullable<StaffDeparturePeak>,lang:'ko'|'en'|'zh'|'ja'='ko'):string[]{
 const number=new Intl.NumberFormat(lang);
 const copy={
  ko:{WEST:'서편',EAST:'동편',CENTER:'중앙',concourse:'탑승동',unknown:'미확인',excluded:'은 구역별 편수에서 제외했습니다.'},
  en:{WEST:'West',EAST:'East',CENTER:'Centre',concourse:'Concourse',unknown:'Unverified',excluded:'; excluded from zone counts.'},
  zh:{WEST:'西侧',EAST:'东侧',CENTER:'中央',concourse:'卫星厅',unknown:'未确认',excluded:'，未计入各区域班次。'},
  ja:{WEST:'西側',EAST:'東側',CENTER:'中央',concourse:'搭乗棟',unknown:'未確認',excluded:'は区域別の便数から除外しています。'},
 }[lang];
 const countText=(count:number)=>`${number.format(count)}${lang==='en'?(count===1?' flight':' flights'):lang==='zh'?'班':lang==='ja'?'便':'편'}`;
 const order={WEST:0,EAST:1,CENTER:2};
 const lines=peak.gateBuildings.map(row=>`${row.building==='CONCOURSE'?copy.concourse:row.building} ${[...row.zones].sort((a,b)=>order[a.side]-order[b.side]).map(zone=>`${copy[zone.side]} ${countText(zone.total)}`).join(' · ')}.`);
 // Preserve every unassigned/unmapped/unknown-building flight outside known zones.
 const unknown=peak.unknown.unassigned+peak.unknown.side+peak.unknown.building;
 if(unknown>0)lines.push(`${copy.unknown} ${countText(unknown)}${copy.excluded}`);
 return lines;
}
