'use client';
import type {Lang} from './retailpulse-data';
import type {LiveSummary} from './live-signals';
import {fromSummary,type SeoulFlowArea} from '../lib/seoul-flow-data.mjs';
// Styles are supplied by the existing global CSS, so Node renderers can import this component.
const styles={"image":"seoul-flow-image","models":"seoul-flow-models","row":"seoul-flow-row","content":"seoul-flow-content","metrics":"seoul-flow-metrics","basis":"seoul-flow-basis","note":"seoul-flow-note"};

const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const copy={
 ko:{title:'이동과 외국인 흐름',station:'대표 지하철역 승하차',alighting:'하차',boarding:'승차',living:'단기외국인 생활인구',tourism:'관광 목적 이동',people:'명',estimate:'명 · 추정',missing:'자료 없음',date:'기준일',reference:'기준 시각',retrieved:'수집',release:'공식 파일 발표 월',unit:'원자료 단위 미확인',stationNote:'전체 이용객 집계 · 외국인 또는 매장 방문 수가 아닙니다.',livingNote:'한 시점의 인구 추정 · 하루 방문자 수로 합산하지 않습니다.',tourismNote:'공식 파일 집계 · 단위 확인 전 사람 수나 이동 건수로 해석하지 않습니다.',model:'개념 모형 · 실제 좌표·관측 경로가 아니며 모형의 수와 높이는 통계값을 나타내지 않습니다.'},
 en:{title:'Movement and foreign population',station:'Representative station ridership',alighting:'Alighting',boarding:'Boarding',living:'Short-stay foreign living population',tourism:'Tourism-purpose movement',people:'people',estimate:'people · est.',missing:'No data',date:'Reporting date',reference:'Reference time',retrieved:'Retrieved',release:'Official file release month',unit:'Original unit unverified',stationNote:'All passengers · not a count of foreign visitors or shop visits.',livingNote:'Population estimate at one time · do not sum as daily visitors.',tourismNote:'Official file aggregate · do not interpret as people or trips until the unit is verified.',model:'Concept model · not official coordinates or observed routes. Geometry does not encode statistical values.'},
 zh:{title:'移动与外国人生活人口',station:'代表地铁站进出站',alighting:'出站',boarding:'进站',living:'短期停留外国人生活人口',tourism:'旅游目的移动',people:'人',estimate:'人 · 估算',missing:'暂无数据',date:'参考日期',reference:'参考时间',retrieved:'采集',release:'官方文件发布月份',unit:'原始单位未确认',stationNote:'全部乘客统计 · 不代表外国游客或商店访客人数。',livingNote:'某一时刻的人口估算 · 不累加为每日访客人数。',tourismNote:'官方文件汇总 · 单位确认前，不解释为人数或出行次数。',model:'概念模型 · 非官方坐标或观测路线。模型数量与高度不表示统计值。'},
 ja:{title:'移動と外国人生活人口',station:'代表駅の乗降',alighting:'降車',boarding:'乗車',living:'短期滞在外国人生活人口',tourism:'観光目的の移動',people:'人',estimate:'人 · 推定',missing:'データなし',date:'基準日',reference:'基準時刻',retrieved:'収集',release:'公式ファイルの公表月',unit:'元資料の単位未確認',stationNote:'全利用客の集計 · 外国人や店舗訪問者の人数ではありません。',livingNote:'一時点の人口推定 · 一日の訪問者数に合算しません。',tourismNote:'公式ファイルの集計 · 単位確認前に人数や移動回数と解釈しません。',model:'概念模型 · 公式座標や観測経路ではありません。模型の数と高さは統計値を表しません。'},
};
function reference(value:string|null,lang:Lang,withTime=false) {
 if(!value)return '—';
 const instant=new Date(value.length===10?value+'T12:00:00+09:00':value);
 if(!Number.isFinite(instant.getTime()))return '—';
 return new Intl.DateTimeFormat(locales[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',...(withTime?{hour:'2-digit',minute:'2-digit',hourCycle:'h23' as const}:{})}).format(instant)+(withTime?' KST':'');
}
function ModelImage({name}:{name:string}) {
 // The imagery is decorative: values, periods and units remain ordinary HTML.
 // eslint-disable-next-line @next/next/no-img-element
 return <img className={styles.image} src={`/seoul-flow-models/${name}-640.webp`} srcSet={[640,960,1440].map(w=>`/seoul-flow-models/${name}-${w}.webp ${w}w`).join(', ')} sizes="(max-width:600px) calc(100vw - 40px), 320px" width={1440} height={900} alt="" loading="lazy" decoding="async"/>;
}
/** Receives the caller's existing summary. No additional request or provider collection. */
export function SeoulFlowModels({summary,area,lang,publication}:{summary:LiveSummary|null;area:SeoulFlowArea;lang:Lang;publication?:{releaseMonth?:string}}) {
 const data=fromSummary(summary,area,publication),t=copy[lang];
 const number=new Intl.NumberFormat(locales[lang],{maximumFractionDigits:1});
 const value=(n:number|null|undefined)=>n==null?t.missing:number.format(n);
 const station=data.station,living=data.foreignLivingPopulation,movement=data.tourismPurposeMovement;
 return <section className={styles.models} data-testid="seoul-flow-models" data-area={area} aria-label={t.title}>
  <h3>{t.title}</h3>
  <div className={styles.row} data-flow="station">
   <ModelImage name="station"/>
   <div className={styles.content}><h4>{t.station}{station?.stationName?` · ${station.stationName.replaceAll('|',' · ')}`:''}</h4>
    <dl className={styles.metrics}><div><dt>{t.alighting}</dt><dd>{value(station?.alightingCount)}{station?.alightingCount!=null&&<small>{t.people}</small>}</dd></div><div><dt>{t.boarding}</dt><dd>{value(station?.boardingCount)}{station?.boardingCount!=null&&<small>{t.people}</small>}</dd></div></dl>
    <p className={styles.basis}>{t.date} · {reference(station?.referenceDate??null,lang)} · {station?.provider??'—'}</p>
    <p className={styles.basis}>{t.retrieved} · {reference(station?.retrievedAt??null,lang,true)}</p><p className={styles.note}>{t.stationNote}</p>
   </div>
  </div>
  <div className={styles.row} data-flow="living">
   <ModelImage name="living-population"/>
   <div className={styles.content}><h4>{t.living}</h4><dl className={styles.metrics}><div><dt>{t.living}</dt><dd>{value(living?.value)}{living?.value!=null&&<small>{t.estimate}</small>}</dd></div></dl>
    <p className={styles.basis}>{t.reference} · {reference(living?.referenceAt??null,lang,true)} · {living?.provider??'—'}</p>
    <p className={styles.basis}>{t.retrieved} · {reference(living?.retrievedAt??null,lang,true)}</p><p className={styles.note}>{t.livingNote}</p>
   </div>
  </div>
  <div className={styles.row} data-flow="tourism">
   <ModelImage name="tourism-movement"/>
   <div className={styles.content}><h4>{t.tourism}</h4><dl className={styles.metrics}><div><dt>{t.unit}</dt><dd>{value(movement?.value)}</dd></div></dl>
    <p className={styles.basis}>{t.date} · {reference(movement?.referenceDate??null,lang)} · {movement?.provider??'—'}</p>
    <p className={styles.basis}>{t.release} · {movement?.releaseMonth??'—'} · {t.retrieved} · {reference(movement?.retrievedAt??null,lang,true)}</p><p className={styles.note}>{t.tourismNote}</p>
   </div>
  </div>
  <p className={styles.note}>{t.model}</p>
 </section>;
}