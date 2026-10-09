'use client';
import { contextText } from './operational-context';

/**
 * The airport departure map (loaded only when a reader opens it; see
 * app/airport-sides.tsx). It reads the same /api/live/flights rows as the
 * flight board, once per date, and computes everything on the device: moving
 * the time or the destination filter never asks the server again.
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAirportModelTarget } from './use-airport-model-target';
import { AirportFlightBrowser } from './airport-flight-browser';
import { useFlights } from './flights-client';
import type { Lang } from './retailpulse-data';
import type { LiveSummary } from './live-signals';
import type { AirportSidesBlock as SidesBlock } from '../lib/airport-sides-summary';
import { shiftKstDay } from '../lib/kst';
import {
  buildingsOf, customWindow, departureMap, minuteOfDay, presetWindow,
  type DepartureMap, type MapBuilding, type MapFlight, type MapTerminal, type MapWindow, type WindowPreset, type FlightBuildingScope,
} from '../lib/airport-departure-map';
import { flightLine, groupShare, statusText, leadLine, mapCopy as copy, mapShareText, windowCountsLine, windowText } from '../lib/airport-departure-map-copy';
import type { DestinationGroup } from '../lib/airport-destinations';
import { AirportConceptModel } from './airport-concept-model';
import { AirportSceneModel } from './airport-scene-model';
import { AirportZoneCountries } from './airport-zone-countries';
import { AirportTopReference } from './airport-top-reference';
import { topReferences } from '../lib/airport-top-reference';
import { zoneShareCopy } from '../lib/airport-zone-share-copy';
import { airportModelScope } from '../lib/airport-model-scope';
import { airportFlightEvidence } from '../lib/airport-flight-evidence';

/** "14:05" in KST, with the date in front when it is not the service date. */
function kstClock(iso: string, date: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const kst = new Date(at + 9 * 3_600_000).toISOString();
  return `${kst.slice(0, 10) === date ? '' : `${kst.slice(5, 10)} `}${kst.slice(11, 16)} KST`;
}

const SIDE_FILL: Record<string, string> = { EAST: 'var(--blue)', WEST: 'var(--green)', CENTER: 'var(--muted)', UNVERIFIED: 'var(--paper)' };

function BuildingMap({ lang, building, map, flights, selected, onSelect }: {
  lang: Lang; building: MapBuilding; map: DepartureMap; flights: readonly MapFlight[]; selected: string | null; onSelect: (key: string | null) => void;
}) {
  const gates = map.gates.filter((gate) => gate.building === building);
  if (!gates.length) return null;
  const counts = new Map<string, number>();
  for (const flight of flights) if (flight.building === building && flight.position && flight.gate) counts.set(flight.gate, (counts.get(flight.gate) ?? 0) + 1);
  const pad = 60;
  const maxX = Math.max(...gates.map((gate) => gate.x)), maxY = Math.max(...gates.map((gate) => gate.y));
  const width = maxX + pad * 2, height = maxY + pad * 2;
  const key = (gate: string) => `${building}:${gate}`;
  const activate = (gate: string) => onSelect(selected === key(gate) ? null : key(gate));
  const onKey = (event: KeyboardEvent, gate: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(gate); }
  };
  return <figure style={{ margin: '10px 0 0' }} data-testid={`map-${building}`}>
    <figcaption className="prep-note">{copy.building[building][lang]}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="group" aria-label={`${copy.building[building][lang]} · ${copy.axis[lang]}`}
      style={{ display: 'block', maxHeight: building === 'T2' ? 340 : 220, border: '1px solid var(--line)', background: 'var(--paper)' }}>
      {gates.map((gate) => {
        const n = counts.get(gate.gate) ?? 0;
        const cx = gate.x + pad, cy = height - (gate.y + pad);
        const isSelected = selected === key(gate.gate);
        const unitR = width / 100;
        const r = n ? unitR * (2.2 + Math.sqrt(n) * 1.1) : unitR * 0.9;
        const label = `${copy.gate[lang]} ${gate.gate} · ${copy.side[gate.side][lang]} · ${n}${lang === 'en' ? ' flights' : lang === 'ko' ? '편' : lang === 'zh' ? '班' : '便'}`;
        return <g key={gate.gate} role="button" tabIndex={n ? 0 : -1} aria-label={label} aria-pressed={isSelected}
          data-gate={gate.gate} data-flights={n} data-side={gate.side}
          onClick={() => n && activate(gate.gate)} onKeyDown={(event) => n && onKey(event, gate.gate)} style={{ cursor: n ? 'pointer' : 'default' }}>
          <title>{label}</title>
          <circle cx={cx} cy={cy} r={r} fill={n ? SIDE_FILL[gate.side] : 'var(--line)'} fillOpacity={n ? (gate.side === 'UNVERIFIED' ? 1 : 0.85) : 1}
            stroke={isSelected ? 'var(--ink)' : gate.side === 'UNVERIFIED' && n ? 'var(--muted)' : 'none'} strokeWidth={unitR * (isSelected ? 0.6 : 0.3)}/>
          {n > 0 && <text x={cx} y={cy + unitR * 1.1} textAnchor="middle" fontSize={unitR * 3} fill={gate.side === 'UNVERIFIED' ? 'var(--ink)' : 'var(--paper)'} style={{ pointerEvents: 'none' }}>{n}</text>}
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

export default function DepartureMapBlock({ lang, date, todayKst, dayRelation, terminal, nowIso, holidays, defaultBuildingScope, modelPlacement, referenceSummary }: {
  lang: Lang; date: string; todayKst: string; dayRelation: 'PAST' | 'TODAY' | 'FUTURE'; terminal: MapTerminal; nowIso: string;
  /** China's and Japan's official holidays on the date, from the page's own calendar lookup. */
  holidays: ReadonlyArray<{ country: string; name: string }>;
  defaultBuildingScope?:FlightBuildingScope;
  modelPlacement?:string;
  referenceSummary?:LiveSummary;
}) {
  const modelTarget=useAirportModelTarget(modelPlacement);
  const nowDateKst = new Date(Date.parse(nowIso) + 9 * 3_600_000).toISOString().slice(0, 10);
  // A last-good summary can straddle midnight. Its old TODAY label must not
  // make the new day's 00:02 look like 00:02 (+1) on the previous date.
  const today = dayRelation === 'TODAY' && date === todayKst && date === nowDateKst;
  const [preset, setPreset] = useState<WindowPreset>('DAY');
  const scopeContext=`${terminal}:${defaultBuildingScope??'terminal'}`;
  const [buildingSelection,setBuildingSelection]=useState<{context:string;scope:FlightBuildingScope}|null>(null);
  const buildingScope=buildingSelection?.context===scopeContext?buildingSelection.scope:defaultBuildingScope;
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
    ? departureMap({ date, nextDate, terminal, buildingScope, window: span, rows: current.payload.flights, nextRows: next?.status === 'OK' && (next.payload.flights.length > 0 || next.payload.retrievedAt) ? next.payload.flights : null })
    : null, [current, next, date, nextDate, terminal, buildingScope, span.startMin, span.endMin]); // eslint-disable-line react-hooks/exhaustive-deps
  const wholeDaySelected = preset === 'DAY' && span.startMin === 0 && span.endMin === 1440;
  const reference = useMemo(() => referenceSummary && current?.status === 'OK' ? topReferences({ summary: referenceSummary,
    sides: (referenceSummary.airport as LiveSummary['airport'] & { sides?: SidesBlock }).sides,
    date, nowIso, scope: buildingScope ?? terminal, wholeDaySelected, source: current.payload }) : null,
  [referenceSummary, current, date, nowIso, buildingScope, terminal, wholeDaySelected]);

  // The architectural illustration is data-free. Keep it available while counts
  // are withheld; do not show zone counts, shares or official coordinates here.
  const unavailableModel=modelTarget?createPortal(<AirportSceneModel scope={buildingScope??terminal} lang={lang} className="airport-concept-picture"/>,modelTarget):null;
  if (current === undefined) return <>{unavailableModel}<p className="prep-note" data-testid="map-loading">{copy.loading[lang]}</p></>;
  if (current.status === 'FAILED' || !map) return <>{unavailableModel}<p className="prep-note" data-testid="map-failed">{copy.failed[lang]}</p></>;
  if (current.payload.truncated || (span.endMin > 1440 && next?.status === 'OK' && next.payload.truncated)) return <>{unavailableModel}
    <p className="prep-note" role="status" data-testid="map-partial">{{
    ko: '항공편 일부만 반환되어 동서·목적지 전체 비교를 확정할 수 없습니다. 항공편 화면에서 기록을 확인하세요.',
    en: 'Partial flight records: complete east/west and destination comparisons cannot be established. Check the flight board for records.',
    zh: '仅返回部分航班，无法确认完整的东西侧及目的地比较。请查看航班记录。',
    ja: '一部の便のみのため、東西・目的地の全体比較を確定できません。便の記録を確認してください。',
  }[lang]}</p>
    {!current.payload.truncated && <button type="button" className="prep-link" data-testid="map-partial-reset" onClick={() => setPreset('DAY')}>{copy.presets.DAY[lang]}</button>}
  </>;

  if (!current.payload.retrievedAt && current.payload.flights.length === 0) return <>{unavailableModel}<p className="prep-note" role="status" data-testid="map-unavailable">{zoneShareCopy[lang].unavailable}</p></>;

  const shown = filter ? map.flights.filter((flight) => flight.group === filter) : map.flights;
  const atGate = selected ? shown.filter((flight) => `${flight.building}:${flight.gate}` === selected) : [];
  const unplaced = [...map.unplaced.noGate, ...map.unplaced.notOnMap].filter((flight) => !filter || flight.group === filter);
  const evidence = [airportFlightEvidence({date, today, ...current.payload}, lang),
    span.endMin > 1440 && next?.status === 'OK' ? airportFlightEvidence({date: nextDate, today:false, ...next.payload}, lang) : null].filter(Boolean).join(' / ');
  const basis = current.payload.basis === 'OFFICIAL_DEPARTURE_SCHEDULE' ? copy.basisSchedule[lang] : copy.basisCollected[lang];
  const holidayFor = (group: DestinationGroup) => holidays.filter((day) => (group === 'JP' && day.country === 'JP') || (group === 'CN' && day.country === 'CN'));
  const shareUrl = typeof location === 'undefined' ? 'https://koretaildata.com' : `${location.origin}${location.pathname}`;
  const share = mapShareText(map, { date, filter, basis, url: shareUrl }, lang);
  const copyText = async () => {
    try { await navigator.clipboard.writeText(share); setCopied('OK'); } catch { setCopied('FAILED'); }
  };
  const hours = Array.from({ length: 25 }, (_, hour) => hour);
  const presets: WindowPreset[] = today ? ['DAY', 'NEXT1', 'NEXT3', 'NEXT6', 'CUSTOM'] : ['DAY', 'CUSTOM'];
  const topReference = referenceSummary && <AirportTopReference lang={lang} date={date} scope={buildingScope ?? terminal} wholeDay={wholeDaySelected} entries={reference}
    onWholeDay={() => { setPreset('DAY'); setSelected(null); }}
    onT1Day={() => { setPreset('DAY'); setBuildingSelection({ context: scopeContext, scope: 'T1' }); setSelected(null); setFilter(null); }}/>

  return <div data-testid="departure-map" data-window={`${span.startMin}-${span.endMin}`} data-filter={filter ?? 'ALL'}>
    <div className="terminal-selector" role="group" aria-label={{ko:'출발편 건물 구분',en:'Departure building scope',zh:'出发航班建筑范围',ja:'出発便の建物範囲'}[lang]}>
      {(['all','T1','T2','CONCOURSE'] as const).map(scope=>{
        const label=airportModelScope(scope,lang);
        const [title,...detail]=label.split(' ');
        return <button type="button" key={scope} aria-pressed={buildingScope===scope} onClick={()=>{setBuildingSelection({context:scopeContext,scope});setSelected(null);setFilter(null);}}>{scope==='all'?<><span>{title}</span>{' '}<small>{detail.join(' ')}</small></>:label}</button>;
      })}
    </div>
    {buildingScope&&<p className="prep-note">{{ko:'건물별 편수: T1 본관·T2·탑승동을 별도 집계합니다. 전체에는 건물 미정도 포함하며 탑승동 여객 예보는 따로 제공되지 않습니다.',en:'Physical buildings: T1 main, T2 and concourse are counted separately. All includes unknown buildings. No separate concourse passenger forecast is provided.',zh:'按T1主楼、T2、登机楼分别统计。全部包含建筑未定航班。不提供登机楼独立旅客预测。',ja:'T1本館・T2・搭乗棟を別々に集計。全体は建物未定便も含みます。搭乗棟単独の旅客予想は提供されません。'}[lang]}</p>}
    {map.nextDay !== 'MISSING' ? (modelPlacement ? modelTarget && createPortal(<><AirportConceptModel map={map} lang={lang} evidence={evidence}/>{topReference}<AirportZoneCountries map={map} lang={lang}/></>,modelTarget) : <><AirportConceptModel map={map} lang={lang} evidence={evidence}/><AirportZoneCountries map={map} lang={lang}/></>) : unavailableModel}
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
    {map.nextDay === 'MISSING' && <p className="prep-note" data-testid="map-next-missing" role="status">{copy.nextDayMissing[lang]}</p>}

    {!map.flights.length ? map.nextDay !== 'MISSING' && map.unknownBuilding === 0 && <p className="prep-note" data-testid="map-empty">{copy.empty[lang]}</p> : <>
      <OpenableList testId="map-destinations" summary={copy.destinations[lang]}>{() => <>
      <table data-testid="map-groups" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {map.groups.map((row) => {
            const share = groupShare(row, map.flights.length);
            const days = holidayFor(row.group);
            return <tr key={row.group} data-group={row.group} style={{ borderTop: '1px solid var(--line)' }}>
              <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '6px 0' }}>
                <button type="button" aria-pressed={filter === row.group} onClick={() => { setFilter(filter === row.group ? null : row.group); setSelected(null); }}
                  style={{ border: 0, padding: 0, background: 'transparent', color: filter === row.group ? 'var(--blue)' : 'var(--ink)', textDecoration: filter === row.group ? 'underline' : 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                  {copy.groups[row.group][lang]}
                </button>
                {days.length > 0 && <span className="prep-note" data-testid="map-holiday"> · {days.map((day) => day.name).join(', ')} ({copy.holidayNote[lang]})</span>}
              </th>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{row.flights}{lang === 'en' ? '' : lang === 'ko' ? '편' : lang === 'zh' ? '班' : '便'}{share === null ? '' : ` · ${share}%`}</td>
              <td className="prep-note" style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 8 }}>
                {(['EAST', 'WEST'] as const).map((side) => `${copy.side[side][lang].slice(0, 1)} ${row.bySide[side]}`).join(' / ')}
                {row.concourse > 0 ? ` / ${copy.concourse[lang]} ${row.concourse}` : ''}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      <p className="prep-note" data-testid="map-groups-basis">{copy.destinationNote(map.flights.length, map.unknownDestination, lang)}</p>
      </>}</OpenableList>
      {filter && <p><button type="button" className="prep-link" onClick={() => setFilter(null)} data-testid="map-clear-filter"
        style={{ border: 0, padding: 0, background: 'transparent', color: 'var(--blue)', cursor: 'pointer', font: 'inherit' }}>{copy.clearFilter[lang]}</button>
        {' '}<span className="prep-note">({copy.filtered[lang]}: {copy.groups[filter][lang]} · {shown.length})</span></p>}

      <OpenableList testId="map-official-coordinates" summary={contextText(lang,'공식 지도 탑승구 좌표','Gate coordinates on official maps','官方地图登机口坐标','公式地図の搭乗口座標')}>{() => <>
      {(buildingScope==='all'?['T1','T2','CONCOURSE'] as const:buildingScope?[buildingScope]:buildingsOf(terminal)).map((building) => <BuildingMap key={building} lang={lang} building={building} map={map} flights={shown} selected={selected} onSelect={setSelected}/>)}
      <p className="prep-note">{copy.schematic[lang]}</p>
      {selected && <div data-testid="map-gate-flights">
        <h4 style={{ margin: '10px 0 0' }}>{copy.gate[lang]} {selected.split(':')[1]} · {copy.building[selected.split(':')[0] as MapBuilding][lang]}</h4>
        {atGate.length ? <FlightRows lang={lang} flights={atGate} testId="map-gate-list"/> : <p className="prep-note">{copy.noFlightsAtGate[lang]}</p>}
      </div>}
      </>}</OpenableList>

      {unplaced.length > 0 && <OpenableList className="prep-evidence" testId="map-unplaced" summary={<>{copy.unplacedTitle[lang]} {unplaced.length}</>}>{() => <>
        <p className="prep-note">{copy.noGate[lang]} {map.unplaced.noGate.filter((flight) => !filter || flight.group === filter).length} · {copy.notOnMap[lang]} {map.unplaced.notOnMap.filter((flight) => !filter || flight.group === filter).length}</p>
        <FlightRows lang={lang} flights={unplaced} testId="map-unplaced-list"/>
      </>}</OpenableList>}
      <AirportFlightBrowser lang={lang} flights={shown} testId="map-flights"/>
    </>}

    <p className="prep-note">{date} KST{current.payload.retrievedAt ? ` · ${copy.collected[lang]} ${kstClock(String(current.payload.retrievedAt), date)}` : ''}</p>
    <details className="prep-evidence" data-testid="map-counting-basis"><summary>{{ko:'출처·집계 기준',en:'Sources and counting basis',zh:'来源与统计基准',ja:'出典・集計基準'}[lang]}</summary><p className="prep-note">{copy.intro[lang]}</p><p className="prep-note">{basis} · {copy.notPeople[lang]}</p>
      {map.nextDay !== 'MISSING' && <p className="prep-note" data-testid="map-counts">{windowCountsLine(map, lang)}</p>}
      {map.nextDay !== 'MISSING' && (map.flights.length > 0 || map.unknownBuilding > 0) && <p className="prep-note" data-testid="map-lead">{leadLine(map, lang)}</p>}
      {map.nextDay === 'COVERED' && <p className="prep-note" data-testid="map-next-covered">{copy.nextDayCovered[lang]}</p>}
    </details>
    <p><button type="button" className="install-app-button" onClick={copyText} data-testid="map-copy">{copy.copy[lang]}</button>
      {copied === 'OK' && <span className="prep-note" role="status"> {copy.copied[lang]}</span>}</p>
    {copied === 'FAILED' && <><p className="prep-note" role="status">{copy.copyFailed[lang]}</p><pre data-testid="map-share-text" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{share}</pre></>}
  </div>;
}
