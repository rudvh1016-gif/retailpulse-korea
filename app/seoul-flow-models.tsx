'use client';
import type {Lang} from './retailpulse-data';
import type {LiveSummary} from './live-signals';
import {fromSummary,type SeoulFlowArea} from '../lib/seoul-flow-data.mjs';
// Styles are supplied by the existing global CSS, so Node renderers can import this component.
const styles={"image":"seoul-flow-image","models":"seoul-flow-models","row":"seoul-flow-row","content":"seoul-flow-content","metrics":"seoul-flow-metrics","basis":"seoul-flow-basis","note":"seoul-flow-note"};

const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const sourceName={ko:'서울 열린데이터광장',en:'Seoul Open Data',zh:'首尔开放数据广场',ja:'ソウル オープンデータ広場'};
const copy={
 ko:{title:'이동과 외국인 흐름',station:'대표 지하철역 승하차',alighting:'하차',boarding:'승차',living:'단기외국인 생활인구',tourism:'관광 목적 이동',people:'명',estimate:'명 · 추정',missing:'자료 없음',date:'기준일',reference:'기준 시각',retrieved:'수집',release:'공식 파일 발표 월',unit:'원자료 단위 미확인',stationNote:'전체 이용객 집계 · 외국인 또는 매장 방문 수가 아닙니다.',livingNote:'그 시각 이 지역에 있던 단기 체류 외국인(관광객 등)을 휴대폰 신호로 추정한 수입니다. 한 시점의 인구라 하루 방문자 수로 더하지 않습니다.',livingStale:(day:string)=>`서울시가 ${day} 뒤 새 자료를 아직 내지 않아 그날 값을 보여 줍니다. 매일 다시 확인합니다.`,tourismMetric:'관광하러 도착',tourismNote:'그날 관광 목적으로 이 지역에 도착한 외국인의 이동을 휴대폰 신호로 추정한 인원입니다. 한 사람이 두 번 오면 두 번 셉니다. 3명 이하인 칸은 가려져 합계에서 빠지므로 실제보다 조금 적을 수 있습니다.',tourismMissing:'이 날짜에 공개된 관광 목적 이동 값이 없습니다.',cadence:'서울시가 매달 한 번 지난달 자료를 공개',model:'개념 모형 · 실제 좌표·관측 경로가 아니며 모형의 수와 높이는 통계값을 나타내지 않습니다.'},
 en:{title:'Movement and foreign population',station:'Representative station ridership',alighting:'Alighting',boarding:'Boarding',living:'Short-stay foreign living population',tourism:'Tourism-purpose movement',people:'people',estimate:'people · est.',missing:'No data',date:'Reporting date',reference:'Reference time',retrieved:'Retrieved',release:'Official file release month',unit:'Original unit unverified',stationNote:'All passengers · not a count of foreign visitors or shop visits.',livingNote:'Short-stay foreigners (tourists and other visitors) estimated from mobile signals to be in this area at that time. A one-time population, so it is not added up as daily visitors.',livingStale:(day:string)=>`Seoul has not published newer data since ${day}, so that day's value is shown. Checked again every day.`,tourismMetric:'Arrived for tourism',tourismNote:'Foreign arrivals in this area for tourism on that day, estimated from mobile signals. One person arriving twice counts twice. Cells of 3 or fewer are masked and left out, so the total can be slightly low.',tourismMissing:'No published tourism-purpose movement for this date.',cadence:'Seoul publishes last month\'s data once a month',model:'Concept model · not official coordinates or observed routes. Geometry does not encode statistical values.'},
 zh:{title:'移动与外国人生活人口',station:'代表地铁站进出站',alighting:'出站',boarding:'进站',living:'短期停留外国人生活人口',tourism:'旅游目的移动',people:'人',estimate:'人 · 估算',missing:'暂无数据',date:'参考日期',reference:'参考时间',retrieved:'采集',release:'官方文件发布月份',unit:'原始单位未确认',stationNote:'全部乘客统计 · 不代表外国游客或商店访客人数。',livingNote:'根据手机信号估算的该时刻在本区域的短期停留外国人（游客等）。这是某一时刻的人口，不累加为每日访客人数。',livingStale:(day:string)=>`首尔市自${day}后尚未发布新数据，因此显示当日数值。每天重新确认。`,tourismMetric:'以旅游目的到达',tourismNote:'根据手机信号估算的当天以旅游为目的到达本区域的外国人移动人次。同一人到达两次计两次。3人及以下的单元被隐藏且不计入，合计可能略低于实际。',tourismMissing:'该日期没有公开的旅游目的移动数值。',cadence:'首尔市每月公开一次上月数据',model:'概念模型 · 非官方坐标或观测路线。模型数量与高度不表示统计值。'},
 ja:{title:'移動と外国人生活人口',station:'代表駅の乗降',alighting:'降車',boarding:'乗車',living:'短期滞在外国人生活人口',tourism:'観光目的の移動',people:'人',estimate:'人 · 推定',missing:'データなし',date:'基準日',reference:'基準時刻',retrieved:'収集',release:'公式ファイルの公表月',unit:'元資料の単位未確認',stationNote:'全利用客の集計 · 外国人や店舗訪問者の人数ではありません。',livingNote:'その時刻にこの地域にいた短期滞在外国人（観光客など）を携帯電話の信号から推定した数です。一時点の人口なので、一日の訪問者数として合算しません。',livingStale:(day:string)=>`ソウル市が${day}以降の新しいデータをまだ公開していないため、その日の値を表示しています。毎日確認し直します。`,tourismMetric:'観光目的で到着',tourismNote:'その日に観光目的でこの地域に到着した外国人の移動を携帯電話の信号から推定した人数です。同じ人が2回来れば2回数えます。3人以下のセルは伏せられ合計から外れるため、実際より少し少ないことがあります。',tourismMissing:'この日付に公開された観光目的の移動値はありません。',cadence:'ソウル市が毎月1回、前月分を公開',model:'概念模型 · 公式座標や観測経路ではありません。模型の数と高さは統計値を表しません。'},
};
function reference(value:string|null,lang:Lang,withTime=false) {
 if(!value)return '—';
 const instant=new Date(value.length===10?value+'T12:00:00+09:00':value);
 if(!Number.isFinite(instant.getTime()))return '—';
 return new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',...(withTime?{hour:'2-digit',minute:'2-digit',hourCycle:'h23' as const}:{})}).format(instant)+(withTime?' KST':'');
}
/** A short-stay population older than this, against the summary's own time, is called out as not renewed. */
const LIVING_STALE_DAYS=10;
function staleSince(referenceAt:string|null|undefined,generatedAt:string|null|undefined,lang:Lang){
 if(!referenceAt||!generatedAt)return null;
 const at=Date.parse(referenceAt),now=Date.parse(generatedAt);
 if(!Number.isFinite(at)||!Number.isFinite(now)||now-at<LIVING_STALE_DAYS*86_400_000)return null;
 return new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(new Date(at));
}
function ModelImage({name}:{name:string}) {
 // The imagery is decorative: values, periods and units remain ordinary HTML.
 // 1200w covers 390–440px phones at 3x, which otherwise jump from 960 to 1440.
 // eslint-disable-next-line @next/next/no-img-element
 return <img className={styles.image} src={`/seoul-flow-models/${name}-640.webp`} srcSet={[640,960,1200,1440].map(w=>`/seoul-flow-models/${name}-${w}.webp ${w}w`).join(', ')} sizes="(max-width:600px) calc(100vw - 40px), 320px" width={1440} height={900} alt="" loading="lazy" decoding="async"/>;
}
/** Receives the caller's existing summary. No additional request or provider collection. */
export function SeoulFlowModels({summary,area,lang,publication}:{summary:LiveSummary|null;area:SeoulFlowArea;lang:Lang;publication?:{releaseMonth?:string}}) {
 const data=fromSummary(summary,area,publication),t=copy[lang];
 const number=new Intl.NumberFormat(locales[lang],{maximumFractionDigits:1});
 const value=(n:number|null|undefined)=>n==null?t.missing:number.format(n);
 const station=data.station,living=data.foreignLivingPopulation,movement=data.tourismPurposeMovement;
 const whole=new Intl.NumberFormat(locales[lang],{maximumFractionDigits:0});
 const livingStale=staleSince(living?.referenceAt,summary?.generatedAt,lang);
 return <section className={styles.models} data-testid="seoul-flow-models" data-area={area} aria-label={t.title}>
  <h3>{t.title}</h3>
  <div className={styles.row} data-flow="station">
   <ModelImage name="station"/>
   <div className={styles.content}><h4>{t.station}{station?.stationName?` · ${station.stationName.replaceAll('|',' · ')}`:''}</h4>
    <dl className={styles.metrics}><div><dt>{t.alighting}</dt><dd>{value(station?.alightingCount)}{station?.alightingCount!=null&&<small>{t.people}</small>}</dd></div><div><dt>{t.boarding}</dt><dd>{value(station?.boardingCount)}{station?.boardingCount!=null&&<small>{t.people}</small>}</dd></div></dl>
    <p className={styles.basis}>{t.date} · {reference(station?.referenceDate??null,lang)} · {station?sourceName[lang]:'—'}</p>
    <p className={styles.basis}>{t.retrieved} · {reference(station?.retrievedAt??null,lang,true)}</p><p className={styles.note}>{t.stationNote}</p>
   </div>
  </div>
  <div className={styles.row} data-flow="living">
   <ModelImage name="living-population"/>
   <div className={styles.content}><h4>{t.living}</h4><dl className={styles.metrics}><div><dt>{t.living}</dt><dd>{value(living?.value)}{living?.value!=null&&<small>{t.estimate}</small>}</dd></div></dl>
    <p className={styles.basis}>{t.reference} · {reference(living?.referenceAt??null,lang,true)} · {living?sourceName[lang]:'—'}</p>
    <p className={styles.basis}>{t.retrieved} · {reference(living?.retrievedAt??null,lang,true)}</p>{livingStale&&<p className={styles.note} data-testid="seoul-living-stale">{t.livingStale(livingStale)}</p>}<p className={styles.note}>{t.livingNote}</p>
   </div>
  </div>
  <div className={styles.row} data-flow="tourism">
   <ModelImage name="tourism-movement"/>
   <div className={styles.content}><h4>{t.tourism}</h4>
    {/* OA-22378 이동인구, people counted per arrival (lib/seoul-flow-data.mjs); rounded because it is an expansion-weighted estimate. */}
    {movement?.value!=null?<dl className={styles.metrics}><div><dt>{t.tourismMetric}</dt><dd>{whole.format(movement.value)}<small>{t.estimate}</small></dd></div></dl>:movement&&<p className={styles.note}>{t.tourismMissing}</p>}
    <p className={styles.basis}>{t.date} · {reference(movement?.referenceDate??null,lang)} · {movement?sourceName[lang]:'—'}</p>
    <p className={styles.basis}>{movement?.releaseMonth?`${t.release} · ${movement.releaseMonth}`:t.cadence} · {t.retrieved} · {reference(movement?.retrievedAt??null,lang,true)}</p><p className={styles.note}>{t.tourismNote}</p>
   </div>
  </div>
  <p className={styles.note}>{t.model}</p>
 </section>;
}
