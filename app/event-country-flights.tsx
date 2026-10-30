import type {Lang} from './retailpulse-data';
import {briefCountryName} from '../lib/brief-localization';
import {eventCountryFlights,type EventFlightContext} from '../lib/event-country-flights';
import {airportMonthPeriodLabel} from '../lib/airport-month-labels';
import {ChangeRate,CountChange} from './change-rate';
const copy={
 ko:{origin:'한국 출발지 일정 · 도착지 노선 비교 대상 아님',selected:'선택일',all:'공항 전체',concourse:'탑승동',main:'T1 본관',loading:'출발편 확인 중',baselineLoading:'일평균 비교자료 확인 중',missing:'출발편 자료 없음',partial:'출발편 일부 자료 · 합계 미표시',comparison:'일평균 비교자료 없음',held:'비교 보류',zero:'기준 0편 · 증감률 계산 불가',basis:'노선 국가 기준',scheduled:'출발 예정편',sample:'포함일',days:'일',full:'전체',notMonth:'월전체 평균 아님',association:'행사 일정과 항공편 비교는 별도 정보이며, 증감 원인이 확인된 것은 아닙니다.'},
 en:{origin:'Korea-origin event · not a destination-route comparison',selected:'Selected day',all:'All airport areas',concourse:'Concourse',main:'T1 main building',loading:'Checking departures',baselineLoading:'Checking daily-average comparison',missing:'Departure data unavailable',partial:'Partial departure data · total withheld',comparison:'Daily-average comparison unavailable',held:'Comparison withheld',zero:'Zero baseline · percentage undefined',basis:'Route-country basis',scheduled:'Scheduled departures',sample:'Included dates',days:' days',full:'all',notMonth:'Not a full-month average',association:'Event dates and flight comparisons are separate information; a cause for the flight change has not been established.'},
 zh:{origin:'韩国出发地日程 · 不作目的地航线比较',selected:'所选日期',all:'全机场',concourse:'卫星厅',main:'T1主楼',loading:'正在确认出发航班',baselineLoading:'正在确认日均对比资料',missing:'暂无出发航班资料',partial:'出发航班资料不完整 · 不显示总数',comparison:'暂无日均对比资料',held:'暂缓比较',zero:'基准为0班 · 无法计算百分比',basis:'按航线国家',scheduled:'计划出发航班',sample:'计入日期',days:'天',full:'全部',notMonth:'非全月平均',association:'活动日程与航班对比为独立信息，尚未确认航班变化的原因。'},
 ja:{origin:'韓国出発地の行事 · 目的地別路線の比較対象外',selected:'選択日',all:'空港全体',concourse:'搭乗棟',main:'T1本館',loading:'出発便を確認中',baselineLoading:'1日平均の比較データを確認中',missing:'出発便データなし',partial:'出発便の一部データ · 合計非表示',comparison:'1日平均の比較データなし',held:'比較保留',zero:'基準0便 · 増減率は計算不可',basis:'路線の国別',scheduled:'出発予定便',sample:'集計日数',days:'日',full:'全',notMonth:'月全体の平均ではありません',association:'行事日程と便数比較は別の情報です。便数の増減の原因は確認されていません。'},
};
function values(country:string,label:string,context:EventFlightContext|undefined,lang:Lang){
 country=label==='괌'?'GU':label==='사이판'?'MP':country;
 const text=copy[lang],number=new Intl.NumberFormat(lang,{maximumFractionDigits:1}),metric=eventCountryFlights(context,country);
 const name=lang==='ja'?new Intl.DisplayNames(['ja'],{type:'region'}).of(country)??label:briefCountryName(country,label,lang);
 const scope=context?.scope==='all'?text.all:context?.scope==='T1'?text.main:context?.scope==='CONCOURSE'?text.concourse:context?.scope??text.all;
 const unit=lang==='ko'?'편':lang==='en'?' flights':lang==='zh'?'班':'便';
 const route=lang==='ko'?`${name}행`:lang==='en'?`${name}-bound`:lang==='zh'?`飞往${name}`:`${name}行き`;
 const sample=metric.partial?`${text.sample} ${metric.days}/${metric.expectedDays}${text.days}`:`${text.full} ${metric.days}${text.days}`;
 const average=lang==='ko'?'일평균 대비':lang==='en'?'daily average':lang==='zh'?'日均比':'1日平均比';
 return {text,number,metric,name,scope,unit,route,sample,average};
}
type Props={country:string;label:string;context?:EventFlightContext;lang:Lang};
/** Always resolve by this event's country; no ranked-route fallback. Dates are flight dates, not event dates. */
export function EventCountryFlights({country,label,context,lang}:Props){
 const {text,number,metric,scope,unit,route}=values(country,label,context,lang);
 if(metric.originContext)return <div className="event-country-flights event-origin-context" data-country="KR"><p>{text.origin}</p></div>;
 return <div className="event-country-flights" data-country={metric.country} data-flight-day={context?.day} data-flight-scope={context?.scope}>
  <p className="event-flight-context">{text.selected} {context?.day||'—'} · {scope}</p>
  <p className="staff-route-metric">{route} {metric.count===null?(context?.status==='PARTIAL'?text.partial:context?.status==='LOADING'?text.loading:text.missing):<b>{number.format(metric.count)}{unit}</b>}</p>
  <p className="event-flight-change">{metric.mean===null?<>{metric.month&&`${metric.month} · `}{context?.baselinePending?text.baselineLoading:text.comparison}</>:<><span className="event-flight-baseline">{airportMonthPeriodLabel(context?.baseline,metric.month!,lang)} {number.format(metric.mean)}{unit} {lang==='ko'?'대비':lang==='en'?'comparison':lang==='zh'?'相比':'比'}</span>  {metric.delta===null?text.held:<><CountChange delta={metric.delta} format={number.format} unit={unit} lang={lang}/>{' '}<span className="staff-route-rate">(<ChangeRate value={metric.percent} lang={lang}/>)</span>{metric.mean===0&&<> · {text.zero}</>}</>}</>}</p>
 </div>;
}
export function EventCountryFlightBasis(props:Props & {eventForecastNote?:boolean}){
 const {text,metric,sample}=values(props.country,props.label,props.context,props.lang);
 if(metric.originContext)return <p className="event-flight-basis" data-country="KR">{text.origin}</p>;
 // The adjacent metric already states flight date, terminal, mean and changes.
 // Keep only the extra evidence here: route definition and actual included dates.
 const reference=({ko:'선택일 항공편 참고 · 행사일 예측 아님',en:'Selected-day flights · not an event-day forecast',zh:'所选日期航班参考 · 非活动日期预测',ja:'選択日の便数参考・行事日の予測ではありません'} as const)[props.lang];
 const association=({ko:'증감 원인 미확인',en:'Cause of change unconfirmed',zh:'变化原因未确认',ja:'増減の原因は未確認'} as const)[props.lang];
 return <><p className="event-flight-basis" data-country={metric.country}>{text.basis} · {text.scheduled}{metric.mean!==null&&<> · {metric.start}–{metric.end} <span className="staff-route-sample">({sample})</span>{metric.partial&&<> · {text.notMonth}</>}</>}</p><p className="event-flight-note">{props.eventForecastNote&&<>{reference} · </>}{association}</p></>;
}
