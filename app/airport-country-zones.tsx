'use client';
import {chineseText} from '../lib/chinese-ui';
import {useMemo,useState} from 'react';
import type {Lang} from './retailpulse-data';
import {useFlights} from './flights-client';
import {AirportZoneCountries} from './airport-zone-countries';
import {AirportMonthlyFlights} from './airport-monthly-flights';
import {departureMap,presetWindow,customWindow,type FlightBuildingScope,type WindowPreset} from '../lib/airport-departure-map';
import {kstDayOf,shiftKstDay} from '../lib/kst';
import {usePresentationClock} from './presentation-clock';
import {useAirportHashReveal} from './use-airport-hash-reveal';

export default function AirportCountryZones({date,initialScope,lang='ko'}:{date?:string|null;initialScope?:string|null;lang?:Lang}){
 const t=(ko:string,zh:string)=>chineseText(lang,lang==='zh'?zh:ko);
 useAirportHashReveal();
 const today=kstDayOf(new Date().toISOString());
 const [dayChoice,setDayChoice]=useState<{initial:string|null|undefined;value:string}|null>(null);
 const day=dayChoice&&dayChoice.initial===date?dayChoice.value:date??today;
 const setDay=(value:string)=>setDayChoice({initial:date,value});
 const [scopeChoice,setScopeChoice]=useState<{initial:string|null|undefined;value:FlightBuildingScope}|null>(null);
 const scope:FlightBuildingScope=scopeChoice&&scopeChoice.initial===initialScope?scopeChoice.value:initialScope&&['all','T1','T2','CONCOURSE'].includes(initialScope)?initialScope as FlightBuildingScope:'T2';
 const setScope=(value:FlightBuildingScope)=>setScopeChoice({initial:initialScope,value});
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
 return <section className="airport-country-zones" data-scope={scope} aria-label={t("국가별 출발 구역","各国航班出发区域")}>
  <div className="airport-period-modes" role="group" aria-label={t("출발 구역 터미널 선택","选择出发区域航站楼")}>{(['all','T1','CONCOURSE','T2'] as const).map(value=><button type="button" key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{({all:t('전체','全部'),T1:t('T1 본관','T1主楼'),CONCOURSE:t('탑승동','卫星厅'),T2:'T2'})[value]}</button>)}</div>
  <label>{t("날짜","日期")} <input aria-label={t("날짜","日期")} type="date" value={day} onChange={e=>{if(e.target.value){setDay(e.target.value);setPreset('DAY');}}}/></label>
  <div className="airport-period-modes" role="group" aria-label={t("출발 시간 선택","选择出发时间")}>{(['DAY',...(isToday?['NEXT1','NEXT3','NEXT6'] as const:[]),'CUSTOM'] as WindowPreset[]).map(value=><button type="button" key={value} aria-pressed={activePreset===value} onClick={()=>setPreset(value)}>{({DAY:t('하루 전체','全天'),NEXT1:t('1시간','未来1小时'),NEXT3:t('3시간','未来3小时'),NEXT6:t('6시간','未来6小时'),CUSTOM:t('시간 직접 선택','自选时段')})[value]}</button>)}</div>
  {activePreset==='CUSTOM'&&<p><label>{t("시작","开始")} <select aria-label={t("시작","开始")} value={hours[0]} onChange={e=>{const v=Number(e.target.value);setHours([v,Math.max(v+1,hours[1])]);}}>{Array.from({length:24},(_,h)=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label>{' '}<label>{t("끝","结束")} <select aria-label={t("끝","结束")} value={hours[1]} onChange={e=>setHours([hours[0],Number(e.target.value)])}>{Array.from({length:24-hours[0]},(_,i)=>i+hours[0]+1).map(h=><option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label></p>}
  {current===undefined||(span.endMin>1440&&next===undefined)?<p role="status">{t("항공편 자료를 불러오는 중입니다","正在加载航班资料…")}</p>:current.status==='FAILED'||!map||map.nextDay==='MISSING'?<p role="status">{t("선택한 날짜와 시간의 항공편 자료를 확인할 수 없습니다","无法确认所选日期和时段的航班资料")}</p>:<AirportZoneCountries source={<p className="airport-period-basis">{current.payload.basis==='OFFICIAL_DEPARTURE_SCHEDULE'?t('출발 예정편','计划出发航班'):t('수집된 출발편 기록','已采集的出发航班记录')} · {t("수집 시각","采集时间")} {current.payload.retrievedAt??t('확인 불가','无法确认')} · {isToday?t('당일 자료는 변경될 수 있습니다','当日资料可能变动'):t('저장 기록 기준','以保存记录为准')}{span.endMin>1440&&next?.status==='OK'&&<> · {t("다음 날","次日")}: {next.payload.basis==='OFFICIAL_DEPARTURE_SCHEDULE'?t('출발 예정편','计划出发航班'):t('수집된 출발편 기록','已采集的出发航班记录')} · {t("수집 시각","采集时间")} {next.payload.retrievedAt??t('확인 불가','无法确认')}</>}</p>} map={map} lang={lang} date={day} isToday={isToday} basis={scope==='CONCOURSE'?t('공식 터미널 코드 P02 또는 확인된 탑승동 게이트로 분류한 출발편입니다.','按官方航站楼代码P02或已确认的卫星厅登机口归类的出发航班。'):undefined}/>}
  <AirportMonthlyFlights lang={lang} terminal={scope} date={day}/>
 </section>;
}
