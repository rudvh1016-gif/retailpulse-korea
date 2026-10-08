import type { Lang } from './retailpulse-data';
import type { TopReference } from '../lib/airport-top-reference';
import { estimateBasisLine, estimateNote, splitCopy } from '../lib/airport-flight-split-copy';
import { referencePillars } from '../lib/airport-reference-pillars';
import { AirportReferencePillars } from './airport-reference-pillars';
import './airport-split-details.css';

const words = {
  scopeAll: { ko:'전체 · T1·T2', en:'All · T1·T2', zh:'全部 · T1·T2', ja:'全体 · T1·T2' },
  scopeT1: { ko:'T1 · 본관·탑승동', en:'T1 · main building and concourse', zh:'T1 · 主楼与登机楼', ja:'T1 · 本館・搭乗棟' },
  scopeConcourse: { ko:'탑승동', en:'Concourse', zh:'登机楼', ja:'搭乗棟' },
  heading: { ko: '터미널별 구역 승객 추정', en: 'Passenger estimates by terminal and zone', zh: '各航站楼分区旅客估算', ja: 'ターミナル別・区域別の旅客推定' },
  unverified: { ko: '위치 미확인 또는 건물 미정 항공편이 있어 구역별 승객 추정을 보류합니다.', en: 'Unverified gate locations or unknown buildings: passenger estimates by zone are withheld.', zh: '存在位置未确认或建筑未定航班，暂不显示分区旅客估算。', ja: '位置未確認または建物未定の便があるため、区域別の旅客推定は保留します。' },
  nationality: { ko: '실제 구역별 승객 수·승객 국적을 나타내지 않습니다.', en: 'Not actual passenger counts by zone or passenger nationalities.', zh: '不代表实际分区旅客人数或旅客国籍。', ja: '区域別の実際の旅客数や旅客の国籍を示しません。' },
  notObserved: { ko: '실제 동·서편 출국객 관측값이 아닙니다.', en: 'Not observed east/west passenger counts.', zh: '并非观测到的东、西区旅客人数。', ja: '東西別の実測旅客数ではありません。' },
  all: { ko: '전체 화면에서는 T1·T2를 각각 계산하며 합산 배분하지 않습니다.', en: 'T1 and T2 are calculated separately; no combined allocation.', zh: 'T1与T2分别计算，不合并分配。', ja: 'T1とT2を別々に計算し、合算配分しません。' },
  time: { ko: '선택한 시간대에는 공식 승객 분모가 없습니다. 하루 전체에서 확인하세요.', en: 'No official passenger denominator for this time window. Check the whole day.', zh: '所选时段没有官方旅客分母。请查看全天。', ja: '選択した時間帯には公式の旅客分母がありません。終日で確認してください。' },
  concourse: { ko: '탑승동 단독에는 공식 승객 분모가 없습니다. T1 하루 전체에서 확인하세요.', en: 'No separate official passenger denominator for the concourse. Check T1 for the whole day.', zh: '登机楼没有单独的官方旅客分母。请查看T1全天。', ja: '搭乗棟単独の公式旅客分母はありません。T1の終日で確認してください。' },
  unavailable: { ko: '선택한 날짜·범위와 일치하는 운항 자료를 확인할 수 없어 구역별 참고값을 표시하지 않습니다.', en: 'Matching flight records for the selected date and scope are unavailable; zone reference values are withheld.', zh: '无法确认与所选日期和范围一致的航班资料，暂不显示分区参考值。', ja: '選択した日付・範囲と一致する運航資料を確認できず、区域別の参考値を表示しません。' },
  GATES_PENDING: { ko: '게이트 위치 확인 전이므로 구역별 승객 참고값을 계산하지 않습니다.', en: 'Gate locations are not yet confirmed, so passenger reference values by zone are withheld.', zh: '登机口位置尚未确认，因此不计算分区旅客参考值。', ja: '搭乗口の位置が未確認のため、区域別の旅客参考値は計算しません。' },
  NO_SIDE_COMPARISON: { ko: '동·서편 게이트가 확인된 출발편이 없어 구역별 승객 참고값을 계산하지 않습니다.', en: 'No departure flight has a confirmed east or west gate, so passenger reference values by zone are withheld.', zh: '没有确认东侧或西侧登机口的出发航班，因此不计算分区旅客参考值。', ja: '東西の搭乗口が確認された出発便がないため、区域別の旅客参考値は計算しません。' },
  FORECAST_UNAVAILABLE: { ko: '이 날짜·터미널의 완전한 최신 공식 예상 승객 자료를 확인할 수 없어 구역별 참고값을 표시하지 않습니다.', en: 'A complete, current official passenger forecast for this date and terminal is unavailable; zone reference values are withheld.', zh: '无法确认该日期与航站楼完整且最新的官方旅客预测，暂不显示分区参考值。', ja: 'この日付・ターミナルの完全な最新公式旅客予想を確認できず、区域別の参考値を表示しません。' },
  SOURCE_MISMATCH: { ko: '운항 자료의 날짜·집계 범위 또는 최신성을 확인할 수 없어 구역별 참고값을 표시하지 않습니다.', en: 'Flight dates, counting scopes or freshness could not be reconciled; zone reference values are withheld.', zh: '无法核实航班日期、统计范围或时效的一致性，暂不显示分区参考值。', ja: '運航資料の日付・集計範囲・最新性を確認できず、区域別の参考値を表示しません。' },
  wholeDay: { ko: '하루 전체 보기', en: 'View whole day', zh: '查看全天', ja: '終日を見る' },
  t1Day: { ko: 'T1 하루 전체 보기', en: 'View T1 whole day', zh: '查看T1全天', ja: 'T1の終日を見る' },
} as const;

export function AirportTopReference({ lang, date, scope, wholeDay, entries, onWholeDay, onT1Day }: {
  lang: Lang; date: string; scope: 'all' | 'T1' | 'T2' | 'CONCOURSE' | undefined; wholeDay: boolean;
  entries: TopReference[] | null; onWholeDay: () => void; onT1Day: () => void;
}) {
  const reason = scope === 'CONCOURSE' ? 'concourse' : !wholeDay ? 'time' : null;
  const presentation = entries?.map(entry => ({...entry, pillars:entry.estimate ? referencePillars(entry.estimate) : null}));
  const maximum = Math.max(0,...(presentation?.flatMap(entry=>entry.pillars?.map(part=>part.rawPeople)??[])??[]));
  const ready = presentation?.some(entry=>entry.pillars);
  const partial = ready && presentation?.some(entry=>!entry.pillars);
  const scopeText = scope === 'T1' ? words.scopeT1[lang] : scope === 'T2' ? 'T2' : scope === 'CONCOURSE' ? words.scopeConcourse[lang] : words.scopeAll[lang];
  return <section className="airport-top-reference" data-testid="airport-top-reference" data-state={reason ?? (partial ? 'PARTIAL' : ready ? 'READY' : 'UNAVAILABLE')} data-scope={scope ?? 'all'}>
    <h3 data-testid="top-reference-heading">{words.heading[lang]} · {scopeText} <small>{date} KST</small></h3>
    {reason ? <p role="status">{words[reason][lang]}{' '}<button type="button" className="prep-link" onClick={reason === 'concourse' ? onT1Day : onWholeDay}>{words[reason === 'concourse' ? 't1Day' : 'wholeDay'][lang]}</button></p>
      : <>
        {scope === 'all' && <p className="prep-note">{words.all[lang]}</p>}
        {presentation?.map(({ terminal, estimate, unavailableReason, pillars }) => estimate && pillars
          ? <div className="airport-top-reference-row" data-testid={`top-reference-${terminal}`} key={terminal}>
              <p><strong>{terminal === 'T1' ? words.scopeT1[lang] : terminal}</strong></p>
              <AirportReferencePillars lang={lang} pillars={pillars} maximum={maximum}/>
              <details className="prep-evidence prep-estimate-details"><summary>{splitCopy.estimateDetails[lang]}</summary>
                <p className="prep-note">{estimateBasisLine({ terminal, ...estimate }, lang)}</p>
                <p className="prep-note">{estimateNote({ terminal, ...estimate }, lang)}</p>
              </details>
            </div>
          : <div className="airport-top-reference-row" data-testid={`top-reference-${terminal}-unavailable`} data-reason={estimate ? 'UNVERIFIED_LOCATION' : unavailableReason} key={terminal}>
              <p><strong>{terminal === 'T1' ? words.scopeT1[lang] : terminal}</strong></p>
              <p className="prep-note" role="status">{estimate ? words.unverified[lang] : words[unavailableReason ?? 'unavailable'][lang]}</p>
            </div>)}
        {!entries && <p className="prep-note" role="status">{words.unavailable[lang]}</p>}
        {ready && <p className="prep-note">{words.notObserved[lang]} {words.nationality[lang]}</p>}
      </>}
  </section>;
}
