'use client';

import {useState} from 'react';
import type {Lang, Terminal} from './retailpulse-data';
import {airportAudienceCopy} from '../lib/airport-audience';
import {AirportDeparturePreparation} from './airport-departure-preparation';
import {DateNavigator, FacilityDirectory, FlightBoard} from './live-signals';

export function AirportPassengerView({lang, terminal, setTerminal, date, setDate}: {
  lang: Lang; terminal: Terminal; setTerminal: (value: Terminal) => void;
  date: string | null; setDate: (value: string | null) => void;
}) {
  const c = airportAudienceCopy(lang);
  const [flightsOpen, setFlightsOpen] = useState(false);
  const [facilitiesOpen, setFacilitiesOpen] = useState(false);
  const selector = <div className="terminal-selector" role="group" aria-label="Terminal">
    {(['all', 'T1', 'T2'] as const).map(item => <button key={item} type="button"
      className={terminal === item ? 'active' : ''} aria-pressed={terminal === item}
      onClick={() => setTerminal(item)}>{item === 'all' ? 'T1 · T2' : item}</button>)}
  </div>;
  return <div className="airport-passenger-content">
    <AirportDeparturePreparation lang={lang} defaultOpen/>
    <details className="airport-passenger-tool" data-testid="passenger-flights"
      onToggle={event => setFlightsOpen(event.currentTarget.open)}>
      <summary>{c.flights}</summary>
      {flightsOpen && <><p>{c.flightNote}</p>{selector}<DateNavigator lang={lang} date={date} onChange={setDate} airportDates modernCalendar/>
        <FlightBoard lang={lang} terminal={terminal} date={date}/></>}
    </details>
    <details className="airport-passenger-tool" data-testid="passenger-facilities"
      onToggle={event => setFacilitiesOpen(event.currentTarget.open)}>
      <summary>{c.facilities}</summary>
      {facilitiesOpen && <><p>{c.facilityNote}</p>{selector}<FacilityDirectory lang={lang} terminal={terminal}/></>}
    </details>
  </div>;
}
