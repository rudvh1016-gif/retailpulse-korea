'use client';
import type { Lang } from './retailpulse-data';
import type { SeoulContext } from '../lib/seoul-context';
import {CommercialComposition} from './commercial-composition';
import { kstDay } from '../lib/demand-presentation';
import { AIR_GRADE_TEXT, readAirGrade } from '../lib/weather-guide';
import { describeObservationAge, explainObservationVsForecast } from '../lib/observation-freshness';
import { WeatherScene } from './weather-scene';
import type { WeatherMetricKind } from './weather-metric-scene';

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
export function SeoulContextCard({context,lang,nowIso,showWeather=true}:{context?:SeoulContext & {retrievedAt?:string}|null;lang:Lang;nowIso?:string;showWeather?:boolean}) {
  if(!context) return null;
  const weather=context.weather;
  return <div className="operational-context">
    <CommercialComposition context={context} lang={lang}/>
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
    {weather&&showWeather&&<SeoulObservationScene context={context} lang={lang} nowIso={nowIso}/>}
  </div>;
}

/** Original Seoul measurements and freshness wording, shared by the combined panel. */
export function SeoulObservationScene({context,lang,nowIso,metricScenes=false}:{context?:SeoulContext & {retrievedAt?:string}|null;lang:Lang;nowIso?:string;metricScenes?:boolean}) {
  const weather=context?.weather;
  if(!weather||!context) return null;
  const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
      const age=describeObservationAge(weather.observedAt,nowIso??context.retrievedAt??'',lang);
      const stamp=age.isNow?t('지금','Now','当前','現在'):age.clock?`${age.clock} ${t('관측','observed','观测','観測')}`:t('관측','Observed','观测','観測');
      const gap=explainObservationVsForecast(age,lang);
      const entries: {kind:WeatherMetricKind;value:string}[] = [];
      if(weather.temperature!==null) entries.push({kind:'temperature',value:`${stamp} ${weather.temperature}°C`});
      if(weather.humidity!==null) entries.push({kind:'humidity',value:`${t('습도','Humidity','湿度','湿度')} ${weather.humidity}%`});
      if(weather.wind!==null) entries.push({kind:'wind',value:`${t('바람','Wind','风','風')} ${weather.wind}m/s`});
      if(weather.pm10!==null) entries.push({kind:'air',value:`${t('미세먼지','PM10','可吸入颗粒物 PM10','PM10')}${weather.pm10Grade?` ${airGradeWord(weather.pm10Grade,lang)}`:''} ${weather.pm10}μg/m³`});
      if(weather.pm25!==null) entries.push({kind:'air',value:`${t('초미세먼지','PM2.5','细颗粒物 PM2.5','PM2.5')}${weather.pm25Grade?` ${airGradeWord(weather.pm25Grade,lang)}`:''} ${weather.pm25}μg/m³`});
      return <div className="context-environment"><WeatherScene lang={lang} forecast={null} source="" metricScenes={metricScenes} observation={{
        facts:entries.map(entry=>entry.value),kinds:entries.map(entry=>entry.kind), observedAt: weather.observedAt, explanation: gap,
        title: metricScenes?(age.isNow?t('현재 관측','Current observation','当前观测','現在の観測'):t('최근 관측','Latest observation','最近观测','直近の観測')):t('주변 환경 관측','Local environment observation','当前周边环境','現在の周辺環境'),
        source: t('서울시 실시간 도시데이터 · 관측','Seoul real-time city data · observed','首尔市实时城市数据 · 观测','ソウル市リアルタイム都市データ · 観測'),
      }}/></div>;
}
export function HolidayContext({months,date,lang}:{months?:Array<{month:string;days:Array<{date:string;name:string}>;retrievedAt:string}>;date:string;lang:Lang}) {
  const record=months?.find(row=>row.month===date.slice(0,7));
  const days=record?.days.filter(row=>row.date===date)??[];
  const weekend=[0,6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
  return <p className="holiday-context"><strong>{date} · {days.length?days.map(row=>row.name).join(' · '):weekend?t('주말','Weekend','周末','週末'):t('평일','Weekday','工作日','平日')}</strong>
    <small>{record?`${t('한국천문연구원 공휴일 자료','KASI public-holiday data','韩国天文研究院节假日数据','韓国天文研究院の祝日データ')} · ${kstDay(record.retrievedAt)} KST`:t('공휴일 자료 연결 대기 · 임시·대체공휴일 여부는 아직 확인되지 않았습니다.','Holiday data pending · temporary and substitute holidays are not verified.','节假日数据连接中，临时及补休日尚未核实。','祝日データ接続待ち・臨時休日や振替休日は未確認です。')}</small>
    {!record&&<a href={`/${lang}/more#collection-status`}>{t('자료 연결 상태·수집 일정 보기','Collection status and schedule','查看连接状态与收集计划','接続状況・収集予定を見る')}</a>}
  </p>;
}
