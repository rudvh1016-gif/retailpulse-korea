import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PreparationEvent} from '../app/airport-preparation-event';
import {EventCountryFlights} from '../app/event-country-flights';
import {eventFlights} from './helpers/event-flight-fixture';
const event={id:'future',country:'JP',countryLabel:'일본',name:'문화의 날',start:'2026-11-03',end:'2026-11-03',type:'public_holiday',scope:'전국 공휴일',sourceURL:'https://example.test/jp'};
test('future event keeps selected-day flight reference inside closed evidence in every locale',()=>{
 for(const lang of ['ko','en','zh','ja'] as const){
  const html=renderToStaticMarkup(h(PreparationEvent,{event,lang,flights:eventFlights(),planning:true}));
  const [visible,evidence]=html.split('<details');
  assert.match(visible,/<h4>/);assert.match(visible,/11\/03/);assert.doesNotMatch(visible,/event-country-flights|data-flight-day|staff-route-metric/);
  assert.match(evidence,/^ class="focus-event-details">/);assert.match(evidence,/focus-planning-flight-note/);assert.match(evidence,/data-flight-day="2026-10-22"/);assert.match(evidence,/https:\/\/example.test\/jp/);
 }
});
test('current event separates event dates, flight date, count and unrounded comparison basis',()=>{
 const html=renderToStaticMarkup(h(PreparationEvent,{event,flights:eventFlights()}));
 assert.ok(html.indexOf('focus-event-dates')<html.indexOf('event-country-flights'));
 const metric=renderToStaticMarkup(h(EventCountryFlights,{country:'JP',label:'일본',context:eventFlights(),lang:'ko'}));
 assert.match(metric,/event-flight-context/);assert.match(metric,/event-flight-baseline/);assert.match(metric,/data-flight-day="2026-10-22"/);
});
test('arrival hides only its model while departure flow and statistics remain',()=>{
 const source=readFileSync('app/airport-live-signals.tsx','utf8');
 const arrival=source.split('export function AirportArrivalSummary')[1].split('export function AirportTodaySummary')[0];
 assert.match(arrival,/<AirportFlowFigure\s+showModel=\{false\}/);
 assert.match(arrival,/timeline=\{timeline\}/);assert.match(source,/airport-departure-model-slot/);
 assert.match(readFileSync('app/airport-departure-overview.tsx','utf8'),/DepartureMapSection/);
});
test('monthly provenance preserves full dates inside a second closed disclosure after period and counts',()=>{
 const source=readFileSync('app/airport-monthly-flights.tsx','utf8');
 const summary=source.indexOf('airport-month-coverage-summary'),details=source.indexOf('<details className="airport-month-source-details">');
 assert.ok(summary>0&&details>summary);assert.ok(source.indexOf("data.includedDays.join(', ')")>details);assert.ok(source.indexOf('data.excludedDays.map')>details);assert.ok(source.indexOf('response?.data?.sidesVersion')>details);
});
