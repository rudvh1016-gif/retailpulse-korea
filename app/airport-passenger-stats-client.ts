'use client';
import {useEffect,useState} from 'react';
import {createStoredReadCache} from '../lib/stored-read-cache';
import type {Lang} from './retailpulse-data';
import type {AirportStatsMonth,AirportStatsOperationId} from '../lib/airport-monthly-stats-read';
export interface AirportPassengerStatsReply {status:string;month:string|null;previousMonth:string|null;current:Partial<Record<AirportStatsOperationId,AirportStatsMonth>>;previous:Partial<Record<AirportStatsOperationId,AirportStatsMonth>>}
export interface AirportPassengerComparisonReply {status:string;selectedMonth:string;baselineMonth:string;selected:AirportStatsMonth|null;baseline:AirportStatsMonth|null;availableMonths:string[]}
async function storedJson(url:string){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15_000);
 try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('STORED_READ_FAILED');const result=await response.json();if(result.status==='UNAVAILABLE'||!result.status)throw Error('STORED_READ_UNAVAILABLE');return result;}finally{clearTimeout(timeout);}
}
const monthReads=createStoredReadCache<AirportPassengerStatsReply>(month=>storedJson('/api/live/airport-passenger-stats?month='+encodeURIComponent(month)));
const comparisonReads=createStoredReadCache<AirportPassengerComparisonReply>(async key=>{
 const [selected,baseline]=key.split('|');const result=await storedJson('/api/live/airport-passenger-comparison?selected='+encodeURIComponent(selected)+'&baseline='+encodeURIComponent(baseline)) as AirportPassengerComparisonReply;
 if(result.selectedMonth!==selected||result.baselineMonth!==baseline||result.selected&&result.selected.month!==selected||result.baseline&&result.baseline.month!==baseline)throw Error('STORED_SELECTION_MISMATCH');return result;
});
function useStoredRead<T>(key:string|null,cache:ReturnType<typeof createStoredReadCache<T>>){
 const [state,setState]=useState<{key:string;reply:T|null;failed:boolean}|null>(null);
 useEffect(()=>{
  if(!key)return;let active=true;
  const refresh=()=>{if(document.visibilityState==='hidden')return;cache.read(key).then(({value,failed})=>{if(active)setState({key,reply:value,failed});},()=>{if(active)setState(previous=>({key,reply:previous?.key===key?previous.reply:null,failed:true}));});};
  refresh();const timer=setInterval(refresh,300_000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[key,cache]);
 return {reply:state?.key===key?state.reply:null,failed:state?.key===key&&state.failed};
}
/** Shared stored reads expire after five minutes; focus/visibility rechecks never call providers. */
export function useAirportPassengerStats(month:string|null){return useStoredRead(month,monthReads);}
export function useAirportPassengerComparison(selected:string|null,baseline:string|null){return useStoredRead(selected&&baseline?selected+'|'+baseline:null,comparisonReads);}
export interface FlowReference {month:string;label:string;short:string;note:string;hours:Array<{startHour:number;endHour:number;value:number}>}
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
/** 15095070 monthly departures per provider hour, as a daily mean over that month's days. */
export function timeBandReference(stats:AirportStatsMonth|undefined,lang:Lang):FlowReference|null{
 if(!stats)return null;
 const [year,month]=stats.month.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const hours=stats.rows.filter(row=>!row.aggregate&&row.startHour!==null&&row.endHour!==null&&row.departures!==null)
  .map(row=>({startHour:row.startHour!,endHour:row.endHour!,value:row.departures!/days}));
 if(!hours.length)return null;
 return {month:stats.month,hours,
  label:t(lang,`${year}년 ${month}월 공식 실적 · 시간대별 하루 평균`,`${stats.month} actual departing passengers, daily mean for the same hour · whole airport`,`${stats.month} 同一时段日均实际出发旅客 · 机场整体`,`${stats.month} 同じ時間帯の1日平均実際の出発旅客・空港全体`),
  short:t(lang,`${stats.month} 실적 평균`,`${stats.month} actual mean`,`${stats.month} 实绩平均`,`${stats.month} 実績平均`),
  note:t(lang,`회색 선은 ${year}년 ${month}월의 시간대별 하루 평균 출발 여객입니다. 월 출발 여객을 ${days}일로 나눈 값입니다. 오늘 예상과 집계 기준이 달라 단순 비교는 참고용으로 봐주세요.`,`The grey line shows average daily departures by hour for ${stats.month}, dividing that month's passengers by ${days} days. Its counting basis differs from today's forecast; compare them for reference only.`,`灰线为${year}年${month}月各时段的日均出发旅客，即月度旅客数除以${days}天。与今日预测的统计口径不同，仅供参考比较。`,`灰色の線は${year}年${month}月の時間帯別の1日平均出発旅客です。月間旅客を${days}日で割った値で、今日の予測とは集計基準が異なるため参考比較にとどめてください。`)};
}
export function useTimeBandReference(serviceDate:string|null,lang:Lang):FlowReference|null{
 const {reply}=useAirportPassengerStats(serviceDate?serviceDate.slice(0,7):null);
 return timeBandReference(reply?.current.TIME_BAND_PASSENGERS,lang);
}
