'use client';
/* eslint-disable @next/next/no-img-element -- Precomputed responsive WebPs; no on-demand image transforms. */
import {useEffect,useState} from 'react';
import type {Lang} from './retailpulse-data';
import {useLiveSummary} from './live-signals';
import type {AreaId} from '../lib/areas';
import type {publicCommercialMonth} from '../lib/commercial-monthly';
import {commercialCategoryIcons,commercialCategoryFallback,commercialIconSrcSet} from './commercial-category-icons';
import './seoul-comparison.css';
import {ChangeRate} from './change-rate';
import {SEOUL_REALTIME_STALE_MINUTES} from '../lib/seoul-freshness';
import {rankPublishedMetric} from '../lib/commercial-ranking';
import {validGlanceForecasts,freshGlanceObservation,sameGlanceClocks,eventsOnGlanceDay,glancePaymentShares} from '../lib/seoul-glance';
const names={myeongdong:{ko:'명동',en:'Myeongdong',zh:'明洞',ja:'明洞'},seongsu:{ko:'성수',en:'Seongsu',zh:'圣水',ja:'聖水'},hongdae:{ko:'홍대',en:'Hongdae',zh:'弘大',ja:'弘大'},itaewon:{ko:'이태원',en:'Itaewon',zh:'梨泰院',ja:'梨泰院'}};
const areas=['myeongdong','seongsu','hongdae','itaewon'] as const;
const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
const stamp=(at:string|null|undefined,lang:Lang)=>at&&Number.isFinite(Date.parse(at))?new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at))+' KST':'—';
const levels=[null,{ko:'여유',en:'Calm',zh:'宽松',ja:'余裕'},{ko:'보통',en:'Normal',zh:'一般',ja:'普通'},{ko:'약간 붐빔',en:'Somewhat busy',zh:'略拥挤',ja:'やや混雑'},{ko:'붐빔',en:'Crowded',zh:'拥挤',ja:'混雑'}];

export function WhereToView({lang}:{lang:Lang}){
 const summary=useLiveSummary(),[pace,setPace]=useState<'all'|'quiet'|'busy'>('all'),[visit,setVisit]=useState('now');
 const now=summary?.generatedAt??'',refreshing=!!summary?.clientRefresh;
 const forecasts=areas.map(area=>validGlanceForecasts(summary?.areas[area]?.realtimeForecast??[],now,refreshing));
 const choices=[...new Set(forecasts.flatMap(rows=>rows.map(row=>row.targetAt)))].sort((a,b)=>Date.parse(a)-Date.parse(b));
 const rows=areas.map((area,index)=>visit==='now'?summary?.areas[area]?.realtime:forecasts[index].find(row=>row.targetAt===visit));
 const fresh=areas.map((area,index)=>visit==='now'?freshGlanceObservation(summary?.areas[area]?.realtime,now,refreshing):!!rows[index]);
 const comparable=sameGlanceClocks(rows.map((row,index)=>({clock:visit==='now'?summary?.areas[areas[index]]?.realtime?.observedAt:forecasts[index].find(value=>value.targetAt===visit)?.issuedAt,valid:fresh[index]})));
 const selectedDay=visit==='now'?summary?.todayKst??'':visit.slice(0,10);
 const number=new Intl.NumberFormat(locales[lang],{maximumFractionDigits:1});
 return <section className="seoul-comparison" aria-labelledby="where-to-title">
  <header className="comparison-heading"><h1 id="where-to-title">{t(lang,'서울 한눈에','Seoul at a glance','首尔一览','ソウルひと目で')}</h1><p>{t(lang,'방문할 시간의 혼잡·행사·소비 흐름을 네 지역에서 비교하세요.','Compare crowds, events and card activity in four districts at your visit time.','对比四个地区在到访时段的拥挤、活动和消费。','訪問時刻の混雑・イベント・消費を4エリアで比べましょう。')}</p></header>
  <div className="comparison-date"><label>{t(lang,'방문 시간','Visit time','到访时间','訪問時刻')}<select value={visit} onChange={event=>setVisit(event.target.value)} data-testid="seoul-visit-time"><option value="now">{t(lang,'지금 · 관측','Now · observed','现在 · 观测','今・観測')}</option>{visit!=='now'&&!choices.includes(visit)&&<option value={visit} disabled>{stamp(visit,lang)} · {t(lang,'예보 없음','Unavailable','暂无预报','予報なし')}</option>}{choices.map(at=><option key={at} value={at}>{stamp(at,lang)} · {t(lang,'공식 예상','Official forecast','官方预计','公式予想')}</option>)}</select></label></div>
  <div className="area-tabs comparison-pace" role="group" aria-label={t(lang,'원하는 분위기','Preferred pace','偏好氛围','希望する雰囲気')}>
   {(['all','quiet','busy'] as const).map(value=><button key={value} type="button" className={pace===value?'active':''} aria-pressed={pace===value} onClick={()=>setPace(value)}>{value==='all'?t(lang,'모두 비교','Compare all','全部比较','すべて比較'):value==='quiet'?t(lang,'한산한 곳','Calmer places','安静一些','空いている場所'):t(lang,'붐비는 곳','Busier places','热闹一些','にぎやかな場所')}</button>)}
  </div>
  <p className="comparison-basis" role="status">{summary===undefined?t(lang,'공식 자료 불러오는 중…','Loading official data…','正在读取官方资料…','公式データを読み込み中…'):summary===null?t(lang,'자료를 불러오지 못했습니다. 지역 상세에서 연결 상태를 확인하세요.','Could not load data. Check the area details.','无法读取资料，请查看地区详情。','読み込めませんでした。エリア詳細をご確認ください。'):comparable?(visit==='now'?t(lang,'같은 관측시각의 공식 혼잡 단계로 비교합니다.','Official crowd grades at the same observation time.','相同观测时间的官方拥挤等级。','同じ観測時刻の公式混雑段階です。'):t(lang,'같은 발표시각·방문시간의 공식 예상입니다.','Official forecasts with matching issue and visit times.','发布时间与到访时间相同的官方预计。','同じ発表・訪問時刻の公式予想です。')):t(lang,'시각이 다르거나 자료가 부족해 순위를 매기지 않습니다.','Times differ or data is missing. No ranking is shown.','时间不同或资料不足，不进行排名。','時刻が異なるか資料不足のため順位は表示しません。')}</p>
  <div className="district-choice-grid">
   {areas.map((area,index)=>{const block=summary?.areas[area],row=rows[index],level=row?.congestionLevel??0;
    const match=comparable&&((pace==='quiet'&&level===1)||(pace==='busy'&&level>=3));
    const current=block?.realtime,lastKnown=!!current&&Number.isFinite(Date.parse(current.observedAt))&&Date.parse(current.observedAt)<=Date.parse(now)&&Number.isInteger(current.congestionLevel)&&current.congestionLevel>=1&&current.congestionLevel<=4,quieter=freshGlanceObservation(current,now,refreshing)?forecasts[index].filter(value=>value.congestionLevel<current!.congestionLevel).slice(0,2):[];
    const events=eventsOnGlanceDay(block?.events??[],selectedDay);
    const commercial=block?.commercial,context=block?.context;
    const commercialAge=Date.parse(now)-Date.parse(commercial?.observedAt??'');
    const shares=!refreshing&&commercial?.freshness==='LIVE'&&commercialAge>=0&&commercialAge<=SEOUL_REALTIME_STALE_MINUTES*60_000&&context?.commercialAt===commercial.observedAt?glancePaymentShares(context.categories):[];
    return <article className="district-choice" data-area={area} data-preference-match={match} key={area}>
     <img className="district-choice-model" src={`/visuals/seoul-comparison/${area}-320.webp`} srcSet={`/visuals/seoul-comparison/${area}-320.webp 320w, /visuals/seoul-comparison/${area}-640.webp 640w`} sizes="(max-width: 600px) 46vw, (max-width: 960px) 44vw, 22vw" width="640" height="514" alt="" decoding="async" loading={index<2?'eager':'lazy'}/>
     <div className="district-choice-name"><h2>{names[area][lang]}</h2><strong>{fresh[index]?levels[level]?.[lang]:t(lang,'확인 불가','Unavailable','无法确认','確認できません')}</strong></div>
     <small>{visit==='now'?t(lang,'혼잡 관측','Crowd observation','拥挤观测','混雑観測'):t(lang,'혼잡 예상','Crowd forecast','拥挤预计','混雑予想')} · {stamp(visit==='now'?current?.observedAt:forecasts[index].find(value=>value.targetAt===visit)?.targetAt,lang)}{row&&!fresh[index]?` · ${t(lang,'지연','Delayed','延迟','遅延')}`:''}</small>
     {visit==='now'&&!fresh[index]&&lastKnown&&<p className="district-last-known" data-testid="district-last-known">{t(lang,'마지막 확인','Last confirmed','上次确认','最終確認')} · <strong>{levels[current!.congestionLevel]?.[lang]}</strong> · {stamp(current!.observedAt,lang)}<small>{t(lang,'현재 혼잡으로 비교하지 않습니다.','Excluded from current crowd comparisons.','不用于当前拥挤程度比较。','現在の混雑比較には使用しません。')}</small></p>}
     {visit!=='now'&&<small>{t(lang,'예보 발표','Forecast issued','预报发布','予報発表')} · {stamp(forecasts[index].find(value=>value.targetAt===visit)?.issuedAt,lang)}</small>}
     <div className="district-glance-section"><h3>{t(lang,'지금보다 덜 붐빌 시간','Calmer than now','比现在更空的时段','今より空く時刻')}</h3><p>{quieter.length?quieter.map(value=>`${stamp(value.targetAt,lang)} · ${levels[value.congestionLevel]?.[lang]}`).join(' / '):visit==='now'&&!fresh[index]?t(lang,'최신 혼잡 관측이 없어 덜 붐빌 시간을 비교하지 않습니다.','A fresh crowd observation is needed to compare calmer times.','需要最新的拥挤观测才能比较较空闲时段。','空いている時間の比較には新しい混雑観測が必要です。'):forecasts[index].length?t(lang,'제공된 예상 중 지금보다 덜 붐빌 시간 없음','No calmer time in the published forecasts','已发布预测中没有更空闲时段','公表予測に現在より空いている時間なし'):t(lang,'최신 발표 시각의 예상 자료를 확인할 수 없습니다.','Freshly issued forecasts are unavailable.','无法确认最新发布的预测。','新しい発表時刻の予測を確認できません。')}</p></div>
     <div className="district-glance-section"><h3>{t(lang,'방문일 주변 행사','Events on your visit date','到访日周边活动','訪問日の周辺イベント')}</h3><p><strong>{events.length}</strong> {t(lang,'개 · 공식 등록','official listings','项 · 官方登记','件・公式登録')}</p>{events.length>0&&<ul>{events.slice(0,2).map((event,eventIndex)=><li key={event.contentId??eventIndex}>{event.title}</li>)}</ul>}</div>
     <div className="district-glance-section"><h3>{t(lang,'최근 10분 소비 구성','Recent 10-minute payment mix','最近10分钟支付构成','直近10分の決済構成')}</h3>{shares.length?<ul className="district-payment-shares">{shares.slice(0,3).map(value=>{const icon=commercialCategoryIcons[value.category]??commercialCategoryFallback;return <li key={value.category}><img src={icon.src} srcSet={commercialIconSrcSet(icon)} sizes="32px" width="32" height="32" alt="" loading="lazy" decoding="async"/><span>{glanceCategoryLabel(value.category,lang)} <strong>{number.format(value.share)}%</strong></span></li>;})}</ul>:<p>{t(lang,'비교 자료 부족','Insufficient data','比较资料不足','比較資料不足')}</p>}<small>{t(lang,'제공된 업종의 결제 건수 비중','Share of published industry payment counts','已公布行业的支付笔数占比','提供業種の決済件数比率')} · {stamp(context?.commercialAt,lang)}</small></div>
     <a href={`/${lang}/${area}`}>{t(lang,'지역 상세·전체 행사','Area details & all events','地区详情与全部活动','エリア詳細・全イベント')}</a>
    </article>;
   })}
  </div>
  <details className="comparison-details"><summary>{t(lang,'비교 기준과 자료의 한계','Comparison basis & limits','比较标准与资料限制','比較基準と資料の限界')}</summary><p>{t(lang,'혼잡은 서울시 공식 단계입니다. 예보가 발표된 범위 안에서만 시간을 고를 수 있습니다. 소비 구성은 지금 제공된 신한카드 내국인 결제 건수이며 방문 시간의 예측이 아닙니다. 비공개 업종은 제외되어 전체 소비 비중과 다를 수 있습니다. 행사명은 공식 등록 원문입니다.','Crowds use Seoul’s official grades within the published forecast horizon. Payment shares use currently published Shinhan domestic-card counts, not a forecast for your visit. Suppressed industries are excluded. Event names retain the official original.','拥挤使用首尔市官方等级，仅可选择已发布预报的时段。消费构成是当前公布的新韩卡韩国国内支付笔数，并非到访时预测。未公开行业除外。活动名称保留官方原文。','混雑はソウル市の公式段階で、発表された予報の時刻のみ選べます。決済構成は現在提供された新韓カード国内決済件数で、訪問時刻の予想ではありません。非公開業種は除外。イベント名は公式原文です。')}</p></details>
 </section>;
}

function glanceCategoryLabel(category:string,lang:Lang){
 const labels:Record<string,readonly [string,string,string]>={'한식':['Korean food','韩餐','韓国料理'],'일식/중식/양식':['World food','各国料理','各国料理'],'제과/커피/패스트푸드':['Cafés & bakeries','咖啡与烘焙','カフェ・ベーカリー'],'기타요식':['Other food','其他餐饮','その他の飲食'],'할인점/슈퍼마켓':['Groceries','超市','スーパー'],'편의점':['Convenience stores','便利店','コンビニ'],'의복/의류':['Clothing','服装','衣類'],'패션/잡화':['Accessories','服饰杂货','服飾雑貨'],'스포츠/문화/레저':['Leisure','文化休闲','レジャー'],'화장품':['Cosmetics','化妆品','化粧品'],'약국':['Pharmacies','药店','薬局'],'유흥':['Nightlife','夜生活','ナイトライフ'],'미용서비스':['Beauty','美容','美容'],'병원':['Clinics','医院','病院'],'여행':['Travel','旅行','旅行']};
 return lang==='ko'?category:labels[category]?.[({en:0,zh:1,ja:2})[lang]]??category;
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
   <div className="consumption-legend"><span><i className="previous"/>{data.previousMonth}</span><span><i className="current"/>{data.month}</span><span>{t(lang,'공통 축 · 이번 달 평균 결제건수 큰 순 · 미제공은 마지막','Shared scale · current mean payment count, descending; missing last','共同坐标 · 本月平均支付笔数降序 · 缺失在末尾','共通目盛り・今月平均決済件数の降順・欠損は最後')}</span></div>
   <ul className="consumption-category-list">{rankPublishedMetric(data.categories,row=>row.comparison.currentMean).map(row=>{const c=row.comparison,icon=commercialCategoryIcons[row.category]??commercialCategoryFallback;
    return <li key={row.category} className="consumption-category" data-category={row.category}>
     <img src={icon.src} srcSet={commercialIconSrcSet(icon)} sizes="64px" width={icon.width} height={icon.height} alt="" loading="lazy" decoding="async"/>
     <div className="consumption-category-content"><div className="consumption-category-title"><h2>{row.category==='여행'?t(lang,'여행 업종','Travel industry','旅行行业','旅行業種'):row.category}</h2><strong>{c.changePercent!==null?<ChangeRate value={c.changePercent} lang={lang}/>:t(lang,'변화 비교 불가','Change unavailable','无法比较变化','変化を比較できません')}</strong></div>
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
