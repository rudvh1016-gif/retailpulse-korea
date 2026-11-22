import { checkpointLayout } from '../airport-checkpoint-layout';
import { queueHeat, type QueueHeatReading } from '../airport-queue-heat';
import { friendlyCheckpointName } from '../airport-today-summary';
import { kstDayOf, shiftKstDay } from '../kst';
import type { PersonalState } from './model';

const MAX_AGE = 20 * 60_000;

export function activeDepartureShift(state: PersonalState, now: number) {
  const today = kstDayOf(new Date(now).toISOString());
  for (const date of [today, shiftKstDay(today, -1)]) {
    const assignment = state.assignments.find(item => item.date === date);
    const pattern = state.patterns.find(item => item.id === assignment?.patternId);
    if (!pattern) continue;
    const start = Date.parse(`${date}T${pattern.open}:00+09:00`);
    let end = Date.parse(`${date}T${pattern.close}:00+09:00`);
    if (end <= start) end += 86_400_000;
    if (start <= now && now < end) return { date, pattern, start, end };
  }
  return null;
}

type AlertRow = QueueHeatReading & { retrievedAt: string };
type Summary = { mode?: unknown; dayRelation?: unknown; airport?: { congestion?: AlertRow[] } };
export function departureAlert(summary: Summary, state: PersonalState, now: number) {
  const threshold = state.notificationPreferences.departureWaitMinutes;
  const shift = activeDepartureShift(state, now);
  const rows = summary.airport?.congestion;
  if (!threshold || !shift || summary.mode !== 'live-summary' || summary.dayRelation !== 'TODAY' ||
    !Array.isArray(rows) || rows.length > 24 || rows.some(row => !row || typeof row.zone !== 'string' ||
      typeof row.observedAt !== 'string' || (row.waitTimeRaw != null && typeof row.waitTimeRaw !== 'string'))) return null;

  const { terminal, side } = shift.pattern;
  const candidates = checkpointLayout(terminal, rows).flat().flatMap(({ key, row }) => {
    if (!row || row.collectionStatus !== 'LIVE' || queueHeat(row, now).state !== 'current') return [];
    if (terminal === 'T1' && side && !key.endsWith(side === 'EAST' ? 'E' : 'W')) return [];
    const observed = Date.parse(row.observedAt), retrieved = Date.parse(row.retrievedAt);
    if (!(shift.start <= observed && observed <= retrieved && retrieved <= now && now - observed <= MAX_AGE)) return [];
    const raw = row.waitTimeRaw?.trim() ?? '';
    const minutes = raw === '60+' ? 60 : row.waitTimeMinutes;
    if (minutes == null || !Number.isSafeInteger(minutes) || minutes < threshold ||
      (raw === '60+' && row.waitTimeMinutes !== null && row.waitTimeMinutes !== 60) ||
      (raw && raw !== '60+' && (!/^\d+$/.test(raw) || Number(raw) !== minutes))) return [];
    return [{ zone: friendlyCheckpointName(row.zone, 'ko'), minutes, lowerBound: raw === '60+' }];
  });
  const peak = candidates.sort((a, b) => b.minutes - a.minutes || Number(b.lowerBound) - Number(a.lowerBound))[0];
  if (!peak) return null;
  return { ...peak, terminal, shiftKey: shift.date };
}
