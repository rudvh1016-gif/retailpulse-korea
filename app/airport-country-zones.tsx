'use client';
import {useMemo,useState} from 'react';
import {useFlights} from './flights-client';
import {AirportZoneCountries} from './airport-zone-countries';
import {AirportMonthlyFlights} from './airport-monthly-flights';
import {departureMap,type FlightBuildingScope} from '../lib/airport-departure-map';
import {kstDayOf,shiftKstDay} from '../lib/kst';

export default function AirportCountryZones({date,initialScope}:{date?:string|null;initialScope?:string|null}){
 const today=kstDayOf(new Date().toISOString());
 const [day,setDay]=useState(date??today);
 const [scope,setScope]=useState<FlightBuildingScope>(initialScope&&['all','T1','T2','CONCOURSE'].includes(initialScope)?initialScope as FlightBuildingScope:'T2');
 const current=useFlights(day,scope);
 const map=useMemo(()=>current?.status==='OK'&&!current.payload.truncated&&current.payload.flights.length>0
   ?departureMap({date:day,nextDate:shiftKstDay(day,1),terminal:scope==='T2'?'T2':'T1',buildingScope:scope,window:{startMin:0,endMin:1440},rows:current.payload.flights})
   :null,[current,day,scope]);
 return <section aria-label="국가별 출발 구역">
  <p className="airport-period-basis">목적지별 출발편을 터미널과 탑승 구역에서 확인합니다 · 승객 국적 아님</p>
  <div className="airport-period-modes" role="group" aria-label="출발 구역 터미널 선택">{(['all','T1','CONCOURSE','T2'] as const).map(value=><button type="button" key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{({all:'전체',T1:'T1 본관',CONCOURSE:'탑승동',T2:'T2'})[value]}</button>)}</div>
  <label>날짜 <input type="date" value={day} onChange={e=>{if(e.target.value)setDay(e.target.value);}}/></label>
  <AirportMonthlyFlights lang="ko" terminal={scope} date={day}/>
  {current===undefined?<p role="status">항공편 자료를 불러오는 중입니다</p>:current.status==='FAILED'||!map?<p role="status">선택한 날짜의 완전한 항공편 자료를 확인할 수 없습니다</p>:<><p className="airport-period-basis">{current.payload.basis==='OFFICIAL_DEPARTURE_SCHEDULE'?'출발 예정편':'수집된 출발편 기록'} · 수집 시각 {current.payload.retrievedAt??'확인 불가'} · {day===today?'당일 자료는 변경될 수 있습니다':'저장 기록 기준'}</p><AirportZoneCountries map={map} lang="ko" date={day} isToday={day===today}/></>}
 </section>;
}
