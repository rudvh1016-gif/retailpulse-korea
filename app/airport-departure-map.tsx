'use client';

/**
 * The airport departure map (loaded only when a reader opens it; see
 * app/airport-sides.tsx). It reads the same /api/live/flights rows as the
 * flight board, once per date, and computes everything on the device: moving
 * the time or the destination filter never asks the server again.
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useFlights } from './flights-client';
import type { Lang } from './retailpulse-data';
import { shiftKstDay } from '../lib/kst';
import {
  buildingsOf, customWindow, departureMap, minuteOfDay, presetWindow,
  type DepartureMap, type MapBuilding, type MapFlight, type MapTerminal, type MapWindow, type WindowPreset,
} from '../lib/airport-departure-map';
import { flightLine, groupShare, statusText, leadLine, mapCopy as copy, mapShareText, windowCountsLine, windowText } from '../lib/airport-departure-map-copy';
import type { DestinationGroup } from '../lib/airport-destinations';

/** "14:05" in KST, with the date in front when it is not the service date. */
function kstClock(iso: string, date: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const kst = new Date(at + 9 * 3_600_000).toISOString();
  return `${kst.slice(0, 10) === date ? '' : `${kst.slice(5, 10)} `}${kst.slice(11, 16)} KST`;
}

/** A spine through one side's gates in gate-number order (gates are numbered along each pier), so the pier reads as a building and not as loose dots. */
function spine(points: Array<{ x: number; y: number; gate: string }>): string {
  if (points.length < 2) return '';
  const sorted = [...points].sort((a, b) => Number(a.gate) - Number(b.gate));
  return sorted.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
}

function BuildingMap({ lang, building, map, flights, selected, onSelect }: {
  lang: Lang; building: MapBuilding; map: DepartureMap; flights: readonly MapFlight[]; selected: string | null; onSelect: (key: string | null) => void;
}) {
  const gates = map.gates.filter((gate) => gate.building === building);
  if (!gates.length) return null;
  const counts = new Map<string, number>();
  for (const flight of flights) if (flight.building === building && flight.position && flight.gate) counts.set(flight.gate, (counts.get(flight.gate) ?? 0) + 1);
  const pad = 48;
  const maxX = Math.max(...gates.map((gate) => gate.x)), maxY = Math.max(...gates.map((gate) => gate.y));
  const width = maxX + pad * 2;
  // A strip above the gates for the two side labels, so no gate sits under them.
  const zoneLabel = (width / 100) * 4, strip = zoneLabel * 2.3;
  const height = maxY + pad * 2 + strip;
  const key = (gate: string) => `${building}:${gate}`;
  const activate = (gate: string) => onSelect(selected === key(gate) ? null : key(gate));
  const onKey = (event: KeyboardEvent, gate: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(gate); }
  };
  const unitR = width / 100;
  const place = (gate: { x: number; y: number }) => ({ cx: gate.x + pad, cy: height - (gate.y + pad) });
  // Selective labels: only the busiest gates carry their count; every gate
  // still answers on hover, focus and in its accessible name.
  const busiest = new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([gate]) => gate));
  const unitWord = lang === 'en' ? ' flights' : lang === 'ko' ? '편' : lang === 'zh' ? '班' : '便';
  // The west and east halves of the building as two tinted zones, split where
  // the side table splits them (the midpoint rule in config/airport-sides):
  // every west gate lies left of the boundary, every east gate right of it,
  // and the centre gates sit in the band between. The zones are drawn from the
  // gates' own positions, never from a guessed line.
  const xs = (side: 'EAST' | 'WEST' | 'CENTER') => gates.filter((gate) => gate.side === side).map((gate) => place(gate).cx);
  const west = xs('WEST'), east = xs('EAST'), centre = xs('CENTER');
  const westEdge = west.length ? Math.max(...west) : null, eastEdge = east.length ? Math.min(...east) : null;
  const centreLo = centre.length ? Math.min(...centre) : null, centreHi = centre.length ? Math.max(...centre) : null;
  const gap = unitR * 2.2;
  const westEnd = westEdge === null ? 0 : centreLo !== null && centreLo > westEdge ? (westEdge + centreLo) / 2 : eastEdge !== null && eastEdge > westEdge ? (westEdge + eastEdge) / 2 : westEdge + gap;
  const eastStart = eastEdge === null ? width : centreHi !== null && centreHi < eastEdge ? (centreHi + eastEdge) / 2 : westEdge !== null && westEdge < eastEdge ? (westEdge + eastEdge) / 2 : eastEdge - gap;
  const sideCount = (side: 'EAST' | 'WEST') => flights.filter((flight) => flight.building === building && flight.side === side).length;
  return <figure className="av-map" data-testid={`map-${building}`} data-building={building}>
    <figcaption>{copy.building[building][lang]}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="group" aria-label={`${copy.building[building][lang]} · ${copy.axis[lang]}`}
      className="av-animate" style={{ display: 'block', maxHeight: building === 'T2' ? 520 : building === 'T1' ? 420 : 200, maxWidth: building === 'CONCOURSE' ? 560 : undefined }}>
      <defs>
        <pattern id={`av-hatch-${building}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="av-map-hatch"/>
        </pattern>
      </defs>
      {westEdge !== null && <rect className="av-map-zone west" x={0} y={0} width={Math.max(0, westEnd)} height={height} rx={unitR * 2.4}/>}
      {eastEdge !== null && <rect className="av-map-zone east" x={Math.min(width, eastStart)} y={0} width={Math.max(0, width - eastStart)} height={height} rx={unitR * 2.4}/>}
      {westEdge !== null && eastEdge !== null && eastStart > westEnd && <rect className="av-map-zone centre" x={westEnd} y={0} width={eastStart - westEnd} height={height}/>}
      {westEdge !== null && <text className="av-map-zone-label west" x={unitR * 3} y={zoneLabel * 1.35} fontSize={zoneLabel} data-testid={`map-zone-west-${building}`}>{copy.side.WEST[lang]} {sideCount('WEST')}{unitWord}</text>}
      {eastEdge !== null && <text className="av-map-zone-label east" x={width - unitR * 3} y={zoneLabel * 1.35} fontSize={zoneLabel} textAnchor="end" data-testid={`map-zone-east-${building}`}>{copy.side.EAST[lang]} {sideCount('EAST')}{unitWord}</text>}
      {(['EAST', 'WEST', 'CENTER'] as const).map((side) => <path key={side} className={`av-map-spine ${side.toLowerCase()}`} d={spine(gates.filter((gate) => gate.side === side).map((gate) => ({ ...place(gate), gate: gate.gate })).map(({ cx, cy, gate }) => ({ x: cx, y: cy, gate })))}/>)}
      {gates.map((gate, index) => {
        const n = counts.get(gate.gate) ?? 0;
        const { cx, cy } = place(gate);
        const isSelected = selected === key(gate.gate);
        // The concourse is one long row of gates, so its dots are drawn smaller to keep them apart.
        const dot = building === 'CONCOURSE' ? 0.6 : 1;
        const r = (n ? unitR * (2.3 + Math.sqrt(n) * 1.25) : unitR * 0.85) * dot;
        const label = `${copy.gate[lang]} ${gate.gate} · ${copy.side[gate.side][lang]} · ${n}${unitWord}`;
        return <g key={gate.gate} role="button" tabIndex={n ? 0 : -1} aria-label={label} aria-pressed={isSelected}
          className={`av-map-gate ${gate.side.toLowerCase()}${n ? '' : ' empty'}${isSelected ? ' selected' : ''}`}
          data-gate={gate.gate} data-flights={n} data-side={gate.side}
          onClick={() => n && activate(gate.gate)} onKeyDown={(event) => n && onKey(event, gate.gate)} style={{ cursor: n ? 'pointer' : 'default' }}>
          <title>{label}</title>
          <circle cx={cx} cy={cy} r={r} fill={gate.side === 'UNVERIFIED' && n ? `url(#av-hatch-${building})` : undefined} style={{ animationDelay: `${Math.min(index, 40) * 12}ms` }}/>
          {n > 0 && busiest.has(gate.gate) && <text x={cx} y={cy + unitR * 1.15 * dot} textAnchor="middle" fontSize={unitR * 3.3 * dot} style={{ pointerEvents: 'none' }}>{n}</text>}
        </g>;
      })}
    </svg>
  </figure>;
}

/**
 * A list that sits in a closed <details> draws its rows only once opened: a
 * whole day is hundreds of flights, and a closed list used to cost most of the
 * page's elements (and the phone's time) for nothing.
 */
function OpenableList({ summary, testId, children, ...rest }: { summary: React.ReactNode; testId: string; children: () => React.ReactNode } & { className?: string }) {
  const [open, setOpen] = useState(false);
  return <details className={rest.className} data-testid={testId} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary>{summary}</summary>
    {open && children()}
  </details>;
}

function FlightRows({ lang, flights, testId }: { lang: Lang; flights: readonly MapFlight[]; testId: string }) {
  return <ul className="prep-side-hours" data-testid={testId}>
    {flights.map((flight) => <li key={`${flight.id}:${flight.day}`} data-group={flight.group}>
      {flightLine(flight, lang)} <span className="prep-note">({copy.side[flight.side][lang]}{flight.building === 'CONCOURSE' ? ` · ${copy.concourse[lang]}` : ''} · {statusText(flight.status, lang)})</span>
    </li>)}
  </ul>;
}

export default function DepartureMapBlock({ lang, date, todayKst, dayRelation, terminal, nowIso, holidays }: {
  lang: Lang; date: string; todayKst: string; dayRelation: 'PAST' | 'TODAY' | 'FUTURE'; terminal: MapTerminal; nowIso: string;
  /** China's and Japan's official holidays on the date, from the page's own calendar lookup. */
  holidays: ReadonlyArray<{ country: string; name: string }>;
}) {
  const today = dayRelation === 'TODAY' && date === todayKst;
  const [preset, setPreset] = useState<WindowPreset>('DAY');
  const [custom, setCustom] = useState<[number, number]>([9, 18]);
  const [filter, setFilter] = useState<DestinationGroup | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<'OK' | 'FAILED' | null>(null);
  const nowMinute = today ? minuteOfDay(date, `${new Date(Date.parse(nowIso) + 9 * 3_600_000).toISOString().slice(0, 16)}:00+09:00`) : null;
  const span: MapWindow = preset === 'CUSTOM' ? (customWindow(custom[0], custom[1]) ?? { startMin: 0, endMin: 1440 })
    : presetWindow(preset === 'DAY' || !today ? 'DAY' : preset, nowMinute);
  const nextDate = shiftKstDay(date, 1);
  const current = useFlights(date);
  const next = useFlights(span.endMin > 1440 ? nextDate : null);
  const map = useMemo(() => current?.status === 'OK'
    ? departureMap({ date, nextDate, terminal, window: span, rows: current.payload.flights, nextRows: next === undefined ? null : next.status === 'OK' ? next.payload.flights : [] })
    : null, [current, next, date, nextDate, terminal, span.startMin, span.endMin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (current === undefined) return <p className="prep-note" data-testid="map-loading">{copy.loading[lang]}</p>;
  if (current.status === 'FAILED' || !map) return <p className="prep-note" data-testid="map-failed">{copy.failed[lang]}</p>;

  const shown = filter ? map.flights.filter((flight) => flight.group === filter) : map.flights;
  const atGate = selected ? shown.filter((flight) => `${flight.building}:${flight.gate}` === selected) : [];
  const unplaced = [...map.unplaced.noGate, ...map.unplaced.notOnMap].filter((flight) => !filter || flight.group === filter);
  const basis = current.payload.basis === 'OFFICIAL_DEPARTURE_SCHEDULE' ? copy.basisSchedule[lang] : copy.basisCollected[lang];
  const holidayFor = (group: DestinationGroup) => holidays.filter((day) => (group === 'JP' && day.country === 'JP') || (group === 'CN' && day.country === 'CN'));
  const shareUrl = typeof location === 'undefined' ? 'https://koretaildata.com' : `${location.origin}${location.pathname}`;
  const share = mapShareText(map, { date, filter, basis, url: shareUrl }, lang);
  const copyText = async () => {
    try { await navigator.clipboard.writeText(share); setCopied('OK'); } catch { setCopied('FAILED'); }
  };
  const hours = Array.from({ length: 25 }, (_, hour) => hour);
  const presets: WindowPreset[] = today ? ['DAY', 'NEXT1', 'NEXT3', 'NEXT6', 'CUSTOM'] : ['DAY', 'CUSTOM'];

  return <div data-testid="departure-map" data-window={`${span.startMin}-${span.endMin}`} data-filter={filter ?? 'ALL'}>
    <p className="prep-note">{copy.intro[lang]}</p>
    <div className="date-nav-shortcuts" role="group" aria-label={copy.time[lang]} style={{ flexWrap: 'wrap' }}>
      {presets.map((value) => <button key={value} type="button" aria-pressed={preset === value} data-preset={value} style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}
        onClick={() => { setPreset(value); setSelected(null); }}>{copy.presets[value][lang]}</button>)}
    </div>
    {preset === 'CUSTOM' && <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <label>{copy.from[lang]} <select value={custom[0]} data-testid="map-from" onChange={(event) => { const start = Number(event.target.value); setCustom([start, Math.max(start + 1, custom[1])]); }}>
        {hours.slice(0, 24).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
      </select></label>
      <label>{copy.to[lang]} <select value={custom[1]} data-testid="map-to" onChange={(event) => setCustom([custom[0], Number(event.target.value)])}>
        {hours.slice(custom[0] + 1).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
      </select></label>
    </p>}
    <p className="prep-note">{windowText(map.window, lang)} · {copy.scheduled[lang]}</p>
    {map.nextDay === 'MISSING' && <p className="prep-note" data-testid="map-next-missing">{copy.nextDayMissing[lang]}</p>}
    {map.nextDay === 'COVERED' && <p className="prep-note" data-testid="map-next-covered">{copy.nextDayCovered[lang]}</p>}

    {!map.flights.length ? <><p className="prep-note" data-testid="map-counts">{windowCountsLine(map, lang)}</p><p className="prep-note" data-testid="map-empty">{copy.empty[lang]}</p></> : <>
      <div className="av-map-wrap">
        {buildingsOf(terminal).map((building) => <BuildingMap key={building} lang={lang} building={building} map={map} flights={shown} selected={selected} onSelect={setSelected}/>)}
        <ul className="av-legend av-map-legend">
          <li><i className="east"/>{copy.side.EAST[lang]}</li>
          <li><i className="west"/>{copy.side.WEST[lang]}</li>
          {map.sides.CENTER > 0 && <li><i className="centre"/>{copy.side.CENTER[lang]}</li>}
          <li><i className="unverified"/>{copy.side.UNVERIFIED[lang]}</li>
        </ul>
        <p className="av-map-caption" data-testid="map-counts">{windowCountsLine(map, lang)}</p>
        <p className="av-map-caption" data-testid="map-lead">{leadLine(map, lang)}</p>
        <p className="prep-note">{copy.axis[lang]} · {copy.schematic[lang]}</p>
      </div>
      {selected && <div data-testid="map-gate-flights">
        <h4 style={{ margin: '10px 0 0' }}>{copy.gate[lang]} {selected.split(':')[1]} · {copy.building[selected.split(':')[0] as MapBuilding][lang]}</h4>
        {atGate.length ? <FlightRows lang={lang} flights={atGate} testId="map-gate-list"/> : <p className="prep-note">{copy.noFlightsAtGate[lang]}</p>}
      </div>}

      <h4 className="av-dest-title">{copy.destinations[lang]}</h4>
      <table data-testid="map-groups" className="av-dest">
        <tbody>
          {(() => {
            const most = Math.max(1, ...map.groups.map((row) => row.flights));
            return map.groups.map((row) => {
              const share = groupShare(row, map.flights.length);
              const days = holidayFor(row.group);
              const unit = lang === 'en' ? '' : lang === 'ko' ? '편' : lang === 'zh' ? '班' : '便';
              return <tr key={row.group} data-group={row.group} className={filter === row.group ? 'active' : undefined}>
                <th scope="row">
                  <button type="button" aria-pressed={filter === row.group} onClick={() => { setFilter(filter === row.group ? null : row.group); setSelected(null); }}>
                    {copy.groups[row.group][lang]}
                  </button>
                  {days.length > 0 && <span className="prep-note" data-testid="map-holiday"> · {days.map((day) => day.name).join(', ')} ({copy.holidayNote[lang]})</span>}
                </th>
                <td className="av-dest-bar"><span style={{ width: `${(row.flights / most) * 100}%` }} aria-hidden="true"/></td>
                <td className="av-dest-value">{row.flights}{unit}{share === null ? '' : <small> · {share}%</small>}</td>
                <td className="av-dest-sides">
                  {(['EAST', 'WEST'] as const).map((side) => `${copy.side[side][lang].slice(0, 1)} ${row.bySide[side]}`).join(' / ')}
                  {row.concourse > 0 ? ` / ${copy.concourse[lang]} ${row.concourse}` : ''}
                </td>
              </tr>;
            });
          })()}
        </tbody>
      </table>
      <p className="prep-note" data-testid="map-groups-basis">{copy.destinationNote(map.flights.length, map.unknownDestination, lang)}</p>
      {filter && <p><button type="button" className="prep-link" onClick={() => setFilter(null)} data-testid="map-clear-filter"
        style={{ border: 0, padding: 0, background: 'transparent', color: 'var(--dusk-deep)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>{copy.clearFilter[lang]}</button>
        {' '}<span className="prep-note">({copy.filtered[lang]}: {copy.groups[filter][lang]} · {shown.length})</span></p>}

      {unplaced.length > 0 && <OpenableList className="prep-evidence" testId="map-unplaced" summary={<>{copy.unplacedTitle[lang]} {unplaced.length}</>}>{() => <>
        <p className="prep-note">{copy.noGate[lang]} {map.unplaced.noGate.filter((flight) => !filter || flight.group === filter).length} · {copy.notOnMap[lang]} {map.unplaced.notOnMap.filter((flight) => !filter || flight.group === filter).length}</p>
        <FlightRows lang={lang} flights={unplaced} testId="map-unplaced-list"/>
      </>}</OpenableList>}
      <OpenableList className="prep-evidence" testId="map-flights" summary={<>{copy.flightList[lang]} {shown.length}</>}>{() =>
        <FlightRows lang={lang} flights={shown} testId="map-flight-list"/>}</OpenableList>
    </>}

    <p className="prep-note">{basis}{current.payload.retrievedAt ? ` · ${copy.collected[lang]} ${kstClock(String(current.payload.retrievedAt), date)}` : ''} · {copy.notPeople[lang]}</p>
    <p><button type="button" className="install-app-button" onClick={copyText} data-testid="map-copy">{copy.copy[lang]}</button>
      {copied === 'OK' && <span className="prep-note" role="status"> {copy.copied[lang]}</span>}</p>
    {copied === 'FAILED' && <><p className="prep-note" role="status">{copy.copyFailed[lang]}</p><pre data-testid="map-share-text" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{share}</pre></>}
  </div>;
}

