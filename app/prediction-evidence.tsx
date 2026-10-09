'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './prediction-view.module.css';
import {predictionScore} from '../lib/prediction-progress';
import type {Lang} from './retailpulse-data';
import type {AreaId} from '../lib/areas';
import {LiveLoadMessage} from './live-signals';
import {contextText} from './operational-context';
interface ForecastPayload {
 targetDate:string;run:null|{createdAt:string;status:string;hours:Array<{hour:number;value:number;sampleDates:string[]}>;history:{missingDays:string[]}};
 coverage:null|{readiness?:{targetDate:string;hours:Array<{hour:number;sampleDates:string[];missingWeeks:number;ready:boolean;compatible:boolean}>};days:number;firstAt:string|null;latestAt:string|null;missingDays:string[];dailyHours:Array<{day:string;hours:number}>};
 records:Array<{targetAt:string;predicted:number;actual:number|null;createdAt:string;actualAt:string|null}>;
}

/** Retained evidence in Records; the removed standalone outlook is not rendered. */
export function PredictionEvidence({lang,area}:{lang:Lang;area:AreaId}){
 const [loaded,setLoaded]=useState<{area:string;data:ForecastPayload|null}|null>(null);
 useEffect(()=>{let active=true;const controller=new AbortController();fetch(`/api/live/predictions?area=${area}`,{signal:controller.signal}).then(async response=>response.ok?await response.json() as ForecastPayload:null).catch(()=>null).then(data=>{if(active)setLoaded({area,data});});return()=>{active=false;controller.abort();};},[area]);
 const data=loaded?.area===area?loaded.data:undefined;
 const history=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const revealScore=()=>{
   if(window.location.hash!=='#prediction-score'||!history.current)return;
   history.current.open=true;
   history.current.querySelector('#prediction-score')?.scrollIntoView({block:'start'});
  };
  revealScore();
  window.addEventListener('hashchange',revealScore);
  return()=>window.removeEventListener('hashchange',revealScore);
 },[data?.coverage]);

 const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
 const score=predictionScore(data?.records??[]);
 const readiness=data?.coverage?.readiness?.targetDate===data?.targetDate?data?.coverage?.readiness:null;
 return <section className="prediction-archive">
  {data===undefined&&<LiveLoadMessage loading lang={lang}/>}
  {data===null&&<LiveLoadMessage loading={false} lang={lang}/>}
  {data&&!data.coverage&&<p>{t('아직 보유한 관측·예측 비교 기록이 없습니다.','No retained observation/forecast comparisons yet.','尚无已保留的观测与预测对比记录。','保有する観測・予測の比較記録はまだありません。')}</p>}
  {data?.coverage&&<details ref={history} className={`prediction-history ${styles.disclosure}`}>
   <summary>{t('자료·예측 정확도','Data and forecast accuracy','资料与预测准确度','資料・予測精度')}</summary>
   <h2>{t('기록이 잘 쌓이고 있나요?','Is the history building reliably?','历史记录是否完整？','記録は蓄積されていますか？')}</h2><p>{t(`최근 28일 중 관측 기록이 있는 날 ${data.coverage.days}일`,`${data.coverage.days} of the last 28 days have observations`,`最近28天中有${data.coverage.days}天观测记录`,`直近28日中、観測記録がある日は${data.coverage.days}日`)} · {t('최신 관측','Latest observation','最新观测','最新観測')} {data.coverage.latestAt?.slice(0,16).replace('T',' ')??'—'} KST</p>
   <small>{t('하루에 기록이 하나 있어도 1일로 셉니다. 모든 시간이 채워졌다는 뜻은 아닙니다. 저장한 예측은 덮어쓰지 않고 실제 관측을 나중에 따로 연결합니다.','One recorded observation counts as a day; this does not mean every hour is complete. Saved predictions stay unchanged and later observations are linked separately.','一天有一条记录即计为一天，并不表示全天完整。已保存预测不会被覆盖，之后单独关联观测结果。','1件でも記録があれば1日と数えるため全時間の完全性は意味しません。保存済み予測は変更せず、後から観測結果を別に紐付けます。')}</small>
   {readiness&&<details className="prediction-readiness"><summary>{t(`내일 예상 준비: ${readiness.hours.filter(row=>row.ready).length}/24시간에 최소 자료 확보`,`Tomorrow's input readiness: ${readiness.hours.filter(row=>row.ready).length}/24 hours`,`明日预测准备：${readiness.hours.filter(row=>row.ready).length}/24小时资料就绪`,`明日の予測準備：${readiness.hours.filter(row=>row.ready).length}/24時間`)}</summary>
    <p>{t('각 시간의 시작 15분 안에 관측한 같은 요일 기록을 확인합니다. 자료 확보는 정확도 검증 완료를 뜻하지 않습니다.','Checks matching weekdays observed within the first 15 minutes of each hour. Input readiness is not validated accuracy.','检查每小时开始15分钟内的同星期观测。资料就绪不代表准确率已验证。','各時間の最初の15分以内に観測した同曜日の記録。資料の確保は精度の検証完了ではありません。')}</p>
    <ul className="prediction-hours">{readiness.hours.map(row=><li key={row.hour}><strong>{String(row.hour).padStart(2,'0')}:00</strong><span>{row.ready?t('최소 자료 확보','Minimum inputs ready','最低资料就绪','最低資料確保'):!row.compatible?t('자료 기준이 달라 비교 보류','Different source definitions','资料定义不同，暂缓比较','資料基準が異なり比較保留'):t(`${row.sampleDates.length}주 확보 · ${row.missingWeeks}주 더 필요`,`${row.sampleDates.length} weeks available · ${row.missingWeeks} more needed`,`已有${row.sampleDates.length}周 · 还需${row.missingWeeks}周`,`${row.sampleDates.length}週分確保・あと${row.missingWeeks}週必要`)}</span><small>{row.sampleDates.join(' · ')||t('해당 요일·시간 기록 없음','No matching records','无匹配记录','該当記録なし')}</small></li>)}</ul>
   </details>}
   <div className="prediction-score" id="prediction-score"><p>{t("7DAYS · 최근 7일의 예측·관측 비교 기록입니다. 앞으로 7일의 예보가 아닙니다.","7DAYS · Forecast/observation comparisons from the last 7 days, not a 7-day forecast.","7DAYS · 最近7天预测与观测对比记录，并非未来7天预报。","7DAYS・直近7日間の予測と観測の比較記録です。今後7日間の予報ではありません。")}</p><h3>{t('예측 성적표 · 최근 7일','Prediction scorecard · last 7 days','预测成绩单 · 最近7天','予測の成績表・直近7日')}</h3>
    <p>{t(`관측과 비교한 ${score.matchedHours}개 시간 · ${score.matchedDays}일`,`${score.matchedHours} matched hours across ${score.matchedDays} days`,`已比较${score.matchedHours}个时段 · ${score.matchedDays}天`,`${score.matchedHours}時間・${score.matchedDays}日分を観測と比較`)}</p>
    <p>{score.meanAbsoluteError===null?t('아직 비교할 결과가 없습니다.','No matched outcomes yet.','暂无可比较结果。','まだ比較結果がありません。'):t(`예상과 관측의 평균 차이 약 ${score.meanAbsoluteError.toLocaleString()}명`,`Mean absolute difference: about ${score.meanAbsoluteError.toLocaleString()} people`,`预测与观测平均绝对差约${score.meanAbsoluteError.toLocaleString()}人`,`予測と観測の平均絶対差は約${score.meanAbsoluteError.toLocaleString()}人`)}</p>
    <small>{t(`관측 연결 대기 ${score.pendingHours}개 시간. 관측값도 서울시 추정 인구 범위의 중간값입니다. 단순 과거 평균을 사용하는 초기 모델이며, 정확도 보증이나 매출 예측이 아닙니다.`,`${score.pendingHours} hours await observations. Observations also use Seoul's estimated population-range midpoint. This initial historical-mean model is not an accuracy guarantee or sales forecast.`,`${score.pendingHours}个时段等待观测。观测也是首尔市估计人口区间中点。初期历史平均模型，不保证准确率，也不是销售预测。`,`${score.pendingHours}時間が観測待ち。観測値もソウル市の推定人口範囲の中央値です。過去平均を使う初期モデルで、精度保証や売上予測ではありません。`)}</small>
   </div>
   <details><summary>{t('날짜별 수집 상태','Daily coverage','每日收集情况','日別の収集状況')}</summary><p>{t('관측 기록이 없는 날','Days without observations','无观测记录的日期','観測記録のない日')} · {data.coverage.missingDays.join(' · ')||'—'}</p><ul className="prediction-hours">{data.coverage.dailyHours.map(row=><li key={row.day}><strong>{row.day}</strong><span>{row.hours}/24 {t('시간에 기록 있음','hours recorded','小时有记录','時間に記録あり')}</span></li>)}</ul></details>
   <details><summary>{t('지난 예상과 실제 관측 비교','Past estimates and later observations','过去预测与后续观测对比','過去予測と後日の観測を比較')}</summary>{data.records.length?<ul className="prediction-hours">{data.records.map(row=><li key={row.targetAt}><strong>{row.targetAt.slice(5,16).replace('T',' ')}</strong><span>{t('예상','Estimate','预测','予測')} {row.predicted.toLocaleString()} · {t('관측','Observed','观测','観測')} {row.actual?.toLocaleString()??t('대기','Pending','等待','待機')}</span></li>)}</ul>:<p>{t('결과보다 먼저 저장한 예측 기록이 아직 없습니다. 정확도를 주장하지 않습니다.','No prospectively saved prediction records yet. No accuracy claim.','尚无提前保存的预测记录，不声称准确率。','結果より前に保存した予測はまだありません。精度は主張しません。')}</p>}</details>
  </details>}
 </section>;
}
