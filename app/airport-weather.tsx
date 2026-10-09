'use client';
import {useEffect,useRef,useState} from 'react';
import type { Lang } from './retailpulse-data';
import type {AirportMetarSnapshot} from '../lib/airport-metar-store';
// Styles are supplied by the existing global CSS, so Node renderers can import this component.
const styles={"body":"airport-weather-body","basis":"airport-weather-basis","metrics":"airport-weather-metrics","details":"airport-weather-details"};

const copy={
 ko:{ground:'인천공항 지상 관측 · RKSI',loading:'관측 자료 확인 중',stale:'오래된 관측',wind:'지상풍',temperature:'기온',observed:'관측 시각',retrieved:'조회 시각',details:'상세 정보',direction:'방향',dewpoint:'이슬점',visibility:'시정',source:'공식 출처',scope:'지상 관측이며 항공편의 안전을 판단하는 자료가 아닙니다.'},
 en:{ground:'Incheon Airport ground observation · RKSI',loading:'Checking stored observations',stale:'Older observation',wind:'Surface wind',temperature:'Temperature',observed:'Observed',retrieved:'Retrieved',details:'Details',direction:'Direction',dewpoint:'Dewpoint',visibility:'Visibility',source:'Official source',scope:'Ground observations do not establish route turbulence or flight safety.'},
 zh:{ground:'仁川机场地面观测 · RKSI',loading:'正在查看已保存观测',stale:'较早观测',wind:'地面风速',temperature:'气温',observed:'观测时间',retrieved:'获取时间',details:'详情',direction:'风向',dewpoint:'露点',visibility:'能见度',source:'官方来源',scope:'地面观测不能判断航路颠簸或飞行安全。'},
 ja:{ground:'仁川空港の地上観測 · RKSI',loading:'保存された観測を確認中',stale:'過去の観測',wind:'地上風速',temperature:'気温',observed:'観測時刻',retrieved:'取得時刻',details:'詳細',direction:'風向',dewpoint:'露点',visibility:'視程',source:'公式情報',scope:'地上観測から航路の乱気流や飛行の安全性は判断できません。'},
};
const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
function clock(value:string|null,lang:Lang){return value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))+' KST':'—';}
/** Existing placement below current halls. Browser reads stored data only. */
export function AirportWeather({ lang }: { lang: Lang }) {
  const [snapshot,setSnapshot]=useState<AirportMetarSnapshot|null>(null);
  const [loading,setLoading]=useState(true),[now,setNow]=useState(0);
  const receipt=useRef<{at:number;monotonic:number}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    const timeout=setTimeout(()=>controller.abort(),8000);
    fetch('/api/airport/weather',{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('READ_FAILED');const body=await response.json();
      if(body.mode!=='airport-metar'||body.station!=='RKSI'||body.sourceId!=='KMA_RKSI_METAR'||!Number.isFinite(Date.parse(body.generatedAt)))throw Error('UNVERIFIED_RESPONSE');
      const sourceUrl=new URL(body.sourceUrl);
      if(sourceUrl.protocol!=='https:'||sourceUrl.username||sourceUrl.password)throw Error('UNVERIFIED_SOURCE');
      const observation=body.observation;
      const units:Record<string,string[]>={airTemperature:['Cel'],dewpointTemperature:['Cel'],qnh:['hPa'],meanWindDirection:['deg'],meanWindSpeed:['[kn_i]','m/s'],windGustSpeed:['[kn_i]','m/s'],prevailingVisibility:['m']};
      if(observation!=null&&(observation.station!=='RKSI'||observation.measurementScope!=='GROUND_OBSERVATION'
        ||typeof observation.observedAt!=='string'||!Number.isFinite(Date.parse(observation.observedAt))
        ||!observation.measurements||typeof observation.measurements!=='object'
        ||Object.entries(observation.measurements).some(([field,reading])=>{
          const value=reading as {value?:unknown;unit?:unknown};return !value||typeof value.value!=='number'||!Number.isFinite(value.value)||!units[field]?.includes(String(value.unit));
        })))throw Error('UNVERIFIED_OBSERVATION');
      if(active){receipt.current={at:Date.parse(body.generatedAt),monotonic:performance.now()};setSnapshot(body);setNow(receipt.current.at);}
    }).catch(()=>{if(active)setSnapshot(null);}).finally(()=>{clearTimeout(timeout);if(active)setLoading(false);});
    const tick=setInterval(()=>{if(document.visibilityState==='visible'&&receipt.current)setNow(receipt.current.at+performance.now()-receipt.current.monotonic);},60000);
    return()=>{active=false;controller.abort();clearTimeout(timeout);clearInterval(tick);};
  },[]);
  useEffect(()=>{
    const observedAt=snapshot?.observation?.observedAt;if(!observedAt)return;
    const received=receipt.current;if(!received)return;
    const remaining=Date.parse(observedAt)+90*60000-received.at-(performance.now()-received.monotonic);
    const expiry=setTimeout(()=>setNow(received.at+performance.now()-received.monotonic),Math.max(0,remaining)+1);
    return()=>clearTimeout(expiry);
  },[snapshot]);
  const t=copy[lang],observation=snapshot?.observation;
  const current=snapshot?.status==='CURRENT'&&observation&&now<Date.parse(observation.observedAt)+90*60000;
  const state=loading?'LOADING':observation?current?'CURRENT':'STALE':'UNAVAILABLE';
  const number=(value:number|undefined)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString(locales[lang],{maximumFractionDigits:3}):'—';
  const wind=observation?.measurements.meanWindSpeed,temp=observation?.measurements.airTemperature;
  const title = { ko: '공항 날씨', en: 'Airport weather', zh: '机场天气', ja: '空港の天気' }[lang];
  const unavailable = {
    ko: '현재 인천공항 관측 날씨를 확인할 수 없습니다.',
    en: 'Current observed weather at Incheon Airport is unavailable.',
    zh: '目前无法确认仁川机场的实测天气。',
    ja: '現在の仁川空港の観測天気を確認できません。',
  }[lang];
  return <section className="airport-detail-section airport-weather" aria-labelledby="airport-weather-title" data-testid="airport-weather" data-state={state}>
    <div className="airport-detail-head"><h3 id="airport-weather-title">{title}</h3></div>
    <div className={styles.body} aria-live="polite">
    {!observation?<p className="airport-empty-line" role="status">{loading?t.loading:unavailable}</p>:<>
      <p className={styles.basis}>{t.ground}{!current?` · ${t.stale}`:''}</p>
      <dl className={styles.metrics}><div><dt>{t.wind}</dt><dd>{number(wind?.value)}{wind&&<small> {wind.unit==='[kn_i]'?'kt':wind.unit}</small>}</dd></div><div><dt>{t.temperature}</dt><dd>{number(temp?.value)}{temp&&<small> °C</small>}</dd></div></dl>
      <p className={styles.basis}>{t.observed} · <time dateTime={observation.observedAt}>{clock(observation.observedAt,lang)}</time></p>
      <p className={styles.basis}>{t.retrieved} · <time dateTime={snapshot!.retrievedAt??undefined}>{clock(snapshot!.retrievedAt,lang)}</time></p>
      <details className={styles.details}><summary>{t.details}</summary>
        <dl className={styles.metrics}>
          <div><dt>{t.direction}</dt><dd>{number(observation.measurements.meanWindDirection?.value)}{observation.measurements.meanWindDirection&&'°'}</dd></div>
          <div><dt>{t.dewpoint}</dt><dd>{number(observation.measurements.dewpointTemperature?.value)}{observation.measurements.dewpointTemperature&&' °C'}</dd></div>
          <div><dt>QNH</dt><dd>{number(observation.measurements.qnh?.value)}{observation.measurements.qnh&&' hPa'}</dd></div>
          <div><dt>{t.visibility}</dt><dd>{observation.measurements.prevailingVisibility?.qualifier==='ABOVE'?'>':observation.measurements.prevailingVisibility?.qualifier==='BELOW'?'<':''}{number(observation.measurements.prevailingVisibility?.value)}{observation.measurements.prevailingVisibility&&' m'}</dd></div>
        </dl><p className={styles.basis}>kt = knots · {t.scope}</p>
        <a href={snapshot!.sourceUrl} target="_blank" rel="noopener noreferrer">{t.source} · METAR</a>
      </details>
    </>}
    </div>
  </section>;
}
