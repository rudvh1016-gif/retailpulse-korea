'use client';
import { useEffect,useState } from 'react';
import { predictionScore } from '../lib/prediction-progress';
import type { Lang } from './retailpulse-data';
import { useLiveSummary,LiveLoadMessage } from './live-signals';
import { HolidayContext,SeoulContextCard,contextText } from './operational-context';
interface ForecastPayload {
 targetDate:string;run:null|{createdAt:string;status:string;hours:Array<{hour:number;value:number;sampleDates:string[]}>;history:{missingDays:string[]}};
 coverage:null|{readiness?:{targetDate:string;hours:Array<{hour:number;sampleDates:string[];missingWeeks:number;ready:boolean;compatible:boolean}>};days:number;firstAt:string|null;latestAt:string|null;missingDays:string[];dailyHours:Array<{day:string;hours:number}>};
 records:Array<{targetAt:string;predicted:number;actual:number|null;createdAt:string;actualAt:string|null}>;
}
export function PredictionView({lang,area,onArea}:{lang:Lang;area:'myeongdong'|'hongdae'|'seongsu';onArea:(area:'myeongdong'|'hongdae'|'seongsu')=>void}) {
 const summary=useLiveSummary();
 const [loaded,setLoaded]=useState<{area:string;data:ForecastPayload|null}|null>(null);
 useEffect(()=>{let active=true;fetch(`/api/live/predictions?area=${area}`).then(async response=>response.ok?await response.json() as ForecastPayload:null).catch(()=>null).then(data=>{if(active)setLoaded({area,data});});return()=>{active=false;};},[area]);
 const data=loaded?.area===area?loaded.data:undefined;
 const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
 const names={myeongdong:t('명동','Myeongdong','明洞','明洞'),hongdae:t('홍대','Hongdae','弘大','弘大'),seongsu:t('성수','Seongsu','圣水','聖水')};
 const official=summary?.areas[area]?.realtimeForecast??[];
 const future=official.filter(row=>Date.parse(row.targetAt)>Date.parse(summary?.generatedAt??"") && typeof row.populationMin==='number' && typeof row.populationMax==='number' && Number.isFinite(row.populationMin) && Number.isFinite(row.populationMax) && row.populationMin>=0 && row.populationMax>=row.populationMin);
 const peak=[...future].sort((a,b)=>(b.populationMax??0)-(a.populationMax??0))[0];
 const score=predictionScore(data?.records??[]);
 const readiness=data?.coverage?.readiness?.targetDate===data?.targetDate?data?.coverage?.readiness:null;
 const hours=data?.run?.hours??[];
 const ownPeak=[...hours].sort((a,b)=>b.value-a.value)[0];
 return <section className="prediction-view">
  <div className="section-head"><div><p className="eyebrow">KORETAIL · OUTLOOK</p><h1>{t('언제 붐빌까요?','When will it be busy?','什么时候会拥挤？','いつ混み合いますか？')}</h1></div></div>
  <p className="section-intro">{t('근무 전, 앞으로 붐빌 시간과 내일의 참고 예상을 확인하세요. 예상 인원은 그 시간에 지역에 머무는 사람 수이며, 매장 방문객 수가 아닙니다.','Before your shift, check the upcoming busy hours and tomorrow’s reference outlook. Headcounts mean people present in the area, not store visitors.','上班前查看未来拥挤时段与明日参考预测。人数指区域内停留人数，并非门店访客。','勤務前に今後の混雑時間と明日の参考予測を確認。人数は地域内の滞在人口で、店舗来客数ではありません。')}</p>
  <div className="segmented" role="group" aria-label={t('지역','Area','地区','エリア')}>{(Object.keys(names) as Array<keyof typeof names>).map(id=><button key={id} type="button" className={id===area?'active':''} aria-pressed={id===area} onClick={()=>onArea(id)}>{names[id]}</button>)}</div>
  <div className="outlook-grid">
   <article><p className="eyebrow">{t('서울시 공식 예상','SEOUL OFFICIAL FORECAST','首尔市官方预测','ソウル市公式予測')}</p><h2>{t('앞으로 가장 붐빌 시간','Busiest upcoming hour','未来最拥挤时段','今後の最混雑時間')}</h2>
    {summary===undefined||summary===null?<LiveLoadMessage loading={summary===undefined} lang={lang}/>:peak?<><strong className="outlook-value">{peak.targetAt.slice(11,16)} · {peak.populationMin?.toLocaleString()}–{peak.populationMax?.toLocaleString()}{t('명',' people','人','人')}</strong><p>{peak.targetAt.slice(0,10)} · {t('서울시 발표 예상 · 실제 관측 아님','Published by Seoul · not observed','首尔市公布预测 · 非实际观测','ソウル市発表予測・実測ではありません')}</p></>:<p>{t('앞으로의 공식 예상이 아직 없습니다.','No upcoming official forecast yet.','尚无未来官方预测。','今後の公式予測はまだありません。')}</p>}
    <a href={`/${lang}/airport`}>{t('인천공항 시간대별 예상도 보기 →','Airport hourly outlook →','查看机场分时预测 →','空港の時間帯別予測 →')}</a>
   </article>
   <article><p className="eyebrow">{t('KORETAIL 참고 예상 · 검증 자료 수집 중','KORETAIL REFERENCE · VALIDATION COLLECTING','KORETAIL参考预测 · 收集验证数据中','KORETAIL参考予測・検証データ収集中')}</p><h2>{t('내일 지역 인구 흐름','Tomorrow’s area population','明日区域人口趋势','明日のエリア人口の流れ')}</h2>
    {data===undefined||data===null?<LiveLoadMessage loading={data===undefined} lang={lang}/>:<>
     <HolidayContext date={data.targetDate} months={summary?.holidays} lang={lang}/>
     {ownPeak?<><strong className="outlook-value">{String(ownPeak.hour).padStart(2,'0')}:00 · {t('약','About','约','約')} {ownPeak.value.toLocaleString()}{t('명',' people','人','人')}</strong><p>{t(`예상이 있는 ${hours.length}개 시간 중 가장 많습니다.`, `Largest among ${hours.length} available hourly estimates.`,`在已有${hours.length}个时段预测中最高。`,`${hours.length}時間の予測中で最多です。`)}</p></>:<p>{t('비교할 같은 요일 기록을 모으고 있습니다. 시간별로 최소 2주분이 쌓인 뒤 예상 숫자를 표시합니다.','Collecting matching weekdays. An hourly estimate needs at least two prior matching weekdays.','正在收集同星期记录，每个时段至少需要两周匹配数据后才显示预测。','同じ曜日の記録を収集中。時間帯ごとに最低2週分が揃ってから予測を表示します。')}</p>}
     <small>{t('매일 18시 이후 수집 때 내일 예상 저장 · 지난 4주 같은 요일·시간의 인구 범위 중간값 평균. 날씨·행사·휴일 효과는 아직 계산에 반영하지 않습니다.','Saved after 18:00 KST daily. Mean of population-range midpoints for matching weekday/hour in the prior four weeks. Weather, event and holiday effects are not modeled.','每天韩国时间18时后保存明日预测。取过去4周同星期同时间人口区间中点平均值，尚未建模天气、活动及假日影响。','毎日18時KST以降に保存。過去4週の同曜日・同時間の人口範囲中央値の平均。天気・イベント・休日効果は未反映です。')}</small>
     {!!hours.length&&<details><summary>{t('시간별 예상과 기준 날짜 보기','Hourly estimates and reference dates','查看分时预测及参考日期','時間別予測と参照日を見る')}</summary><ul className="prediction-hours">{hours.map(row=><li key={row.hour}><strong>{String(row.hour).padStart(2,'0')}:00</strong><span>{row.value.toLocaleString()}{t('명',' people','人','人')}</span><small>{row.sampleDates.join(' · ')}</small></li>)}</ul></details>}
    </>}
   </article>
  </div>
  {data?.coverage&&<section className="prediction-history"><h2>{t('기록이 잘 쌓이고 있나요?','Is the history building reliably?','历史记录是否完整？','記録は蓄積されていますか？')}</h2><p>{t(`최근 28일 중 관측 기록이 있는 날 ${data.coverage.days}일`,`${data.coverage.days} of the last 28 days have observations`,`最近28天中有${data.coverage.days}天观测记录`,`直近28日中、観測記録がある日は${data.coverage.days}日`)} · {t('최신 관측','Latest observation','最新观测','最新観測')} {data.coverage.latestAt?.slice(0,16).replace('T',' ')??'—'} KST</p>
   <small>{t('하루에 기록이 하나 있어도 1일로 셉니다. 모든 시간이 채워졌다는 뜻은 아닙니다. 저장한 예측은 덮어쓰지 않고 실제 관측을 나중에 따로 연결합니다.','One recorded observation counts as a day; this does not mean every hour is complete. Saved predictions stay unchanged and later observations are linked separately.','一天有一条记录即计为一天，并不表示全天完整。已保存预测不会被覆盖，之后单独关联观测结果。','1件でも記録があれば1日と数えるため全時間の完全性は意味しません。保存済み予測は変更せず、後から観測結果を別に紐付けます。')}</small>
   {readiness&&<details className="prediction-readiness"><summary>{t(`내일 예상 준비: ${readiness.hours.filter(row=>row.ready).length}/24시간에 최소 자료 확보`,`Tomorrow's input readiness: ${readiness.hours.filter(row=>row.ready).length}/24 hours`,`明日预测准备：${readiness.hours.filter(row=>row.ready).length}/24小时资料就绪`,`明日の予測準備：${readiness.hours.filter(row=>row.ready).length}/24時間`)}</summary>
    <p>{t('각 시간의 시작 15분 안에 관측한 같은 요일 기록을 확인합니다. 자료 확보는 정확도 검증 완료를 뜻하지 않습니다.','Checks matching weekdays observed within the first 15 minutes of each hour. Input readiness is not validated accuracy.','检查每小时开始15分钟内的同星期观测。资料就绪不代表准确率已验证。','各時間の最初の15分以内に観測した同曜日の記録。資料の確保は精度の検証完了ではありません。')}</p>
    <ul className="prediction-hours">{readiness.hours.map(row=><li key={row.hour}><strong>{String(row.hour).padStart(2,'0')}:00</strong><span>{row.ready?t('최소 자료 확보','Minimum inputs ready','最低资料就绪','最低資料確保'):!row.compatible?t('자료 기준이 달라 비교 보류','Different source definitions','资料定义不同，暂缓比较','資料基準が異なり比較保留'):t(`${row.sampleDates.length}주 확보 · ${row.missingWeeks}주 더 필요`,`${row.sampleDates.length} weeks available · ${row.missingWeeks} more needed`,`已有${row.sampleDates.length}周 · 还需${row.missingWeeks}周`,`${row.sampleDates.length}週分確保・あと${row.missingWeeks}週必要`)}</span><small>{row.sampleDates.join(' · ')||t('해당 요일·시간 기록 없음','No matching records','无匹配记录','該当記録なし')}</small></li>)}</ul>
   </details>}
   <div className="prediction-score"><h3>{t('예측 성적표 · 최근 7일','Prediction scorecard · last 7 days','预测成绩单 · 最近7天','予測の成績表・直近7日')}</h3>
    <p>{t(`관측과 비교한 ${score.matchedHours}개 시간 · ${score.matchedDays}일`,`${score.matchedHours} matched hours across ${score.matchedDays} days`,`已比较${score.matchedHours}个时段 · ${score.matchedDays}天`,`${score.matchedHours}時間・${score.matchedDays}日分を観測と比較`)}</p>
    <p>{score.meanAbsoluteError===null?t('아직 비교할 결과가 없습니다.','No matched outcomes yet.','暂无可比较结果。','まだ比較結果がありません。'):t(`예상과 관측의 평균 차이 약 ${score.meanAbsoluteError.toLocaleString()}명`,`Mean absolute difference: about ${score.meanAbsoluteError.toLocaleString()} people`,`预测与观测平均绝对差约${score.meanAbsoluteError.toLocaleString()}人`,`予測と観測の平均絶対差は約${score.meanAbsoluteError.toLocaleString()}人`)}</p>
    <small>{t(`관측 연결 대기 ${score.pendingHours}개 시간. 관측값도 서울시 추정 인구 범위의 중간값입니다. 단순 과거 평균을 사용하는 초기 모델이며, 정확도 보증이나 매출 예측이 아닙니다.`,`${score.pendingHours} hours await observations. Observations also use Seoul's estimated population-range midpoint. This initial historical-mean model is not an accuracy guarantee or sales forecast.`,`${score.pendingHours}个时段等待观测。观测也是首尔市估计人口区间中点。初期历史平均模型，不保证准确率，也不是销售预测。`,`${score.pendingHours}時間が観測待ち。観測値もソウル市の推定人口範囲の中央値です。過去平均を使う初期モデルで、精度保証や売上予測ではありません。`)}</small>
   </div>
   <details><summary>{t('날짜별 수집 상태','Daily coverage','每日收集情况','日別の収集状況')}</summary><p>{t('관측 기록이 없는 날','Days without observations','无观测记录的日期','観測記録のない日')} · {data.coverage.missingDays.join(' · ')||'—'}</p><ul className="prediction-hours">{data.coverage.dailyHours.map(row=><li key={row.day}><strong>{row.day}</strong><span>{row.hours}/24 {t('시간에 기록 있음','hours recorded','小时有记录','時間に記録あり')}</span></li>)}</ul></details>
   <details><summary>{t('지난 예상과 실제 관측 비교','Past estimates and later observations','过去预测与后续观测对比','過去予測と後日の観測を比較')}</summary>{data.records.length?<ul className="prediction-hours">{data.records.map(row=><li key={row.targetAt}><strong>{row.targetAt.slice(5,16).replace('T',' ')}</strong><span>{t('예상','Estimate','预测','予測')} {row.predicted.toLocaleString()} · {t('관측','Observed','观测','観測')} {row.actual?.toLocaleString()??t('대기','Pending','等待','待機')}</span></li>)}</ul>:<p>{t('결과보다 먼저 저장한 예측 기록이 아직 없습니다. 정확도를 주장하지 않습니다.','No prospectively saved prediction records yet. No accuracy claim.','尚无提前保存的预测记录，不声称准确率。','結果より前に保存した予測はまだありません。精度は主張しません。')}</p>}</details>
  </section>}
  <SeoulContextCard context={summary?.areas[area]?.context} lang={lang}/>
 </section>;
}
