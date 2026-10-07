import type { Lang } from './retailpulse-data';
import type { TopReference } from '../lib/airport-top-reference';
import { estimateBasisLine, estimateBody, estimateNote, splitCopy } from '../lib/airport-flight-split-copy';
import './airport-split-details.css';

const words = {
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
  return <section className="airport-top-reference" data-testid="airport-top-reference" data-state={reason ?? (entries?.some((entry) => entry.estimate) ? 'READY' : 'UNAVAILABLE')}>
    <h3>{splitCopy.estimateHeading[lang]} <small>{date} KST</small></h3>
    {reason ? <p role="status">{words[reason][lang]}{' '}<button type="button" className="prep-link" onClick={reason === 'concourse' ? onT1Day : onWholeDay}>{words[reason === 'concourse' ? 't1Day' : 'wholeDay'][lang]}</button></p>
      : <>
        {scope === 'all' && <p className="prep-note">{words.all[lang]}</p>}
        {entries?.map(({ terminal, estimate, unavailableReason }) => estimate
          ? <div className="airport-top-reference-row" data-testid={`top-reference-${terminal}`} key={terminal}>
              <p><strong>{terminal} · {estimateBody({ terminal, ...estimate }, lang)}</strong></p>
              <details className="prep-evidence prep-estimate-details"><summary>{splitCopy.estimateDetails[lang]}</summary>
                <p className="prep-note">{estimateBasisLine({ terminal, ...estimate }, lang)}</p>
                <p className="prep-note">{estimateNote({ terminal, ...estimate }, lang)}</p>
              </details>
            </div>
          : <p className="prep-note" data-testid={`top-reference-${terminal}-unavailable`} data-reason={unavailableReason} key={terminal}>{terminal} · {words[unavailableReason ?? 'unavailable'][lang]}</p>)}
        {!entries && <p className="prep-note" role="status">{words.unavailable[lang]}</p>}
        {entries?.some((entry) => entry.estimate) && <p className="prep-note">{words.notObserved[lang]}</p>}
      </>}
  </section>;
}
