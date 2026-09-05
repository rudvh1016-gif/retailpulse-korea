'use client';
import { useState } from 'react';
import type { Lang } from './retailpulse-data';
import type { SeoulContext } from '../lib/seoul-context';
import { commercialActivityContext } from '../lib/commercial-context';
export const contextText=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
export function SeoulContextCard({context,lang}:{context?:SeoulContext & {retrievedAt?:string}|null;lang:Lang}) {
  const [expanded,setExpanded]=useState(false);
  if(!context) return null;
  const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
  const weather=context.weather;
  const categories=expanded?context.categories:context.categories.slice(0,3);
  const number=(value:number)=>value.toLocaleString(lang==='ko'?'ko-KR':lang==='ja'?'ja-JP':lang==='zh'?'zh-CN':'en-US');
  return <div className="operational-context">
    {!!context.categories.length && <div>
      <h3>{t('어떤 업종에서 소비하나요?','Activity by business category','哪些行业消费活跃？','どの業種で消費されていますか？')}</h3>
      <small>{t('서울시·신한카드 내국인 소비 · 관측 시각 기준 10분','Seoul/Shinhan domestic-card activity · 10-minute observation window','首尔市·新韩卡韩国居民消费 · 最近10分钟','ソウル市・新韓カード国内消費 · 直近10分')} · {context.commercialAt?`${context.commercialAt.slice(5,16).replace('T',' ')} KST`:t('관측 시각 미제공','Observation time not supplied','未提供观测时间','観測時刻の提供なし')}</small>
      <ul className="context-category-list">{categories.map((row,i)=><li key={`${row.group}:${row.category}:${i}`}>
        <strong>{row.category}</strong><span>{commercialActivityContext(row.level??"",lang)??row.level??'—'}</span>
        <small>{row.amountMin!==null&&row.amountMax!==null?`₩${number(row.amountMin)} ~ ₩${number(row.amountMax)}`:'—'}{row.payments!==null?` · ${number(row.payments)}${t('건',' payments','笔','件')}`:''}</small>
      </li>)}</ul>
      {context.categories.length>3&&<button type="button" className="event-list-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?t('접기','Show less','收起','閉じる'):t(`업종 ${context.categories.length}개 전체 보기`,`All ${context.categories.length} categories`,`查看全部${context.categories.length}个行业`,`${context.categories.length}業種をすべて見る`)}</button>}
    </div>}
    {weather&&<p className="context-environment"><strong>{t('주변 환경 관측','Local environment observation','当前周边环境','現在の周辺環境')}</strong><br/>
      {[weather.temperature!==null?`${weather.temperature}°C`:null,weather.humidity!==null?`${t('습도','Humidity','湿度','湿度')} ${weather.humidity}%`:null,
        weather.wind!==null?`${t('바람','Wind','风','風')} ${weather.wind}m/s`:null,
        weather.pm10!==null?`PM10 ${weather.pm10}μg/m³${weather.pm10Grade?` (${weather.pm10Grade})`:''}`:null,
        weather.pm25!==null?`PM2.5 ${weather.pm25}μg/m³${weather.pm25Grade?` (${weather.pm25Grade})`:''}`:null].filter(Boolean).join(' · ')}
      <small>{t('서울시 실시간 도시데이터 · 관측','Seoul real-time city data · observed','首尔市实时城市数据 · 观测','ソウル市リアルタイム都市データ · 観測')} {weather.observedAt.slice(5,16).replace('T',' ')} KST</small>
    </p>}
  </div>;
}
export function HolidayContext({months,date,lang}:{months?:Array<{month:string;days:Array<{date:string;name:string}>;retrievedAt:string}>;date:string;lang:Lang}) {
  const record=months?.find(row=>row.month===date.slice(0,7));
  const days=record?.days.filter(row=>row.date===date)??[];
  const weekend=[0,6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
  return <p className="holiday-context"><strong>{date} · {days.length?days.map(row=>row.name).join(' · '):weekend?t('주말','Weekend','周末','週末'):t('평일','Weekday','工作日','平日')}</strong>
    <small>{record?`${t('한국천문연구원 공휴일 자료','KASI public-holiday data','韩国天文研究院节假日数据','韓国天文研究院の祝日データ')} · ${record.retrievedAt.slice(0,10)}`:t('공휴일 자료 연결 대기 · 임시·대체공휴일 여부는 아직 확인되지 않았습니다.','Holiday data pending · temporary and substitute holidays are not verified.','节假日数据连接中，临时及补休日尚未核实。','祝日データ接続待ち・臨時休日や振替休日は未確認です。')}</small>
    {!record&&<a href={`/${lang}/more#collection-status`}>{t('자료 연결 상태·수집 일정 보기','Collection status and schedule','查看连接状态与收集计划','接続状況・収集予定を見る')}</a>}
  </p>;
}
