'use client';
import {useEffect,useState} from 'react';
import type {Lang} from './retailpulse-data';
import type {AirportStatsMonth,AirportStatsOperationId} from '../lib/airport-monthly-stats-read';
export interface AirportPassengerStatsReply {status:string;month:string|null;previousMonth:string|null;current:Partial<Record<AirportStatsOperationId,AirportStatsMonth>>;previous:Partial<Record<AirportStatsOperationId,AirportStatsMonth>>}
/** One read per month for the whole page: the monthly table and the hourly figure share it.
 * A failed read is forgotten so the next mount asks again. */
const reads=new Map<string,Promise<AirportPassengerStatsReply>>();
function readMonth(month:string):Promise<AirportPassengerStatsReply>{
 const known=reads.get(month);
 if(known)return known;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15_000);
 const read=fetch(`/api/live/airport-passenger-stats?month=${encodeURIComponent(month)}`,{signal:controller.signal})
  .then(response=>response.ok?response.json() as Promise<AirportPassengerStatsReply>:Promise.reject(new Error(String(response.status))))
  .finally(()=>clearTimeout(timeout));
 read.catch(()=>reads.delete(month));
 reads.set(month,read);
 return read;
}
export function useAirportPassengerStats(month:string|null){
 const [state,setState]=useState<{month:string;reply:AirportPassengerStatsReply|null;failed:boolean}|null>(null);
 useEffect(()=>{
  if(!month)return;
  let active=true;
  readMonth(month).then(reply=>{if(active)setState({month,reply,failed:false});},()=>{if(active)setState(previous=>({month,reply:previous?.month===month?previous.reply:null,failed:true}));});
  return()=>{active=false;};
 },[month]);
 return {reply:state?.month===month?state.reply:null,failed:state?.month===month&&state.failed};
}
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
  label:t(lang,`${stats.month} 같은 시간 하루 평균 실제 출발 여객 · 공항 전체`,`${stats.month} actual departing passengers, daily mean for the same hour · whole airport`,`${stats.month} 同一时段日均实际出发旅客 · 机场整体`,`${stats.month} 同じ時間帯の1日平均実際の出発旅客・空港全体`),
  short:t(lang,`${stats.month} 실적 평균`,`${stats.month} actual mean`,`${stats.month} 实绩平均`,`${stats.month} 実績平均`),
  note:t(lang,`회색 선은 인천국제공항공사 시간대별 항공 통계(공공데이터포털 15095070)의 ${stats.month} 월 출발 여객을 그달 ${days}일로 나눈 하루 평균입니다. 출국장 예상과 집계 범위가 다를 수 있어 둘의 차이를 오차로 보지 않습니다.`,`The grey line is ${stats.month} departing passengers from Incheon Airport hourly statistics (Public Data Portal 15095070) divided by that month's ${days} days. Its scope can differ from the departure-hall forecast, so the gap is not a forecast error.`,`灰线为仁川国际机场公社分时段航空统计（公共数据门户15095070）${stats.month}月出发旅客除以当月${days}天的日均值。与出境大厅预测的统计范围可能不同，两者差异不视为误差。`,`灰色の線は仁川国際空港公社の時間帯別航空統計（公共データポータル15095070）の${stats.month}月の出発旅客をその月の${days}日で割った1日平均です。出国場の予測と集計範囲が異なる場合があるため、差を誤差とはみなしません。`)};
}
export function useTimeBandReference(serviceDate:string|null,lang:Lang):FlowReference|null{
 const {reply}=useAirportPassengerStats(serviceDate?serviceDate.slice(0,7):null);
 return timeBandReference(reply?.current.TIME_BAND_PASSENGERS,lang);
}
