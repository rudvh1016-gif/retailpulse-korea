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
  label:t(lang,`${year}년 ${month}월 공식 실적 · 시간대별 하루 평균`,`${stats.month} actual departing passengers, daily mean for the same hour · whole airport`,`${stats.month} 同一时段日均实际出发旅客 · 机场整体`,`${stats.month} 同じ時間帯の1日平均実際の出発旅客・空港全体`),
  short:t(lang,`${stats.month} 실적 평균`,`${stats.month} actual mean`,`${stats.month} 实绩平均`,`${stats.month} 実績平均`),
  note:t(lang,`회색 선은 ${year}년 ${month}월의 시간대별 하루 평균 출발 여객입니다. 월 출발 여객을 ${days}일로 나눈 값입니다. 오늘 예상과 집계 기준이 달라 단순 비교는 참고용으로 봐주세요.`,`The grey line shows average daily departures by hour for ${stats.month}, dividing that month's passengers by ${days} days. Its counting basis differs from today's forecast; compare them for reference only.`,`灰线为${year}年${month}月各时段的日均出发旅客，即月度旅客数除以${days}天。与今日预测的统计口径不同，仅供参考比较。`,`灰色の線は${year}年${month}月の時間帯別の1日平均出発旅客です。月間旅客を${days}日で割った値で、今日の予測とは集計基準が異なるため参考比較にとどめてください。`)};
}
export function useTimeBandReference(serviceDate:string|null,lang:Lang):FlowReference|null{
 const {reply}=useAirportPassengerStats(serviceDate?serviceDate.slice(0,7):null);
 return timeBandReference(reply?.current.TIME_BAND_PASSENGERS,lang);
}
