'use client';
/* eslint-disable @next/next/no-img-element -- Precomputed responsive WebPs; no on-demand image transforms. */
import {useEffect,useState} from 'react';
import type {Lang} from './retailpulse-data';
import {useLiveSummary} from './live-signals';
import type {AreaId} from '../lib/areas';
import type {publicCommercialMonth} from '../lib/commercial-monthly';
import {commercialCategoryIcons,commercialCategoryFallback} from './commercial-category-icons';
import './seoul-comparison.css';
const names={myeongdong:{ko:'명동',en:'Myeongdong',zh:'明洞',ja:'明洞'},seongsu:{ko:'성수',en:'Seongsu',zh:'圣水',ja:'聖水'},hongdae:{ko:'홍대',en:'Hongdae',zh:'弘大',ja:'弘大'},itaewon:{ko:'이태원',en:'Itaewon',zh:'梨泰院',ja:'梨泰院'}};
const areas=['myeongdong','seongsu','hongdae','itaewon'] as const;
const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
const stamp=(at:string|null|undefined,lang:Lang)=>at&&Number.isFinite(Date.parse(at))?new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at))+' KST':'—';
const levels=[null,{ko:'여유',en:'Calm',zh:'宽松',ja:'余裕'},{ko:'보통',en:'Normal',zh:'一般',ja:'普通'},{ko:'약간 붐빔',en:'Somewhat busy',zh:'略拥挤',ja:'やや混雑'},{ko:'붐빔',en:'Crowded',zh:'拥挤',ja:'混雑'}];

export function WhereToView({lang}:{lang:Lang}){
 const summary=useLiveSummary(),[pace,setPace]=useState<'all'|'quiet'|'busy'>('all');
 const clocks=areas.map(area=>summary?.areas[area]?.realtime?.observedAt);
 const fresh=areas.map(area=>{const row=summary?.areas[area]?.realtime;const age=row&&summary?Date.parse(summary.generatedAt)-Date.parse(row.observedAt):Infinity;return !!row&&!summary?.clientRefresh&&row.freshness==='LIVE'&&age>=0&&age<=30*60_000;});
 const comparable=fresh.every(Boolean)&&new Set(clocks).size===1;
 return <section className="seoul-comparison" aria-labelledby="where-to-title">
  <header className="comparison-heading"><h1 id="where-to-title">{t(lang,'오늘 어디 갈까','Where to go today','今天去哪里','今日はどこへ')}</h1><p>{t(lang,'명동·성수·홍대·이태원의 혼잡과 날씨를 함께 보고 골라보세요.','Compare crowds and weather in four Seoul districts.','对比首尔四个地区的拥挤与天气。','ソウル4エリアの混雑と天気を比べて選びましょう。')}</p></header>
  <div className="area-tabs comparison-pace" role="group" aria-label={t(lang,'원하는 분위기','Preferred pace','偏好氛围','希望する雰囲気')}>
   {(['all','quiet','busy'] as const).map(value=><button key={value} type="button" className={pace===value?'active':''} aria-pressed={pace===value} onClick={()=>setPace(value)}>{value==='all'?t(lang,'모두 비교','Compare all','全部比较','すべて比較'):value==='quiet'?t(lang,'한산한 곳','Calmer places','安静一些','空いている場所'):t(lang,'붐비는 곳','Busier places','热闹一些','にぎやかな場所')}</button>)}
  </div>
  <p className="comparison-basis" role="status">{summary===undefined?t(lang,'공식 자료 불러오는 중…','Loading official data…','正在读取官方资料…','公式データを読み込み中…'):summary===null?t(lang,'자료를 불러오지 못했습니다. 지역 상세에서 연결 상태를 확인하세요.','Could not load data. Check connection status in the area details.','无法读取资料，请在地区详情查看连接状态。','読み込めませんでした。エリア詳細で接続状況を確認してください。'):comparable?t(lang,'같은 관측시각의 공식 혼잡 단계로 비교합니다.','Compared using official crowd grades at the same observation time.','按相同观测时间的官方拥挤等级对比。','同じ観測時刻の公式混雑段階を比較します。'):t(lang,'지역별 관측시각이 다르거나 지연된 자료가 있습니다. 순위를 매기지 않습니다.','Observation times differ or data is delayed. No ranking is shown.','观测时间不同或资料延迟，不进行排名。','観測時刻が異なるか遅延しています。順位は表示しません。')}</p>
  <div className="district-choice-grid">
   {areas.map((area,index)=>{const block=summary?.areas[area],row=block?.realtime,level=row?.congestionLevel??0,weather=block?.context?.weather;
    const weatherAge=weather&&summary?Date.parse(summary.generatedAt)-Date.parse(weather.observedAt):Infinity;
    const forecast=block?.weather.find(value=>Date.parse(value.targetAt)>=Date.parse(summary?.generatedAt??'')-3_600_000);
    const match=comparable&&((pace==='quiet'&&level===1)||(pace==='busy'&&level>=3));
    return <article className="district-choice" data-area={area} data-preference-match={match} key={area}>
     <img className="district-choice-model" src={`/visuals/seoul-comparison/${area}-320.webp`} srcSet={`/visuals/seoul-comparison/${area}-320.webp 320w, /visuals/seoul-comparison/${area}-640.webp 640w`} sizes="(max-width: 600px) 46vw, (max-width: 960px) 44vw, 22vw" width="640" height="514" alt="" decoding="async" loading={index<2?'eager':'lazy'}/>
     <div className="district-choice-name"><h2>{names[area][lang]}</h2><strong>{levels[level]?.[lang]??t(lang,'확인 불가','Unavailable','无法确认','確認できません')}</strong></div>
     <p className="district-choice-reason">{!fresh[index]?t(lang,'최신 혼잡 확인 후 선택하세요.','Check a fresh crowd reading before choosing.','请先确认最新拥挤情况。','最新の混雑を確認してから選んでください。'):level===1?t(lang,'한산한 분위기를 찾을 때 살펴보세요.','Consider it when you want a calmer atmosphere.','想找安静氛围时可以看看。','空いた雰囲気を探すときに。'):level>=3?t(lang,'붐비는 분위기를 찾을 때 살펴보세요.','Consider it when you want a busier atmosphere.','想找热闹氛围时可以看看。','にぎやかな雰囲気を探すときに。'):t(lang,'현재 공식 혼잡 단계는 보통입니다.','The official crowd grade is normal.','当前官方拥挤等级为一般。','現在の公式混雑段階は普通です。')}</p>
     <small>{t(lang,'서울시 혼잡 관측','Seoul crowd observation','首尔市拥挤观测','ソウル市混雑観測')} · {stamp(row?.observedAt,lang)}{row&&!fresh[index]?` · ${t(lang,'지연','Delayed','延迟','遅延')}`:''}</small>
     <dl className="district-choice-weather"><div><dt>{!summary?.clientRefresh&&weatherAge>=0&&weatherAge<=60*60_000?t(lang,'현재 날씨 관측','Current weather observation','当前天气观测','現在の天気観測'):t(lang,'최근 날씨 관측','Latest weather observation','最近天气观测','直近の天気観測')}</dt><dd>{weather?.temperature!=null?`${weather.temperature}°C`:t(lang,'자료 없음','No data','暂无资料','資料なし')}{weather?.humidity!=null?` · ${t(lang,'습도','Humidity','湿度','湿度')} ${weather.humidity}%`:''}</dd></div></dl>
     <small>{t(lang,'서울시','Seoul','首尔市','ソウル市')} · {stamp(weather?.observedAt,lang)}</small>
     {forecast&&<p className="district-choice-forecast">{t(lang,'기상청 예보','KMA forecast','气象厅预报','気象庁予報')} · {stamp(forecast.targetAt,lang)}<br/>{forecast.temperatureTenthC!==null?`${forecast.temperatureTenthC/10}°C · `:''}{forecast.precipitationProbability!==null?`${t(lang,'강수확률','Rain chance','降水概率','降水確率')} ${forecast.precipitationProbability}%`:t(lang,'강수확률 미제공','Rain chance unavailable','未提供降水概率','降水確率未提供')}</p>}
     <a href={`/${lang}/${area}`}>{t(lang,'지역 상세·앞으로의 시간대','Area details & upcoming hours','地区详情与后续时段','エリア詳細・今後の時間帯')}</a>
    </article>;
   })}
  </div>
  <details className="comparison-details"><summary>{t(lang,'비교 기준과 자료의 한계','Comparison basis & limits','比较标准与资料限制','比較基準と資料の限界')}</summary><p>{t(lang,'혼잡은 서울시 공식 단계이며 지역 크기와 인구를 점수로 바꾸지 않습니다. 날씨 관측과 예보는 서로 다른 시각·지점의 자료입니다. 모형은 지역을 구별하는 개념 그림이며 실제 지도·매출·추천 순위를 뜻하지 않습니다.','Crowds use Seoul’s official grades. Area size and population are not converted into scores. Observations and forecasts have distinct times and locations. Models identify districts conceptually; they do not encode maps, sales or recommendation rankings.','拥挤使用首尔市官方等级，地区面积与人口不会转换成评分。天气观测和预报的时间与地点各异。模型是地区概念图，不表示地图、销售额或推荐排名。','混雑はソウル市の公式段階です。面積や人口をスコアには変えません。天気の観測と予報は時刻・地点が異なります。模型は概念図で、地図・売上・おすすめ順位を示しません。')}</p></details>
 </section>;
}

type MonthData=ReturnType<typeof publicCommercialMonth>;
interface MonthResponse {status:string;area:string;month:string;months:string[];calculatedAt?:string;data:MonthData|null}
export function ConsumptionView({lang,area,onArea}:{lang:Lang;area:AreaId;onArea:(area:AreaId)=>void}){
 const summary=useLiveSummary(),[month,setMonth]=useState<string|null>(null),[retry,setRetry]=useState(0);
 const selectedMonth=month??summary?.todayKst.slice(0,7),key=area+'|'+selectedMonth;
 const [state,setState]=useState<{key:string;value:MonthResponse|null}|null>(null);
 const response=state?.key===key?state.value:undefined;
 useEffect(()=>{const query=new URLSearchParams(window.location.search).get('month');if(query&&/^\d{4}-(0[1-9]|1[0-2])$/.test(query)){const timer=setTimeout(()=>setMonth(query),0);return()=>clearTimeout(timer);}},[]);
 useEffect(()=>{if(!selectedMonth)return;let active=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15_000);
  void fetch(`/api/live/commercial-months?area=${area}&month=${selectedMonth}`,{signal:controller.signal}).then(async result=>result.ok?await result.json() as MonthResponse:null).catch(()=>null).then(value=>{if(active)setState({key,value:value&&value.data&&(value.area!==area||value.month!==selectedMonth||value.data.month!==selectedMonth)?null:value});});
  return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[area,selectedMonth,key,retry]);
 const data=response?.data,number=new Intl.NumberFormat(locales[lang],{maximumFractionDigits:1}),won=new Intl.NumberFormat(locales[lang],{style:'currency',currency:'KRW',maximumFractionDigits:0});
 const max=Math.max(1,...(data?.categories.flatMap(row=>[row.comparison.currentMean??0,row.comparison.previousMean??0])??[]));
 const changeMonth=(value:string)=>{setMonth(value);const url=new URL(window.location.href);url.searchParams.set('month',value);window.history.replaceState({},'',url.pathname+url.search);};
 return <section className="seoul-comparison consumption-comparison" aria-labelledby="consumption-title">
  <header className="comparison-heading"><h1 id="consumption-title">{t(lang,'요즘 뜨는 소비','Consumption changes','近期消费变化','最近の消費の変化')}</h1><p>{t(lang,'같은 날짜·시간에 관측된 업종별 카드 결제 흐름을 비교합니다.','Compare observed card activity by industry at matching days and hours.','对比相同日期与小时观测到的各行业银行卡支付趋势。','同じ日付・時間に観測した業種別カード決済の流れを比較します。')}</p></header>
  <div className="area-tabs" role="tablist" aria-label={t(lang,'지역 선택','Select district','选择地区','エリア選択')}>{areas.map(value=><button key={value} type="button" role="tab" className={area===value?'active':''} aria-selected={area===value} onClick={()=>onArea(value)}>{names[value][lang]}</button>)}</div>
  <div className="comparison-date"><label>{t(lang,'비교월','Month','比较月份','比較月')} <select name="commercialMonth" aria-label={t(lang,'비교월','Comparison month','比较月份','比較月')} value={selectedMonth??''} onChange={event=>changeMonth(event.target.value)}>{[...new Set([...(selectedMonth?[selectedMonth]:[]),...(response?.months??[])])].sort().reverse().map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
  <p className="comparison-basis">{t(lang,'서울시·신한카드 내국인 결제 추정 · 관측된 10분 창의 평균 · 전체 매출 아님','Seoul / Shinhan Card domestic-consumer estimates · means of observed 10-minute windows · not total sales','首尔市／新韩卡境内消费者支付推算 · 已观测10分钟窗口的平均值 · 非全量销售额','ソウル市・新韓カード国内消費者の推定 · 観測した10分窓の平均 · 売上全数ではありません')}</p>
  {!data?<p role="status" className="comparison-empty">{response===undefined?t(lang,'월별 자료 불러오는 중…','Loading monthly data…','正在读取月度资料…','月次資料を読み込み中…'):t(lang,'이 월의 요약 자료를 아직 확인할 수 없습니다. 다른 월을 선택하거나 다시 확인하세요.','This month’s summary is unavailable. Choose another month or retry.','暂无法确认本月汇总，请选择其他月份或重试。','この月の要約は未確認です。別の月を選ぶか再確認してください。')}<button type="button" onClick={()=>setRetry(value=>value+1)}>{t(lang,'다시 확인','Retry','重试','再確認')}</button></p>:<>
   <p>{data.month} · {data.throughDate??t(lang,'완료된 날짜 없음','No completed days','暂无已完成日期','完了日なし')} · {t(lang,'전월 같은 일자·시간과 비교','compared with matching days / hours in the previous month','与上月相同日期及小时比较','前月の同じ日付・時間と比較')}</p>
   <div className="consumption-legend"><span><i className="previous"/>{data.previousMonth}</span><span><i className="current"/>{data.month}</span><span>{t(lang,'공통 축 · 관측 결제건수 평균','Shared scale · mean observed payment count','共同坐标 · 观测支付笔数平均值','共通目盛り・観測決済件数の平均')}</span></div>
   <ul className="consumption-category-list">{data.categories.map(row=>{const c=row.comparison,icon=commercialCategoryIcons[row.category]??commercialCategoryFallback;
    return <li key={row.category} className="consumption-category" data-category={row.category}>
     <img src={icon.src} width={icon.width} height={icon.height} alt="" loading="lazy" decoding="async"/>
     <div className="consumption-category-content"><div className="consumption-category-title"><h2>{row.category}</h2><strong>{c.changePercent!==null?`${c.changePercent>0?'+':''}${number.format(c.changePercent)}%`:t(lang,'변화 비교 불가','Change unavailable','无法比较变化','変化を比較できません')}</strong></div>
      <p>{c.currentMean!==null&&c.previousMean!==null?`${number.format(c.previousMean)} → ${number.format(c.currentMean)} ${t(lang,'건 · 같은 시간대의 관측 평균','payments · matched-hour observation mean','笔 · 相同时段观测均值','件・同時間帯の観測平均')}`:t(lang,'전월 동기간에 함께 제공된 값이 없습니다.','No jointly published values for the matching previous-month period.','上月同期没有同时提供的数值。','前月同期間に共通して提供された値がありません。')}</p>
      <svg className="consumption-pair" viewBox="0 0 110 34" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path className="consumption-axis" d="M0 30H108"/>{([[c.previousMean,6,'previous'],[c.currentMean,20,'current']] as const).map(([value,y,kind])=>value!==null&&value>0?<g key={kind} data-value={value}><rect className={kind} x="0" y={y} width={value/max*100} height="8"/><path className={kind+' cap'} d={`M0 ${y}L3 ${y-3}H${value/max*100+3}L${value/max*100} ${y}Z`}/></g>:null)}</svg>
      {c.currentAmount&&<p className="consumption-amount">{t(lang,'관측 금액 범위 평균','Mean observed amount range','观测金额范围平均值','観測金額範囲の平均')} · {won.format(c.currentAmount[0])}–{won.format(c.currentAmount[1])}</p>}
      <small>{t(lang,'비교 가능','Matched','可比较','比較可能')} {number.format(c.matchedHours)} {t(lang,'시간','hours','小时','時間')} / {number.format(c.matchedDays)} {t(lang,'일','days','天','日')}</small>
      <details><summary>{t(lang,'관측 범위·결측 확인','Coverage & missing values','观测范围与缺失','観測範囲・欠損')}</summary><p>{stamp(row.firstAt,lang)}–{stamp(row.lastAt,lang)}</p><p>{t(lang,'제공된 업종 관측','Published category readings','已提供行业观测','提供された業種観測')} {number.format(row.readings)} · {t(lang,'중복 제외','Duplicates excluded','排除重复','重複除外')} {number.format(row.duplicates)} · {t(lang,'업종 미제공','Category absent','未提供行业','業種未提供')} {number.format(row.absentReadings)} · {t(lang,'값 미제공','Value unavailable','未提供数值','値未提供')} {number.format(row.unavailablePayments)}</p></details>
     </div>
    </li>;
   })}</ul>
   <small>{t(lang,'마지막 상권 기준시각','Latest commercial reference time','最新商圈基准时间','最新商圏基準時刻')} · {stamp(data.lastAt,lang)}<br/>{t(lang,'요약 계산','Summary calculated','汇总计算','要約計算')} · {stamp(response?.calculatedAt,lang)}</small>
  </>}
  <details className="comparison-details"><summary>{t(lang,'어떻게 비교하나요','How comparisons work','如何进行比较','比較方法')}</summary><p>{t(lang,'지역·상권시각·업종이 같은 중복을 제외합니다. 양쪽 월에 값이 있는 같은 일자·시간만 맞추고, 시간별 10분 관측값 평균을 같은 비중으로 비교합니다. 수집되지 않거나 비공개인 값은 0으로 채우지 않습니다. 이전 평균이 0이면 변화율을 계산하지 않습니다. 미완료 월은 끝난 날짜까지만 비교하며, 일부 관측 평균을 합쳐 월 매출 총액으로 보여주지 않습니다. 업종 목록은 실제 보유 자료에 따라 달라집니다.','Duplicates share the same district, source clock and industry. Only common calendar-day/hour bins with published values are matched; means of observed 10-minute windows receive equal hourly weight. Missing or unpublished values are not filled with zero. A zero previous mean has no percentage change. An incomplete month includes completed dates only. Partial averages are never summed into monthly total sales. Industry lists follow retained data.','按地区、商圈时间与行业去重。仅匹配两个月均提供数值的相同日期和小时，以每小时观测的10分钟均值进行等权比较。缺失或未公开值不填0，前值为0不计算变化率。未完成月份只比较已结束日期，不将部分均值相加为月销售总额。行业列表依据实际资料。','地域・商圏時刻・業種の重複を除外。両月に値がある同じ日付・時間のみを対応させ、10分観測値の時間別平均を等しい重みで比較します。未収集・非公開値を0にはせず、前月平均が0なら変化率は計算しません。未完了月は終了日まで。一部の平均を月間売上合計にはしません。業種は保有資料に応じて変わります。')}</p><a href={`/${lang}/more#collection-status`}>{t(lang,'출처와 연결 상태','Sources & collection status','来源与连接状态','出典・接続状況')}</a></details>
 </section>;
}
