import type { Lang } from './retailpulse-data';
import type { TopReference } from '../lib/airport-top-reference';
import { estimateBasisLine, estimateBody, splitCopy } from '../lib/airport-flight-split-copy';
import './airport-split-details.css';

const words = {
  all: { ko: '전체 화면에서는 T1·T2를 각각 계산하며 합산 배분하지 않습니다.', en: 'T1 and T2 are calculated separately; no combined allocation.', zh: 'T1与T2分别计算，不合并分配。', ja: 'T1とT2を別々に計算し、合算配分しません。' },
  time: { ko: '선택한 시간대에는 공식 승객 분모가 없습니다. 하루 전체에서 확인하세요.', en: 'No official passenger denominator for this time window. Check the whole day.', zh: '所选时段没有官方旅客分母。请查看全天。', ja: '選択した時間帯には公式の旅客分母がありません。終日で確認してください。' },
  concourse: { ko: '탑승동 단독에는 공식 승객 분모가 없습니다. T1 하루 전체에서 확인하세요.', en: 'No separate official passenger denominator for the concourse. Check T1 for the whole day.', zh: '登机楼没有单独的官方旅客分母。请查看T1全天。', ja: '搭乗棟単独の公式旅客分母はありません。T1の終日で確認してください。' },
  unavailable: { ko: '같은 날짜·범위의 항공편과 공식 예상승객이 확인되지 않아 참고값을 표시하지 않습니다.', en: 'The flights and official forecast could not be verified for the same date and scope.', zh: '无法核实同一日期与范围的航班及官方预测，暂不显示参考值。', ja: '同じ日付・範囲の便数と公式予想を確認できず、参考値を表示しません。' },
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
        {entries?.map(({ terminal, estimate }) => estimate
          ? <div className="airport-top-reference-row" data-testid={`top-reference-${terminal}`} key={terminal}>
              <p><strong>{terminal} · {estimateBody({ terminal, ...estimate }, lang)}</strong></p>
            </div>
          : <p className="prep-note" data-testid={`top-reference-${terminal}-unavailable`} key={terminal}>{terminal} · {words.unavailable[lang]}</p>)}
        {!entries && <p className="prep-note" role="status">{words.unavailable[lang]}</p>}
      </>}
  </section>;
}

/** Rendered inside the comparison's single disclosure, beside the country basis. */
export function AirportReferenceNotes({ lang, scope, wholeDay, entries }: {
  lang: Lang; scope: 'all' | 'T1' | 'T2' | 'CONCOURSE' | undefined; wholeDay: boolean; entries: TopReference[] | null;
}) {
  if (!wholeDay || scope === 'CONCOURSE' || !entries?.some((entry) => entry.estimate)) return null;
  return <>
    <p className="prep-note">{{
      ko: '공식 예상 출국객 수를 구역별 항공편 비율로 나눈 참고값입니다. 실제 구역별 출국객 수와 다를 수 있습니다. 편당 승객 수가 같다고 가정하며 백 명 단위로 반올림합니다.',
      en: 'The official departure forecast is split by each zone’s share of flights. This reference can differ from actual zone passenger counts. It assumes equal passengers per flight and rounds to the nearest hundred.',
      zh: '按各区航班比例分配官方预计出境人数，仅供参考，可能与各区实际人数不同。假设每班旅客数相同，按百人取整。',
      ja: '公式の出国予想客数をエリア別の便数比率で配分した参考値です。実際のエリア別人数とは異なる場合があります。1便あたりの旅客数を同じと仮定し、百人単位に四捨五入します。',
    }[lang]}</p>
    {scope === 'all' && <p className="prep-note">{words.all[lang]}</p>}
    {entries.map(({ terminal, estimate }) => estimate && <p className="prep-note" key={terminal}>{estimateBasisLine({ terminal, ...estimate }, lang)}</p>)}
    {entries.some(({ estimate }) => (estimate?.concourse?.flights ?? 0) > 0) && <p className="prep-note">{splitCopy.concourseNote[lang]}</p>}
  </>;
}
