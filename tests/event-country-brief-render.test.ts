import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AirportFocusData} from '../app/airport-focus-data';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
import type {GlanceOverviewContext} from '../app/airport-glance-preview';
import {eventFlights} from './helpers/event-flight-fixture';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {OverviewHeadline}=await import('../app/airport-focus-preview');
const {default:AirportStaffBriefing}=await import('../app/airport-staff-briefing');
const event=(country:string,start:string,name:string):CalendarEvent=>({id:country+start,country,scope:'national',name,kind:'public_holiday',start,end:start,status:'verified',sourceURL:'https://example.test/'+country,verifiedAt:'2026-10-21'});
const events=[event('TH','2026-10-22','Thai fixture event'),event('JP','2026-10-22','Japan fixture event'),event('VN','2026-10-27','Vietnam fixture event'),event('SG','2026-11-05','Singapore fixture event')];
const context:GlanceOverviewContext={eventFlights:eventFlights(),day:'2026-10-22',scope:'all',flights:126,passengers:null,transferPassengers:null,referenceSum:null,flightComparison:null,flightBaseline:null,selectedCountryChanges:[]};
const provider={asOf:'2026-10-22',trends:[],checkedAt:null,preview:false,failed:false,calendarEvents:events};
for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: every represented Today/preparation event owns same-country selected-day metrics`,()=>{
 const html=renderToStaticMarkup(h(AirportFocusData.Provider,{value:provider},h(OverviewHeadline,{context,lang,onCountries:()=>{},onPrepare:()=>{}})));
 const cards=html.split('<div class="focus-event-row focus-preparation-event"').slice(1);
 assert.ok(cards.length>=4);
 assert.match(html,/<div class="focus-selected-country-stack"><div class="focus-selected-country-changes"/);
 for(const card of cards){const eventCountry=card.match(/data-country="([A-Z]{2})"/)?.[1];assert.ok(eventCountry);assert.ok(card.includes(`<div class="event-country-flights" data-country="${eventCountry}"`));assert.match(card,/data-flight-day="2026-10-22"/);assert.match(card,/data-flight-scope="all"/);assert.ok(card.indexOf('event-country-flights')<card.indexOf('focus-event-dates'));assert.match(card,/<details class="focus-event-details">/);}
 assert.match(html,/Thai fixture event/);assert.match(html,/Japan fixture event/);
 assert.doesNotMatch(html,/data-flight-day="2026-10-27"|data-flight-day="2026-11-05"/);
});
test('staff event selection cannot attach the largest unrelated route to the Thai holiday',()=>{
 const html=renderToStaticMarkup(h(AirportFocusData.Provider,{value:{...provider,calendarEvents:[event('TH','2026-10-23','Thai fixture event')]}},h(AirportStaffBriefing,{lang:'ko',day:context.day,peak:null,flights:context.eventFlights!,retrievedAt:'2026-10-22T00:00:00Z',changes:[{country:'TW',label:'대만',count:90,mean:1,delta:89,percent:8900,month:'2026-09',days:30}]})));
 const card=html.split('<div class="staff-holiday-event"')[1].split('<details')[0];assert.match(card,/Thai fixture event/);assert.match(card,/태국행 <b>16편/);assert.doesNotMatch(card,/대만|90편|8900/);
});

test('staff briefing without a verified event retains its existing ranked route summary',()=>{
 const html=renderToStaticMarkup(h(AirportFocusData.Provider,{value:{...provider,asOf:'',calendarEvents:[]}},h(AirportStaffBriefing,{lang:'ko',day:context.day,peak:null,flights:context.eventFlights!,retrievedAt:null,changes:[{country:'TW',label:'대만',count:90,mean:1,delta:89,percent:8900,month:'2026-09',days:30}]})));
 assert.match(html,/staff-route-metric" data-country="TW"/);assert.match(html,/대만행 90편/);assert.match(html,/8900%/);assert.doesNotMatch(html,/staff-holiday-event/);
});
