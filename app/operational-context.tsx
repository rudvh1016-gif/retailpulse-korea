'use client';
import { useId,useState } from 'react';
import type { Lang } from './retailpulse-data';
import type { SeoulContext } from '../lib/seoul-context';
import {commercialChartAxes,type CommercialChartMetric} from '../lib/commercial-category-chart';
import {CommercialCategoryRow,commercialLocales} from './commercial-category-row';
import { kstDay } from '../lib/demand-presentation';
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
  const [metric,setMetric]=useState<CommercialChartMetric>('payments');
  const listId=useId();
  if(!context) return null;
  const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
  const weather=context.weather;
  const total=context.categories.length;
  const categories=expanded?context.categories:context.categories.slice(0,3);
  const shown=categories.length;
  const axes=commercialChartAxes(context.categories);
  const hasChartData=metric==='payments'?axes.hasPayments:axes.hasAmounts;
  const maximum=metric==='payments'?new Intl.NumberFormat(commercialLocales[lang]).format(axes.payments):new Intl.NumberFormat(commercialLocales[lang],{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(axes.amount);
  return <div className="operational-context">
    <div className="consumption-categories">
      <h3>{t('어떤 업종에서 소비하나요?','Activity by business category','哪些行业消费活跃？','どの業種で消費されていますか？')}</h3>
      <small>{t('서울시·신한카드 내국인 소비 · 관측 시각 기준 10분','Seoul/Shinhan domestic-card activity · 10-minute observation window','首尔市·新韩卡韩国居民消费 · 最近10分钟','ソウル市・新韓カード国内消費 · 直近10分')} · {context.commercialAt?`${context.commercialAt.slice(5,16).replace('T',' ')} KST`:t('관측 시각 미제공','Observation time not supplied','未提供观测时间','観測時刻の提供なし')}</small>
      {total>0?<>
       <div className="commercial-chart-controls" role="group" aria-label={t('업종 차트 기준','Category chart metric','行业图表指标','業種グラフの指標')}>
        <button type="button" aria-pressed={metric==='payments'} onClick={()=>setMetric('payments')}>{t('결제 건수','Payment count','支付笔数','決済件数')}</button>
        <button type="button" aria-pressed={metric==='amount'} onClick={()=>setMetric('amount')}>{t('금액 범위','Amount range','金额范围','金額範囲')}</button>
       </div>
       <small className="commercial-chart-scale"><span>{hasChartData?'0':t('수치 미제공','Values not supplied','未提供数值','数値未提供')}</span><span>{hasChartData?`${metric==='payments'?t('공개 결제 건수 최대값','Largest published payment count','已公布支付笔数的最大值','公開決済件数の最大値'):t('공개 금액 상한 최대값','Largest published amount upper bound','已公布金额上限的最大值','公開金額上限の最大値')} ${maximum}${metric==='payments'?t('건',' payments','笔','件'):''}`:''}</span></small>
       <ul className="context-category-list" id={listId}>{categories.map((row,i)=><CommercialCategoryRow key={`${row.group}:${row.category}:${i}`} row={row} lang={lang} metric={metric} axes={axes}/>)}</ul>
      </>:<p className="commercial-category-empty">{t('이 관측 시각의 업종 자료 미제공 · 결제 0건을 뜻하지 않습니다.','Category data not supplied for this observation; this does not mean zero payments.','此观测时段未提供行业数据，不代表零笔支付。','この観測時刻の業種データは未提供です。決済0件という意味ではありません。')}</p>}
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
        {total>3&&<button type="button" className="event-list-toggle" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(!expanded)}>
          <span>{expanded?t('접기','Show less','收起','閉じる'):t(`업종 ${total}개 전체 보기`,`All ${total} categories`,`查看全部${total}个行业`,`${total}業種をすべて見る`)}</span>
          <small className="toggle-hint">{expanded?t('눌러서 접기','Tap to close','点击收起','タップで閉じる'):t('눌러서 펼치기','Tap to open','点击展开','タップで開く')}</small>
        </button>}
      </div>
      {total>0&&<details className="commercial-method"><summary>{t('막대·범위·활동 등급 읽기','Read the bars, ranges and activity levels','图表、范围与活跃度说明','棒・範囲・活動指標の見方')}</summary>
       <p>{t('막대의 정면 길이는 선택한 수치를 나타내며, 접기 상태의 목록에서도 전체 공개 업종에 같은 축을 씁니다. 금액의 사선은 공개된 최소~최대 범위입니다. 활동 등급은 금액·증감률이 아니며, 결제 건수는 사람 수나 구매 상품 수가 아닙니다.','Front-face length uses the selected value and one axis for all published categories, including hidden rows. Hatching preserves the published minimum–maximum amount range. Activity levels are not amounts or growth rates; payment counts are not people or product quantities.','正面长度按所选数值绘制，折叠列表也使用全部已公布行业的同一坐标轴。斜线表示公布的金额最小值至最大值。活跃度不代表金额或增减率，支付笔数不代表人数或商品数量。','正面の長さは選んだ数値を表し、折りたたみ中も全公開業種で同じ軸を使います。斜線は公開された金額の最小～最大範囲です。活動指標は金額や増減率ではなく、決済件数は人数や購入商品数ではありません。')}</p>
      </details>}
    </div>
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
    <small>{record?`${t('한국천문연구원 공휴일 자료','KASI public-holiday data','韩国天文研究院节假日数据','韓国天文研究院の祝日データ')} · ${kstDay(record.retrievedAt)} KST`:t('공휴일 자료 연결 대기 · 임시·대체공휴일 여부는 아직 확인되지 않았습니다.','Holiday data pending · temporary and substitute holidays are not verified.','节假日数据连接中，临时及补休日尚未核实。','祝日データ接続待ち・臨時休日や振替休日は未確認です。')}</small>
    {!record&&<a href={`/${lang}/more#collection-status`}>{t('자료 연결 상태·수집 일정 보기','Collection status and schedule','查看连接状态与收集计划','接続状況・収集予定を見る')}</a>}
  </p>;
}
