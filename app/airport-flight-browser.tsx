'use client';
import {useMemo, useState} from 'react';
import type {MapFlight} from '../lib/airport-departure-map';
import {flightLine, mapCopy, statusText} from '../lib/airport-departure-map-copy';
import type {Lang} from './retailpulse-data';
import {domesticDestinationLabel,domesticFlightKind,domesticTransitGuide,domesticTransitLabel} from '../lib/airport-domestic-labels';

const copy = {
  ko: {open:'항공편 보기', search:'편명·목적지·게이트 검색', empty:'일치하는 항공편이 없습니다.', more:'더 보기', less:'접기', unknown:'미정'},
  en: {open:'View flights', search:'Search flight, destination or gate', empty:'No matching flights.', more:'Show more', less:'Collapse', unknown:'Unknown'},
  zh: {open:'查看航班', search:'搜索航班、目的地或登机口', empty:'没有匹配的航班。', more:'查看更多', less:'收起', unknown:'未定'},
  ja: {open:'便を見る', search:'便名・目的地・ゲートを検索', empty:'一致する便はありません。', more:'さらに表示', less:'折りたたむ', unknown:'未定'},
};

/** All rows remain available; only an opened hour mounts its first 20 rows. */
function HourFlights({flights, lang, testId}: {flights: readonly MapFlight[]; lang: Lang; testId: string}) {
  const [visible, setVisible] = useState(20);
  const c = copy[lang];
  return <>
    <ul className="airport-flight-rows" data-testid={testId}>
      {flights.slice(0, visible).map(flight => {const domestic=domesticFlightKind(flight);return <li key={`${flight.day}:${flight.id}`} data-group={flight.group}>
        <details className="airport-flight-row">
          <summary data-disclosure-mixed>
            <span className="airport-flight-time">{flight.scheduledAt.slice(11,16)} KST</span>
            <span data-disclosure-title>{flight.flightNumber}</span>
            <span>{lang === 'ko' ? (domestic?flight.destination?.name:flight.destinationCode) ?? flight.destinationCode ?? c.unknown : flight.destination?.en ?? flight.destinationCode ?? c.unknown}{domestic&&<small> · {domestic==='transit'?domesticTransitLabel(lang):domesticDestinationLabel(lang)}</small>}</span>
            <span>{flight.gate ?? c.unknown} · {mapCopy.side[flight.side][lang]}</span>
          </summary>
          <p className="prep-note">{flightLine(flight, lang)} · {statusText(flight.status, lang)} · {flight.building}</p>
          {domestic==='transit'&&<p className="prep-note"><a href={domesticTransitGuide} target="_blank" rel="noopener noreferrer">{({ko:'국제선 연결 전용 · 국내 구간만 이용 불가 · 대한항공 안내',en:'International connections only · no standalone domestic travel · Korean Air guide',zh:'仅限国际航班中转 · 不可单独乘坐国内段 · 大韩航空说明',ja:'国際線乗り継ぎ専用・国内区間のみの利用不可・大韓航空案内'})[lang]}</a></p>}
        </details>
      </li>;})}
    </ul>
    {visible < flights.length && <button type="button" className="airport-flight-more" onClick={() => setVisible(n => n + 20)}>{c.more} ({Math.min(20, flights.length-visible)})</button>}
    {visible > 20 && <button type="button" className="airport-flight-more" onClick={event => {
      event.currentTarget.closest('.airport-flight-hour')?.querySelector('summary')?.focus();
      setVisible(20);
    }}>{c.less}</button>}
  </>;
}

function FlightHour({hour, flights, lang, testId}: {hour: string; flights: readonly MapFlight[]; lang: Lang; testId: string}) {
  const [open, setOpen] = useState(false);
  return <details className="airport-flight-hour" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary data-disclosure-mixed>{hour.slice(5,10)} · {hour.slice(11)}:00–{String((Number(hour.slice(11))+1)%24).padStart(2,'0')}:00 KST <span>{flights.length}</span></summary>
    {open && <HourFlights flights={flights} lang={lang} testId={`${testId}-rows`} />}
  </details>;
}

export function AirportFlightBrowser({flights, lang, testId}: {flights: readonly MapFlight[]; lang: Lang; testId: string}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const c = copy[lang];
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleUpperCase();
    const hours = new Map<string, MapFlight[]>();
    for (const flight of flights) {
      if (needle && !`${flight.flightNumber} ${flight.destinationCode ?? ''} ${flight.destination?.name ?? ''} ${flight.destination?.iata ?? ''} ${flight.destination?.en ?? ''} ${flight.gate ?? ''} ${mapCopy.side[flight.side][lang]}`.toLocaleUpperCase().includes(needle)) continue;
      const hour = flight.scheduledAt.slice(0,13);
      hours.set(hour, [...(hours.get(hour) ?? []), flight]);
    }
    return [...hours.entries()].sort(([a],[b]) => a.localeCompare(b));
  }, [flights, query, lang]);
  const found = groups.reduce((sum, [, rows]) => sum + rows.length, 0);
  return <details className="airport-flight-browser" data-testid={testId} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{c.open} <span data-disclosure-meta>({flights.length})</span></summary>
    {open && <>
      <label className="airport-flight-search">{c.search}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p className="prep-note" role="status">{found} / {flights.length}</p>
      {!found && <p role="status">{c.empty}</p>}
      {groups.map(([hour, rows]) => <FlightHour key={`${hour}:${query}`} hour={hour} flights={rows} lang={lang} testId={testId} />)}
    </>}
  </details>;
}
