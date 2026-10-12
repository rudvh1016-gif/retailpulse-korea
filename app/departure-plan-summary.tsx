import type {Lang} from './retailpulse-data';
import {departurePreparationCopy} from './airport-departure-preparation-copy';
import {departureChoiceCopy} from './departure-choice-copy';
import {departurePreparationEvidence,type DeparturePreparationInput,type DepartureStepId,type departurePreparation} from '../lib/airport-departure-preparation';
import styles from './departure-plan-summary.module.css';

const title={ko:'내 출국 순서',en:'My departure steps',zh:'我的出境流程',ja:'自分の出国手順'};
const labels:Record<Lang,Record<DepartureStepId,string>>={
 ko:{CONFIRM:'터미널·탑승 위치 확인',CHECK_IN:'체크인',CHECK_IN_TAX:'체크인·환급 물품 알림·키오스크 확인',CHECKED_CUSTOMS:'위탁할 환급 물품이 검사 대상이면 세관 확인',BAG_DROP:'필요한 확인 후 짐 보내기',SECURITY:'보안검색',IMMIGRATION:'출국심사',REFUND:'환급 사업자 창구·키오스크',PICKUP:'주문서의 면세품 인도장',GATE:'최신 탑승구·마감시간 확인'},
 en:{CONFIRM:'Check terminal and boarding location',CHECK_IN:'Check in',CHECK_IN_TAX:'Check in, declare refund goods, check kiosk',CHECKED_CUSTOMS:'Customs if checked refund goods are selected for inspection',BAG_DROP:'Hand over bags after required checks',SECURITY:'Security screening',IMMIGRATION:'Departure immigration',REFUND:'Refund operator’s counter or kiosk',PICKUP:'Pickup counter shown on your order',GATE:'Check current gate and boarding deadline'},
 zh:{CONFIRM:'确认航站楼及登机位置',CHECK_IN:'办理值机',CHECK_IN_TAX:'值机、告知退税商品并查询自助机',CHECKED_CUSTOMS:'托运退税商品被选中检查时办理海关确认',BAG_DROP:'完成必要确认后托运行李',SECURITY:'安全检查',IMMIGRATION:'出境审查',REFUND:'退税运营商柜台或自助机',PICKUP:'订单所列免税品提货点',GATE:'确认最新登机口及截止时间'},
 ja:{CONFIRM:'ターミナル・搭乗場所を確認',CHECK_IN:'チェックイン',CHECK_IN_TAX:'チェックイン・還付品の申告・端末確認',CHECKED_CUSTOMS:'預ける還付品が検査対象なら税関確認',BAG_DROP:'必要な確認後に荷物を預ける',SECURITY:'保安検査',IMMIGRATION:'出国審査',REFUND:'還付事業者の窓口・端末',PICKUP:'注文書の免税品受取場所',GATE:'最新の搭乗口・締切を確認'},
};
export function DeparturePlanSummary({input,plan,lang}:{input:DeparturePreparationInput;plan:ReturnType<typeof departurePreparation>;lang:Lang}){
 const c=departurePreparationCopy[lang],short=departureChoiceCopy(lang);
 return <section className={styles.summary} data-testid="prep-live-summary" aria-live="polite" aria-atomic="true">
  <h3>{title[lang]}</h3>
  {!plan.supported?<p>{c.confirm}</p>:<>
   <p className={styles.route}>{({T1:c.t1,T2:c.t2,T1_CONCOURSE:c.concourse,UNKNOWN:c.unknown})[input.route]}</p>
   <ol className={styles.phases}>{(['BEFORE_SECURITY','SECURITY','AFTER_SECURITY'] as const).map(phase=><li key={phase}>
    <strong>{({BEFORE_SECURITY:c.before,SECURITY:c.security,AFTER_SECURITY:c.after})[phase]}</strong>
    <p>{plan.steps.filter(step=>step.phase===phase).map((step,index)=><span key={step.id} data-summary-step={step.id} data-conditional={step.conditional||undefined}>{index>0?(phase==='AFTER_SECURITY'?' · ':' → '):''}{labels[lang][step.id]}</span>)}</p>
   </li>)}</ol>
   {plan.unknown.length>0&&<p data-testid="prep-summary-unknown">{short.unknown}: {plan.unknown.map(key=>({checkedBaggage:c.baggage,taxRefund:c.tax,dutyFreePickup:c.pickup,route:c.route})[key]).join(' · ')}. {short.unsure}</p>}
   {input.taxRefund==='YES'&&<p data-testid="prep-summary-refund-check">{input.checkedBaggage==='NO'?c.carryNote:c.checkedCustoms}</p>}
   {input.dutyFreePickup==='YES'&&<p data-testid="prep-summary-pickup-location">{c.pickupStep}</p>}
   {input.route==='T1_CONCOURSE'&&<p data-testid="prep-summary-concourse">{c.concourseNote}</p>}
  </>}
  <a href={departurePreparationEvidence.AIRPORT.url} target="_blank" rel="noreferrer">{c.official} ↗</a>
 </section>;
}
