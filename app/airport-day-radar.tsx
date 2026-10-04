'use client';

/**
 * "What is different today" and "days like today" for the business screen's
 * airport block. Loaded when the block scrolls into view (app/airport-sides.tsx).
 *
 * Reads: the date's flights through the shared loader (the departure map uses
 * the same request) and /api/live/airport-days (at most 63 stored daily
 * profiles). Everything else is computed here. The only thing kept is this
 * device's last look at the same date and terminal, for "changed since".
 */
import { useEffect, useMemo, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { useFlights } from './flights-client';
import { dailyFlightProfile, type ProfileRow } from '../lib/airport-day-profile';
import { lastSeenOf, radar, similarDays, terminalDay, type LastSeen, type TerminalDay, type ViewTerminal } from '../lib/airport-day-compare';
import { dayCopy as copy, dayEastShare, dayHourSpan, dayLabel, radarLine, similarLines, topGroups } from '../lib/airport-day-copy';

const LAST_SEEN_KEY = 'koretail-airport-radar-v1';
const LAST_SEEN_LIMIT = 12;

function readLastSeen(date: string, terminal: ViewTerminal): LastSeen | null {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) ?? '[]') as LastSeen[];
    return Array.isArray(all) ? all.find((entry) => entry.date === date && entry.terminal === terminal) ?? null : null;
  } catch { return null; }
}

function writeLastSeen(entry: LastSeen) {
  try {
    const all = (JSON.parse(localStorage.getItem(LAST_SEEN_KEY) ?? '[]') as LastSeen[]).filter((other) => !(other.date === entry.date && other.terminal === entry.terminal));
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify([entry, ...all].slice(0, LAST_SEEN_LIMIT)));
  } catch { /* a blocked storage only loses the "since last" line */ }
}

type History = { status: 'OK'; days: TerminalDay[]; stored: number } | { status: 'FAILED' };

type HistoryBody = { mode: string; history: Array<Record<ViewTerminal, TerminalDay>> };

// One /api/live/airport-days read per date for the whole page visit: the answer
// carries both terminals, so "all" (T1 and T2 blocks) must not read it twice.
// A failure is forgotten so a later open can try again.
const historyReads = new Map<string, Promise<HistoryBody | null>>();
function loadHistory(date: string): Promise<HistoryBody | null> {
  let request = historyReads.get(date);
  if (!request) {
    request = fetch(`/api/live/airport-days?date=${encodeURIComponent(date)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      .then(async (response) => {
        const body = response.ok ? await response.json() as HistoryBody : null;
        return body?.mode === 'airport-days' ? body : null;
      })
      .catch(() => null);
    historyReads.set(date, request);
    void request.then((body) => { if (!body) historyReads.delete(date); });
  }
  return request;
}

function useHistory(date: string, terminal: ViewTerminal): History | undefined {
  const [state, setState] = useState<{ key: string; value: History } | undefined>(undefined);
  const key = `${date}:${terminal}`;
  useEffect(() => {
    let live = true;
    void loadHistory(date).then((body) => {
      const value: History = body ? { status: 'OK', days: body.history.map((day) => day[terminal]), stored: body.history.length } : { status: 'FAILED' };
      if (live) setState({ key, value });
    });
    return () => { live = false; };
  }, [date, terminal, key]);
  return state && state.key === key ? state.value : undefined;
}

function kstClock(iso: string): string {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at + 9 * 3_600_000).toISOString().slice(11, 16) : '';
}

function HourBars({ lang, current, other }: { lang: Lang; current: TerminalDay; other: TerminalDay }) {
  const max = Math.max(1, ...current.hours, ...other.hours);
  const width = 480, height = 90, bar = width / 24;
  return <svg viewBox={`0 0 ${width} ${height + 16}`} width="100%" role="img" data-testid="similar-hours"
    aria-label={`${copy.today[lang]} / ${copy.thatDay[lang]}`} style={{ display: 'block', maxWidth: 520 }}>
    {current.hours.map((value, hour) => <rect key={`c${hour}`} x={hour * bar + 1} y={height - (value / max) * height} width={bar / 2 - 1} height={(value / max) * height} fill="var(--blue)"/>)}
    {other.hours.map((value, hour) => <rect key={`o${hour}`} x={hour * bar + bar / 2} y={height - (value / max) * height} width={bar / 2 - 1} height={(value / max) * height} fill="var(--muted)"/>)}
    {[0, 6, 12, 18, 23].map((hour) => <text key={hour} x={hour * bar + 2} y={height + 13} fontSize={11} fill="var(--muted)">{String(hour).padStart(2, '0')}</text>)}
  </svg>;
}

export default function DayRadarBlock({ lang, date, dayRelation, terminal, nowIso, holidays, isHoliday }: {
  lang: Lang; date: string; dayRelation: 'PAST' | 'TODAY' | 'FUTURE'; terminal: ViewTerminal; nowIso: string;
  holidays: ReadonlyArray<{ country: string; name: string }>;
  /** CN/JP official holiday status of any date, or null when the calendar does not cover it. */
  isHoliday: (day: string) => boolean | null;
}) {
  const flights = useFlights(date);
  const history = useHistory(date, terminal);
  const [open, setOpen] = useState<string | null>(null);
  const current = useMemo(() => {
    if (flights?.status !== 'OK' || flights.payload.truncated) return null;
    const rows = flights.payload.flights.filter((flight) => flight.direction === undefined || flight.direction === 'departure') as ProfileRow[];
    if (!rows.length) return null;
    return terminalDay(dailyFlightProfile(rows, date, dayRelation === 'PAST'), terminal);
  }, [flights, date, dayRelation, terminal]);
  const [lastSeen] = useState(() => (typeof window === 'undefined' ? null : readLastSeen(date, terminal)));
  useEffect(() => {
    if (current && dayRelation === 'TODAY') writeLastSeen(lastSeenOf(current, terminal, nowIso));
    // Remember only the values; re-render with the same values writes the same entry.
  }, [current, dayRelation, terminal, nowIso]);

  if (flights === undefined || history === undefined) return <p className="prep-note" data-testid="radar-loading">{copy.loading[lang]}</p>;
  if (history.status === 'FAILED' || flights.status === 'FAILED') return <p className="prep-note" data-testid="radar-failed">{copy.failed[lang]}</p>;
  if (flights.payload.truncated) return <p className="prep-note" data-testid="radar-incomplete">{copy.incomplete[lang]}</p>;
  if (!current) return <p className="prep-note" data-testid="radar-no-current">{copy.noCurrent[lang]}</p>;

  const complete = history.days.filter((day) => day.complete);
  const { items, weekdayDays } = radar({ current, history: history.days, lastSeen: lastSeen && lastSeen.checkedAt < nowIso ? lastSeen : null, terminal, holidays });
  const similar = similarDays({ current, history: history.days, isHoliday });
  const eligible = history.days.filter((day) => day.complete && day.day < current.day && day.total > 0 && day.hours.some((value) => value > 0))
    .sort((a, b) => a.day.localeCompare(b.day));
  const comparable = items.some((item) => item.kind.startsWith('WEEKDAY'));

  return <div data-testid="day-radar">
    <h3>{copy.radarTitle[lang]}</h3>
    <ol className="prep-facts" data-testid="radar-items">
      {items.map((item, index) => <li key={index} data-kind={item.kind}>{radarLine(item, terminal, lang, kstClock, current.day)}</li>)}
    </ol>
    {!weekdayDays.length && <p className="prep-note" data-testid="radar-no-history">{copy.noHistory(complete.length, lang)}</p>}
    {weekdayDays.length > 0 && !comparable && <p className="prep-note" data-testid="radar-within">{copy.withinRange(weekdayDays.length, lang)}</p>}
    <details className="prep-evidence"><summary>{copy.evidence[lang]}</summary>
      <p className="prep-note">{copy.rule[lang]}</p>
      <p className="prep-note" data-testid="radar-days">{weekdayDays.map((day) => dayLabel(day.day, lang)).join(', ') || '—'}</p>
      <p className="prep-note">{copy.basis[lang]}</p>
    </details>

    <h3 style={{ marginTop: 18 }}>{copy.similarTitle[lang]}</h3>
    <p className="prep-note" data-testid="similar-scope">{copy.similarScope(current.day, eligible[0]?.day ?? null, eligible.at(-1)?.day ?? null, eligible.length, lang)}</p>
    {!similar.length ? <p className="prep-note" data-testid="similar-none">{copy.similarNone(eligible.length, lang)}</p>
      : <ol className="prep-facts" data-testid="similar-days">{similar.map((item) => {
        const lines = similarLines(item, current, lang);
        const isOpen = open === item.day.day;
        return <li key={item.day.day} data-day={item.day.day}>
          <svg className="similar-calendar" viewBox="0 0 56 70" width="56" height="70" aria-hidden="true">
            <path d="M4 12 L45 12 L51 6 L10 6 Z" fill="#e5f5fc"/>
            <path d="M45 12 L51 6 L51 58 L45 64 Z" fill="#81b3cd"/>
            <path d="M4 12 H45 V64 H4 Z" fill="#d5ecf8"/>
            <path d="M4 12 H45 V22 H4 Z" fill="#b5d8d0"/>
            <path d="M13 5 V16 M34 5 V16" stroke="#81b3cd" strokeWidth="3"/>
            <text x="24" y="36" textAnchor="middle">{Number(item.day.day.slice(5,7))}</text>
            <text x="24" y="53" textAnchor="middle">{Number(item.day.day.slice(8,10))}</text>
          </svg>
          <strong>{copy.similarLabel[lang]}: {dayLabel(item.day.day, lang)}</strong>
          <br/>{copy.alike[lang]}: {lines.alike}
          <br/>{copy.differ[lang]}: {lines.differ}
          <br/><button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : item.day.day)} data-testid="similar-open"
            style={{ border: 0, padding: '8px 0', background: 'transparent', color: 'var(--blue)', cursor: 'pointer', font: 'inherit' }}>{copy.compareTable[lang]}</button>
          {isOpen && <div data-testid="similar-table">
            {lines.busiest && <p className="prep-note">{copy.busiest[lang]}: {lines.busiest}</p>}
            {item.missing.length > 0 && <p className="prep-note" data-testid="similar-missing">{copy.missingComparison[lang]}: {item.missing.map((name) => name === 'HOLIDAY' ? copy.holidayEvidence[lang] : copy.component[name as keyof typeof copy.component][lang]).join(', ')}</p>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr><th/><th style={{ textAlign: 'right' }}>{dayLabel(current.day, lang)}</th><th style={{ textAlign: 'right' }}>{dayLabel(item.day.day, lang)}</th></tr></thead>
              <tbody>
                <tr><th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>{copy.rows.total[lang]}</th><td style={{ textAlign: 'right' }}>{current.total}</td><td style={{ textAlign: 'right' }}>{item.day.total}</td></tr>
                <tr><th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>{copy.rows.east[lang]}</th><td style={{ textAlign: 'right' }}>{dayEastShare(current)}</td><td style={{ textAlign: 'right' }}>{item.day.sidesVersion === current.sidesVersion ? dayEastShare(item.day) : '—'}</td></tr>
                <tr><th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>{copy.rows.peak[lang]}</th><td style={{ textAlign: 'right' }}>{peakText(current, lang)}</td><td style={{ textAlign: 'right' }}>{peakText(item.day, lang)}</td></tr>
                <tr><th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>{copy.rows.groups[lang]}</th><td style={{ textAlign: 'right' }}>{topGroups(current, lang)}</td><td style={{ textAlign: 'right' }}>{topGroups(item.day, lang)}</td></tr>
              </tbody>
            </table>
            <HourBars lang={lang} current={current} other={item.day}/>
          </div>}
        </li>;
      })}</ol>}
    <details className="prep-evidence"><summary>{copy.evidence[lang]}</summary>
      <p className="prep-note">{copy.similarRule[lang]}</p>
    </details>
    <p className="prep-note">{copy.similarNote[lang]}</p>
  </div>;
}

function peakText(day: TerminalDay, lang: Lang): string {
  let best = -1, at = -1;
  day.hours.forEach((value, hour) => { if (value > best) { best = value; at = hour; } });
  return best > 0 ? dayHourSpan(at, lang) : '—';
}
