'use client';
import { useState } from 'react';
import type { Lang } from './retailpulse-data';
import type { SeoulContext } from '../lib/seoul-context';
import { commercialActivityContext } from '../lib/commercial-context';
import { AIR_GRADE_TEXT, readAirGrade } from '../lib/weather-guide';
import { describeObservationAge, explainObservationVsForecast } from '../lib/observation-freshness';

/** Seoul's own grade word, localized. An unrecognised label is shown as published. */
function airGradeWord(publishedGrade: string, lang: Lang): string {
  const grade = readAirGrade(publishedGrade);
  return grade ? AIR_GRADE_TEXT[grade][lang] : publishedGrade;
}
export const contextText=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
/**
 * `nowIso` is the moment the surrounding summary was generated, not
 * `Date.now()`: this card renders on the server too, and a clock read during
 * render would disagree between the server pass and hydration.
 */
export function SeoulContextCard({context,lang,nowIso}:{context?:SeoulContext & {retrievedAt?:string}|null;lang:Lang;nowIso?:string}) {
  const [expanded,setExpanded]=useState(false);
  if(!context) return null;
  const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
  const weather=context.weather;
  const total=context.categories.length;
  const categories=expanded?context.categories:context.categories.slice(0,3);
  const shown=categories.length;
  const number=(value:number)=>value.toLocaleString(lang==='ko'?'ko-KR':lang==='ja'?'ja-JP':lang==='zh'?'zh-CN':'en-US');
  return <div className="operational-context">
    {!!context.categories.length && <div>
      <h3>{t('어떤 업종에서 소비하나요?','Activity by business category','哪些行业消费活跃？','どの業種で消費されていますか？')}</h3>
      <small>{t('서울시·신한카드 내국인 소비 · 관측 시각 기준 10분','Seoul/Shinhan domestic-card activity · 10-minute observation window','首尔市·新韩卡韩国居民消费 · 最近10分钟','ソウル市・新韓カード国内消費 · 直近10分')} · {context.commercialAt?`${context.commercialAt.slice(5,16).replace('T',' ')} KST`:t('관측 시각 미제공','Observation time not supplied','未提供观测时间','観測時刻の提供なし')}</small>
      <ul className="context-category-list">{categories.map((row,i)=><li key={`${row.group}:${row.category}:${i}`}>
        <strong>{row.category}</strong><span>{commercialActivityContext(row.level??"",lang)??row.level??'—'}</span>
        <small>{row.amountMin!==null&&row.amountMax!==null?`₩${number(row.amountMin)} ~ ₩${number(row.amountMax)}`:'—'}{row.payments!==null?` · ${number(row.payments)}${t('건',' payments','笔','件')}`:''}</small>
      </li>)}</ul>
      {/*
        * The count is stated unconditionally, and that is the point.
        *
        * The toggle only has work to do above three categories, so on a night
        * when Seoul published a single one it was correct for the button to be
        * absent — and it read to the owner as a feature someone had deleted.
        * A count that is always on screen turns that into what it is: the
        * provider published one category, and one category is being shown.
        *
        * The hint sits inside the button, so tapping the small print works
        * too. Without it the owner found the control read as a heading for
        * the block underneath rather than as something to press.
        */}
      <div className="context-more">
        <p className="context-category-count">{shown>=total
          ?t(`서울시가 지금 공개한 업종 ${total}개를 모두 표시했습니다`,`Showing all ${total} categor${total===1?'y':'ies'} Seoul is publishing right now`,`已显示首尔市当前公布的全部${total}个行业`,`ソウル市が現在公開している${total}業種をすべて表示しています`)
          :t(`서울시가 지금 공개한 업종 ${total}개 중 ${shown}개를 표시했습니다`,`Showing ${shown} of the ${total} categories Seoul is publishing right now`,`已显示首尔市当前公布的${total}个行业中的${shown}个`,`ソウル市が現在公開している${total}業種のうち${shown}件を表示しています`)}</p>
        {total>3&&<button type="button" className="event-list-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>
          <span>{expanded?t('접기','Show less','收起','閉じる'):t(`업종 ${total}개 전체 보기`,`All ${total} categories`,`查看全部${total}个行业`,`${total}業種をすべて見る`)}</span>
          <small className="toggle-hint">{expanded?t('눌러서 접기','Tap to close','点击收起','タップで閉じる'):t('눌러서 펼치기','Tap to open','点击展开','タップで開く')}</small>
        </button>}
      </div>
    </div>}
    {/*
      * Reads as an OBSERVATION, next to a KMA FORECAST that lists the same
      * three metrics with different numbers. The owner saw 29.4°C here and
      * 21°C below and read the pair as one broken weather block.
      *
      * They are not the same measurement and they are not meant to match:
      * this is what a Seoul street sensor actually recorded, and the row
      * below is what the KMA expects for the current hour. Both are kept
      * because both are true and neither answers the other's question.
      *
      * What was wrong was the word "지금". It was printed unconditionally,
      * so a reading Seoul had published the previous afternoon — its
      * collector had stopped succeeding — still claimed to be current, and a
      * nine-hour-old number sitting next to a live forecast is the one thing
      * that makes two honest sources look like one broken screen. "지금" is
      * now earned; past the freshness window the reading is stamped with the
      * moment it was taken and the card says, in one line, why the forecast
      * underneath disagrees.
      */}
    {weather&&(()=>{
      const age=describeObservationAge(weather.observedAt,nowIso??context.retrievedAt??'',lang);
      const stamp=age.isNow?t('지금','Now','当前','現在'):age.clock?`${age.clock} ${t('관측','observed','观测','観測')}`:t('관측','Observed','观测','観測');
      const gap=explainObservationVsForecast(age,lang);
      return <p className="context-environment"><strong>{t('주변 환경 관측','Local environment observation','当前周边环境','現在の周辺環境')}</strong><br/>
        {[weather.temperature!==null?`${stamp} ${weather.temperature}°C`:null,
          weather.humidity!==null?`${t('습도','Humidity','湿度','湿度')} ${weather.humidity}%`:null,
          weather.wind!==null?`${t('바람','Wind','风','風')} ${weather.wind}m/s`:null,
          weather.pm10!==null?`${t('미세먼지','PM10','可吸入颗粒物 PM10','PM10')}${weather.pm10Grade?` ${airGradeWord(weather.pm10Grade,lang)}`:''} ${weather.pm10}μg/m³`:null,
          weather.pm25!==null?`${t('초미세먼지','PM2.5','细颗粒物 PM2.5','PM2.5')}${weather.pm25Grade?` ${airGradeWord(weather.pm25Grade,lang)}`:''} ${weather.pm25}μg/m³`:null].filter(Boolean).join(' · ')}
        {gap&&<small className="context-observation-gap">{gap}</small>}
        <small>{t('서울시 실시간 도시데이터 · 관측','Seoul real-time city data · observed','首尔市实时城市数据 · 观测','ソウル市リアルタイム都市データ · 観測')} {weather.observedAt.slice(5,16).replace('T',' ')} KST</small>
      </p>;
    })()}
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
