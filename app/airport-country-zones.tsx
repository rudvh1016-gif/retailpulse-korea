'use client';
import {useMemo,useState} from 'react';
import {useFlights} from './flights-client';
import {AirportZoneCountries} from './airport-zone-countries';
import {AirportMonthlyFlights} from './airport-monthly-flights';
import {departureMap,presetWindow,customWindow,type FlightBuildingScope,type WindowPreset} from '../lib/airport-departure-map';
import {kstDayOf,shiftKstDay} from '../lib/kst';
import {usePresentationClock} from './presentation-clock';
import {useAirportHashReveal} from './use-airport-hash-reveal';

export default function AirportCountryZones({date,initialScope}:{date?:string|null;initialScope?:string|null}){
 useAirportHashReveal();
 const today=kstDayOf(new Date().toISOString());
 const [day,setDay]=useState(date??today);
 const [scope,setScope]=useState<FlightBuildingScope>(initialScope&&['all','T1','T2','CONCOURSE'].includes(initialScope)?initialScope as FlightBuildingScope:'T2');
 const [preset,setPreset]=useState<WindowPreset>('DAY');
 const [hours,setHours]=useState<[number,number]>([9,18]);
 const now=usePresentationClock(new Date().toISOString()),kst=new Date(now+9*3_600_000),isToday=day===kst.toISOString().slice(0,10);
 const activePreset=!isToday&&preset!=='CUSTOM'?'DAY':preset;
 const span=activePreset==='CUSTOM'?(customWindow(hours[0],hours[1])??{startMin:0,endMin:1440}):presetWindow(activePreset,isToday?kst.getUTCHours()*60+kst.getUTCMinutes():null);
 const {startMin,endMin}=span;
 const current=useFlights(day,scope);
 const next=useFlights(span.endMin>1440?shiftKstDay(day,1):null,scope);
 const map=useMemo(()=>current?.status==='OK'&&current.payload.truncated===false&&current.payload.flights.length>0
   ?departureMap({date:day,nextDate:shiftKstDay(day,1),terminal:scope==='T2'?'T2':'T1',buildingScope:scope,window:{startMin,endMin},rows:current.payload.flights,nextRows:next?.status==='OK'&&next.payload.truncated===false?next.payload.flights:null})
   :null,[current,next,day,scope,startMin,endMin]);
 return <section aria-label="국가별 출발 구역">
  <p className="airport-period-basis">목적지별 출발편을 터미널과 탑승 구역에서 확인합니다 · 승객 국적 아님</p>
  <div className="airport-period-modes" role="group" aria-label="출발 구역 터미널 선택">{(['all','T1','CONCOURSE','T2'] as const).map(value=><button type="button" key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{({all:'전체',T1:'T1 본관',CONCOURSE:'탑승동',T2:'T2'})[value]}</button>)}</div>
  <label>날짜 <input aria-label="날짜" type="date" value={day} onChange={e=>{if(e.target.value){setDay(e.target.value);setPreset('DAY');}}}/></label>
  <div className="airport-period-modes" role="group" aria-label="출발 시간 선택">{(['DAY',...(isToday?['NEXT1','NEXT3','NEXT6'] as const:[]),'CUSTOM'] as WindowPreset[]).map(value=><button type="button" key={value} aria-pressed={activePreset===value} onClick={()=>setPreset(value)}>{({DAY:'하루 전체',NEXT1:'1시간',NEXT3:'3시간',NEXT6:'6시간',CUSTOM:'시간 직접 선택'})[value]}</button>)}</div>
  {activePreset==='CUSTOM'&&<p><label>시작 <select aria-label="시작" value={hours[0]} onChange={e=>{const v=Number(e.target.value);setHours([v,Math.max(v+1,hours[1])]);}}>{Array.from({length:24},(_,h)=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label>{' '}<label>끝 <select aria-label="끝" value={hours[1]} onChange={e=>setHours([hours[0],Number(e.target.value)])}>{Array.from({length:24-hours[0]},(_,i)=>i+hours[0]+1).map(h=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label></p>}
  {current===undefined||(span.endMin>1440&&next===undefined)?<p role="status">항공편 자료를 불러오는 중입니다</p>:current.status==='FAILED'||!map||map.nextDay==='MISSING'?<p role="status">선택한 날짜와 시간의 항공편 자료를 확인할 수 없습니다</p>:<><p className="airport-period-basis">{current.payload.basis==='OFFICIAL_DEPARTURE_SCHEDULE'?'출발 예정편':'수집된 출발편 기록'} · 수집 시각 {current.payload.retrievedAt??'확인 불가'} · {isToday?'당일 자료는 변경될 수 있습니다':'저장 기록 기준'}{span.endMin>1440&&next?.status==='OK'&&<> · 다음 날: {next.payload.basis==='OFFICIAL_DEPARTURE_SCHEDULE'?'출발 예정편':'수집된 출발편 기록'} · 수집 시각 {next.payload.retrievedAt??'확인 불가'}</>}</p><AirportZoneCountries map={map} lang="ko" date={day} isToday={isToday} basis={scope==='CONCOURSE'?'공식 터미널 코드 P02 또는 확인된 탑승동 게이트로 분류한 물리적 출발편입니다. 편수는 사람 수가 아닙니다.':undefined}/></>}
  <AirportMonthlyFlights lang="ko" terminal={scope} date={day}/>
 </section>;
}
