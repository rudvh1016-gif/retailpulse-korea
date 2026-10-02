'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Lang } from './retailpulse-data';
import type { LiveSummary } from './live-signals';
import type { AirportSidesBlock as SidesBlock } from '../lib/airport-sides-summary';
import type { HallBand, HallSideDay, SideCounts } from '../lib/airport-sides';
import type { AirportSide, BusinessHours, PrepTerminal } from '../lib/business-prep';
import { prepWindow } from '../lib/business-prep';
import { prepTime } from '../lib/business-prep-copy';
import { OFFICIAL_LINKS, count, hourSpan, sidesCopy as copy } from '../lib/airport-sides-copy';
import { splitFromSummary } from '../lib/airport-flight-split';
import { estimateBasisLine, estimateBody, estimateNote, flightsBody, hourBody, sharesBody, splitCopy } from '../lib/airport-flight-split-copy';

type Side = AirportSide | null;

// The map's code and gate positions load only when a reader opens it.
const DepartureMap = lazy(() => import('./airport-departure-map'));
const DayRadar = lazy(() => import('./airport-day-radar'));

type HolidayRef = ReadonlyArray<{ country: string; name: string }>;

/** Loads the day comparison once the block is on screen, so a visit that never reaches it reads nothing. */
export function DayRadarSection({ lang, summary, terminal, nowIso, holidays, isHoliday }: {
  lang: Lang; summary: LiveSummary; terminal: PrepTerminal; nowIso: string; holidays: HolidayRef; isHoliday: (day: string) => boolean | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setVisible(true); }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  if (summary.dayRelation === 'FUTURE') return null;
  return <div className="prep-block" ref={ref} data-testid="day-radar-section">
    {visible ? <Suspense fallback={<p className="prep-note">{copy.radarLoading[lang]}</p>}>
      <DayRadar lang={lang} date={summary.serviceDateKst} dayRelation={summary.dayRelation} terminal={terminal} nowIso={nowIso} holidays={holidays} isHoliday={isHoliday}/>
    </Suspense> : <p className="prep-note">{copy.radarLoading[lang]}</p>}
  </div>;
}

/** `defaultOpen` is for the airport page, where the map is the point of the section; inside the store briefing it stays closed until asked for. */
export function DepartureMapSection({ lang, summary, terminal, nowIso, holidays, defaultOpen = false }: { lang: Lang; summary: LiveSummary; terminal: PrepTerminal; nowIso: string; holidays: ReadonlyArray<{ country: string; name: string }>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <details open={open} className="prep-block prep-evidence" data-testid="departure-map-section" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary><h3 style={{ margin: 0 }}>{copy.mapTitle[lang]}</h3></summary>
    {open && <Suspense fallback={<p className="prep-note">{copy.mapLoading[lang]}</p>}>
      <DepartureMap lang={lang} date={summary.serviceDateKst} todayKst={summary.todayKst} dayRelation={summary.dayRelation} terminal={terminal} nowIso={nowIso} holidays={holidays}/>
    </Suspense>}
  </details>;
}
const hourOf = (iso: string) => Number(iso.slice(11, 13));

/** The chosen side's value in a band, or the terminal total when no side is chosen. */
function bandValue(band: HallBand, side: Side): number | null {
  return side === 'EAST' ? band.east : side === 'WEST' ? band.west : band.total;
}

/** Bands wholly inside the hours, and the hours cut by opening or closing (never split). */
export function hoursSplit(bands: readonly HallBand[], serviceDate: string, hours: BusinessHours | null) {
  const window = prepWindow(serviceDate, hours);
  const start = Date.parse(window.startAt), end = Date.parse(window.endAt);
  const inside: HallBand[] = [], boundary: HallBand[] = [];
  for (const band of bands) {
    const bandStart = Date.parse(band.startAt), bandEnd = Date.parse(band.endAt);
    if (bandEnd <= start || bandStart >= end) continue;
    (bandStart >= start && bandEnd <= end ? inside : boundary).push(band);
  }
  return { inside, boundary };
}

function HallDay({ lang, day, side, other, serviceDate, hours, nowIso, today }: {
  lang: Lang; day: HallSideDay; side: Side; other: HallSideDay; serviceDate: string; hours: BusinessHours | null; nowIso: string; today: boolean;
}) {
  if (!day.bands.length) return <p className="prep-note" data-testid="halls-empty">{copy.noHalls[lang]}</p>;
  const totalLine = (value: HallSideDay) => value.day
    ? `${count(value.day.total, lang)}${copy.people[lang]} (${copy.wholeDay[lang]})`
    : `${count(value.confirmed.total, lang)}${copy.people[lang]} (${copy.confirmedOnly[lang]} ${value.confirmed.bands}/24 ${copy.hoursOf[lang]})`;
  const sideLine = (value: HallSideDay) => {
    const sums = value.day ?? value.confirmed;
    return `${copy.side.EAST[lang]} ${count(sums.east, lang)}${copy.people[lang]} · ${copy.side.WEST[lang]} ${count(sums.west, lang)}${copy.people[lang]}`;
  };
  const { inside, boundary } = hoursSplit(day.bands, serviceDate, hours);
  const insideValues = inside.map((band) => bandValue(band, side));
  const insideTotal = insideValues.every((value) => value !== null) && inside.length ? insideValues.reduce((sum: number, value) => sum + Number(value), 0) : null;
  const now = Date.parse(nowIso);
  const upcoming = today ? day.bands.filter((band) => Date.parse(band.endAt) > now) : day.bands;
  const bandLine = (band: HallBand) => `${hourSpan(hourOf(band.startAt), lang)} · ${band.east !== null ? `${copy.side.EAST[lang]} ${count(band.east, lang)} · ${copy.side.WEST[lang]} ${count(Number(band.west), lang)} · ` : ''}${copy.total[lang]} ${band.total === null ? '—' : count(band.total, lang)}`;
  return <>
    <p className="prep-note" data-testid="halls-compare">{copy.sideCompare[lang]}: {day.terminal} {totalLine(day)} · {other.terminal} {totalLine(other)}</p>
    <p data-testid="halls-sides"><strong>{day.terminal}</strong> {sideLine(day)} <span className="prep-note">({copy.expected[lang]})</span></p>
    {hours && <p data-testid="halls-hours">{copy.yourHours[lang]}: {insideTotal === null ? '—' : `${count(insideTotal, lang)}${copy.people[lang]}`}
      {boundary.length > 0 && <span className="prep-note"> · {copy.boundary[lang]} {boundary.map((band) => `${hourSpan(hourOf(band.startAt), lang)} ${bandValue(band, side) === null ? '—' : count(Number(bandValue(band, side)), lang)}`).join(', ')}. {copy.yourHoursBoundary[lang]}</span>}
    </p>}
    <ul className="prep-side-hours" data-testid="halls-upcoming">{upcoming.slice(0, 6).map((band) => <li key={band.startAt}>{bandLine(band)}</li>)}</ul>
    <details className="prep-evidence"><summary>{copy.showAll[lang]}</summary>
      <ul className="prep-side-hours" data-testid="halls-all">{day.bands.map((band) => <li key={band.startAt}>{bandLine(band)}</li>)}</ul>
    </details>
    {day.retrievedAt && <p className="prep-note">{copy.collected[lang]} {prepTime(day.retrievedAt, serviceDate, lang)}</p>}
  </>;
}

const countsLine = (counts: SideCounts, lang: Lang) =>
  (['EAST', 'WEST', 'CENTER', 'UNVERIFIED'] as const).map((key) => `${copy.side[key][lang]} ${counts[key]}${copy.flights[lang]}`).join(' · ');

const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * East and west departures of the chosen terminal, side by side, first in the
 * block. Flights are counted by evidenced gate side; the person figures are a
 * reference split of the terminal-wide expectation, not the hall figures.
 */
export function FlightSplitCard({ lang, summary, sides, terminal, nowIso }: { lang: Lang; summary: LiveSummary; sides: SidesBlock; terminal: PrepTerminal; nowIso: string }) {
  const result = splitFromSummary(summary, sides, terminal, nowIso);
  if (result.status !== 'OK') return <div className="prep-block av-split" data-testid="flight-split" data-state={result.status}><p className="prep-note">{splitCopy.unavailable[result.status][lang]}</p></div>;
  const s = result.split;
  const today = kstDay(Date.parse(nowIso));
  const when = summary.serviceDateKst === today ? 'TODAY' : summary.serviceDateKst === kstDay(Date.parse(nowIso) + 86_400_000) ? 'TOMORROW' : 'DATE';
  const people = (value: number) => `${count(value, lang)}${copy.people[lang]}`;
  const unit = copy.flights[lang];
  const estimate = s.expected && s.eastPct !== null ? s.expected : null;
  // The two sides as the figure: each side's flights large, its share, and the
  // reference estimate in people under it; the bar between them is the split
  // of confirmed flights only, with a surface gap so the two fills never touch.
  const side = (key: 'EAST' | 'WEST') => {
    const flights = key === 'EAST' ? s.east : s.west;
    const pct = key === 'EAST' ? s.eastPct : s.westPct;
    const part = estimate ? (key === 'EAST' ? estimate.east : estimate.west) : null;
    return <div className={`av-split-side ${key.toLowerCase()}`} data-side={key}>
      <span className="av-split-label"><i aria-hidden="true"/>{copy.side[key][lang]}</span>
      <strong className="av-split-num">{count(flights, lang)}<small>{unit.trim()}</small></strong>
      {pct !== null && <span className="av-split-pct">{copy.side[key][lang]} {pct}%</span>}
      {part && <span className="av-split-people">{copy.expected[lang]} {people(part.people)}</span>}
    </div>;
  };
  return <div className="prep-block av-split" data-testid="flight-split" data-state="OK" data-larger={s.larger ?? 'NONE'}>
    <h3>{splitCopy.heading(terminal, when, lang)}</h3>
    <p data-testid="split-flights" className="av-split-lead"><strong>{flightsBody(s, lang)}</strong></p>
    <div className="av-split-figure">
      {side('EAST')}
      {side('WEST')}
      {s.eastPct !== null && <div className="av-split-bar" role="img" aria-label={`${copy.side.EAST[lang]} ${s.eastPct}% ${copy.side.WEST[lang]} ${s.westPct}%`}>
        <span className="east" style={{ width: `${s.eastPct}%` }}/><span className="west" style={{ width: `${s.westPct}%` }}/>
      </div>}
      {(s.unverified > 0 || s.center > 0) && <p className="av-split-rest">
        {s.center > 0 && <span><i className="centre" aria-hidden="true"/>{copy.side.CENTER[lang]} {count(s.center, lang)}{unit}{estimate ? ` · ${people(estimate.center.people)}` : ''}</span>}
        {s.unverified > 0 && <span><i className="unverified" aria-hidden="true"/>{copy.side.UNVERIFIED[lang]} {count(s.unverified, lang)}{unit}{s.unverifiedPct !== null ? ` · ${s.unverifiedPct}%` : ''}{estimate ? ` · ${people(estimate.unverified.people)}` : ''}</span>}
      </p>}
    </div>
    <p className="prep-note" data-testid="split-shares">{sharesBody(s, lang)}</p>
    <h4 className="av-split-sub">{splitCopy.estimateHeading[lang]}</h4>
    {estimate
      ? <>
        <p data-testid="split-estimate" className="av-split-estimate"><strong>{estimateBody({ terminal, ...estimate }, lang)}</strong></p>
        <p className="prep-note" data-testid="split-estimate-basis">{estimateBasisLine({ terminal, ...estimate }, lang)}</p>
        <p className="prep-note" data-testid="split-note">{estimateNote({ terminal, ...estimate }, lang)}</p>
      </>
      : <p className="prep-note" data-testid="split-no-estimate">{(s.eastPct === null ? splitCopy.noConfirmedEstimate : splitCopy.noEstimate)[lang]}</p>}
  </div>;
}

export function AirportSidesBlock({ lang, summary, terminal, side, hours, nowIso, holidays = [], isHoliday = () => null }: {
  lang: Lang; summary: LiveSummary; terminal: PrepTerminal; side: Side; hours: BusinessHours | null; nowIso: string;
  holidays?: ReadonlyArray<{ country: string; name: string }>;
  isHoliday?: (day: string) => boolean | null;
}) {
  const sides = (summary.airport as LiveSummary['airport'] & { sides?: SidesBlock }).sides;
  if (!sides) return null;
  const serviceDate = summary.serviceDateKst;
  const today = summary.dayRelation === 'TODAY';
  const gates = sides.gates;
  const now = Date.parse(nowIso);
  const nowHour = today ? Number(new Date(now + 9 * 3_600_000).toISOString().slice(11, 13)) : -1;
  const hourRows = (gates?.byHour ?? []).filter((row) => row.byArea[terminal].total > 0);
  const flightSplitHours = (() => {
    const result = splitFromSummary(summary, sides, terminal, nowIso);
    return result.status === 'OK' ? result.split.hours.map((row) => [row.hour, row] as const) : [];
  })();
  const upcomingHours = today ? hourRows.filter((row) => row.hour >= nowHour) : hourRows;
  const splitHours = new Map(flightSplitHours);
  const splitStatus = splitFromSummary(summary, sides, terminal, nowIso).status;
  const hourLine = (row: (typeof hourRows)[number]) => {
    const hour = splitHours.get(row.hour);
    return hour ? hourBody(hour, lang) : `${hourSpan(row.hour, lang)} · ${copy.total[lang]} ${row.byArea[terminal].total}${copy.flights[lang]}`;
  };
  return <div className="prep-block prep-sides" data-testid="airport-sides" data-side={side ?? 'ALL'}>
    <FlightSplitCard lang={lang} summary={summary} sides={sides} terminal={terminal} nowIso={nowIso}/>
    <DepartureMapSection lang={lang} summary={summary} terminal={terminal} nowIso={nowIso} holidays={holidays}/>
    <DayRadarSection lang={lang} summary={summary} terminal={terminal} nowIso={nowIso} holidays={holidays} isHoliday={isHoliday}/>
    <p className="prep-note" data-testid="sides-notice">{copy.notice[lang]}</p>
    <h3>{copy.hallTitle[lang]}</h3>
    {sides.halls
      ? <HallDay lang={lang} day={sides.halls[terminal]} other={sides.halls[terminal === 'T1' ? 'T2' : 'T1']} side={side} serviceDate={serviceDate} hours={hours} nowIso={nowIso} today={today}/>
      : <p className="prep-note" data-testid="halls-withheld">{copy.withheld[lang]} <a href="https://www.airport.kr/ap_ko/883/subview.do" target="_blank" rel="noopener noreferrer">{copy.officialPage[lang]}</a></p>}
    <h3>{copy.gateTitle[lang]}</h3>
    {gates && splitStatus === 'STALE' ? <>
      {/* Old flight records are not shown as counts anywhere in the block; only when they were collected. */}
      <p className="prep-note" data-testid="gates-stale">{splitCopy.unavailable.STALE[lang]}</p>
      {gates.retrievedAt && <p className="prep-note" data-testid="gates-basis">{sides.gateBasis === 'OFFICIAL_DEPARTURE_SCHEDULE' ? copy.schedule[lang] : copy.collected[lang]} {prepTime(gates.retrievedAt, serviceDate, lang)}</p>}
    </> : gates ? <>
      <p data-testid="gates-areas">{(['T1', 'T2', 'CONCOURSE', 'UNKNOWN'] as const).map((area) => `${copy.area[area][lang]} ${gates.byArea[area].total}${copy.flights[lang]}`).join(' · ')}</p>
      <p data-testid="gates-sides"><strong>{copy.area[terminal][lang]}</strong> {countsLine(gates.byArea[terminal], lang)}</p>
      {(() => {
        const counts = gates.byArea[terminal];
        const reasons = gates.unverifiedByArea?.[terminal];
        const verified = counts.total - counts.UNVERIFIED;
        return <>
          <p className="prep-note" data-testid="gates-coverage">{copy.coverage[lang]} {verified}/{counts.total}{copy.flights[lang]}{counts.total ? ` (${Math.round((verified / counts.total) * 100)}%)` : ''}
            {reasons && counts.UNVERIFIED > 0 && <> · {copy.side.UNVERIFIED[lang]} {counts.UNVERIFIED}{copy.flights[lang]}: {(['NO_GATE', 'NOT_IN_TABLE', 'CONFLICT', 'NO_TERMINAL'] as const).filter((key) => reasons[key] > 0).map((key) => `${copy.reason[key][lang]} ${reasons[key]}`).join(' · ')}</>}
          </p>
          {counts.UNVERIFIED > 0 && <p className="prep-note" data-testid="gates-partial">{copy.sideCountsNote[lang]}</p>}
        </>;
      })()}
      {gates.cancelled > 0 && <p className="prep-note">{copy.cancelled[lang]} ({gates.cancelled}{copy.flights[lang]})</p>}
      <p className="prep-note">{splitCopy.perHour[lang]} · {copy.scheduledHour[lang]}</p>
      <ul className="prep-side-hours" data-testid="gates-upcoming">{upcomingHours.slice(0, 6).map((row) => <li key={row.hour}>{hourLine(row)}</li>)}</ul>
      <details className="prep-evidence"><summary>{copy.showAll[lang]}</summary>
        <ul className="prep-side-hours" data-testid="gates-all">{hourRows.map((row) => <li key={row.hour}>{hourLine(row)}</li>)}</ul>
      </details>
      {gates.retrievedAt && <p className="prep-note" data-testid="gates-basis">{sides.gateBasis === 'OFFICIAL_DEPARTURE_SCHEDULE' ? copy.schedule[lang] : copy.collected[lang]} {prepTime(gates.retrievedAt, serviceDate, lang)}</p>}
    </> : <p className="prep-note" data-testid="gates-unavailable">{sides.gatesUnavailable === 'CAPPED' ? copy.capped[lang] : copy.noFlights[lang]}</p>}
    <p className="prep-note">{copy.passengerPerGate[lang]}</p>
    <details className="prep-evidence" data-testid="sides-basis"><summary>{copy.basisTitle[lang]}</summary>
      <p>{copy.basisHalls[lang]}</p>
      <p>{copy.basisGates[lang]}</p>
      <p>{copy.basisEstimate[lang]}</p>
      <p>{copy.basisLinks[lang]}: {OFFICIAL_LINKS.map((link, index) => <span key={link.href}>{index ? ' · ' : ''}<a href={link.href} target="_blank" rel="noopener noreferrer">{link.label[lang]}</a></span>)}</p>
    </details>
  </div>;
}
