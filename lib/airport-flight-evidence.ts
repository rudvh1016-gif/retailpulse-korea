import { mapCopy } from './airport-departure-map-copy';
import { kstDayOf } from './kst';
type Lang = 'ko' | 'en' | 'zh' | 'ja';
export interface AirportFlightEvidence {
  date: string;
  today: boolean;
  basis?: string;
  retrievedAt?: string | null;
}
/** The model's own source and timestamp, never a summary from another date. */
export function airportFlightEvidence(source: AirportFlightEvidence, lang: Lang): string {
  const schedule = source.basis === 'OFFICIAL_DEPARTURE_SCHEDULE';
  const basis = schedule ? mapCopy.basisSchedule[lang] : source.basis === 'COLLECTED_FLIGHT_RECORDS' ? mapCopy.basisCollected[lang]
    : { ko:'출처 미확인', en:'Source unverified', zh:'来源未确认', ja:'出典未確認' }[lang];
  const waiting = source.today && schedule ? { ko:'오늘 운항 기록 수집 대기', en:'Today’s flight record collection pending', zh:'今日航班记录待采集', ja:'本日の運航記録の収集待ち' }[lang] : '';
  const stamp = source.retrievedAt && Number.isFinite(Date.parse(source.retrievedAt)) ? source.retrievedAt : null;
  const old = source.today && !schedule && stamp && kstDayOf(stamp) !== source.date
    ? { ko:'오늘 수집 전', en:'Not collected today', zh:'今日尚未采集', ja:'本日未収集' }[lang] : '';
  const clock = stamp ? new Date(Date.parse(stamp) + 9 * 3_600_000).toISOString().slice(0,16).replace('T',' ') + ' KST'
    : { ko:'수집 시각 미확인', en:'Collection time unverified', zh:'采集时间未确认', ja:'収集時刻未確認' }[lang];
  return [source.date + ' KST', waiting || old, basis, stamp ? mapCopy.collected[lang] + ' ' + clock : clock].filter(Boolean).join(' · ');
}
