import {queueHeat, type QueueHeatReading} from './airport-queue-heat';

export type QueueRole = 'long' | 'middle' | 'short' | 'only' | 'same';
export const queueKey = (row: QueueHeatReading) => `${row.terminal}:${row.zone}`;

/** The displayed numeric value, never waitingCount. 60+ keeps its documented lower bound. */
export function displayedQueueMinutes(row: QueueHeatReading): number | null {
  const raw = row.waitTimeRaw?.trim();
  if (raw === '60+') return 60;
  if (raw) return /^\d+$/.test(raw) && Number.isFinite(Number(raw)) ? Number(raw) : null;
  return typeof row.waitTimeMinutes === 'number' && Number.isFinite(row.waitTimeMinutes) && row.waitTimeMinutes >= 0 ? row.waitTimeMinutes : null;
}

/**
 * Rank only fresh, comparable observations, without assuming T1 congestion categories.
 * The middle is the actual row at floor((N-1)/2), not an average; for even N this
 * is the longer-wait central row. Duplicate identities use their latest record;
 * contradictory records at the same latest timestamp are withheld from comparison.
 */
export function selectQueueRepresentatives<T extends QueueHeatReading>(rows: T[], now: number) {
  const latest = new Map<string, {row:T; ambiguous:boolean}>();
  for (const row of rows) {
    const key = queueKey(row), previous = latest.get(key);
    const time = Date.parse(row.observedAt), oldTime = previous ? Date.parse(previous.row.observedAt) : -Infinity;
    if (!previous || (Number.isFinite(time) && (!Number.isFinite(oldTime) || time > oldTime))) {
      latest.set(key, {row, ambiguous:false});
    } else if (time === oldTime && previous &&
      (row.freshness !== previous.row.freshness || row.waitTimeRaw !== previous.row.waitTimeRaw || row.waitTimeMinutes !== previous.row.waitTimeMinutes)) {
      previous.ambiguous = true;
    }
  }
  const candidates = [...latest.values()].flatMap(({row, ambiguous}) => {
    const state = queueHeat(row, now).state, minutes = displayedQueueMinutes(row);
    return !ambiguous && row.terminal && row.zone && minutes !== null && (state === 'current' || state === 'unverified' || state === 'zero')
      ? [{row, minutes}] : [];
  }).sort((a,b) => b.minutes-a.minutes || (queueKey(a.row)<queueKey(b.row)?-1:queueKey(a.row)>queueKey(b.row)?1:0));
  const count = candidates.length;
  const equal = count > 1 && candidates.every(item => item.minutes === candidates[0].minutes && (item.row.waitTimeRaw === '60+') === (candidates[0].row.waitTimeRaw === '60+'));
  const positions = count >= 3 ? [0, Math.floor((count-1)/2), count-1] : count === 2 ? [0,1] : count === 1 ? [0] : [];
  const items = positions.map((position,index) => {
    const candidate = candidates[position];
    const role:QueueRole = equal ? 'same' : count === 1 ? 'only' : index === 0 ? 'long' : position === count-1 ? 'short' : 'middle';
    return {...candidate, role, rank:position+1, tied:candidates.filter(item=>item.minutes===candidate.minutes).length>1};
  });
  return {items, count, equal, hasLowerBound:candidates.some(item=>item.row.waitTimeRaw==='60+')};
}

const copy = {
  ko: {long:'대기 긴 곳', middle:'중간', short:'짧은 곳', only:'확인된 출국장', same:'동일 대기시간', tie:'동률', collapse:'대표 출국장 보기', zero:'0분 표시 · 운영 여부 확인 필요', none:'비교할 최신 대기시간이 없습니다. 전체 목록에서 관측값을 확인하세요.', basis:'최근 관측된 대기시간 순으로 비교합니다. 중간은 중앙 순위이며, 중앙에 두 곳이 있으면 대기가 긴 곳입니다. 동률은 출국장 이름순입니다.', equal:'비교 가능한 출국장의 대기시간 표시가 모두 같습니다.', few:'비교 가능한 출국장만 표시합니다.', lower:'60+는 표시 하한 60분을 기준으로 비교하며 실제 대기시간의 상한은 알 수 없습니다.'},
  en: {long:'Longest wait', middle:'Middle', short:'Shortest wait', only:'Available reading', same:'Same wait', tie:'Tied', collapse:'Show representative halls', zero:'0 min shown · Check operating status', none:'No fresh comparable waits. Open all halls to inspect observations.', basis:'Compared by fresh wait times. Middle is the central rank, using the longer-wait central row for even counts. Ties use hall-name order.', equal:'All comparable halls show the same wait.', few:'Only halls with comparable observations are shown.', lower:'60+ is sorted by its 60-minute lower bound; the actual upper bound is unknown.'},
  zh: {long:'等候较长', middle:'中间', short:'等候较短', only:'已确认观测', same:'等候时间相同', tie:'并列', collapse:'查看代表出境区', zero:'显示0分钟 · 请确认是否运营', none:'暂无可比较的最新等候时间，请展开全部出境区查看观测值。', basis:'按最新等候时间排序。中间为中央名次，偶数时取等候较长的一项；并列按出境区名称排序。', equal:'可比较出境区显示的等候时间均相同。', few:'仅显示有可比较观测值的出境区。', lower:'60+按下限60分钟排序，实际等候时间上限未知。'},
  ja: {long:'待ち長め', middle:'中間', short:'待ち短め', only:'確認できる観測', same:'同じ待ち時間', tie:'同順位', collapse:'代表出国場を見る', zero:'0分表示 · 営業状況の確認が必要', none:'比較できる新しい待ち時間がありません。全出国場で観測値を確認できます。', basis:'新しい待ち時間順で比較します。中間は中央順位、偶数なら待ちが長い側です。同順位は出国場名順です。', equal:'比較できる出国場の待ち時間表示はすべて同じです。', few:'比較できる観測値がある出国場のみ表示します。', lower:'60+は下限60分で並べます。実際の待ち時間の上限は不明です。'},
};
export function queueRepresentativeCopy(lang: string) { return copy[lang as keyof typeof copy] ?? copy.en; }
