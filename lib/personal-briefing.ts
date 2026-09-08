import type { LiveSummary } from '../app/live-signals';
import { pc, type PersonalLang } from './personal-copy';

export const roles = ['tourist','manager','guide'] as const;
export const locations = ['airport','myeongdong','hongdae','seongsu'] as const;
export const terminals = ['all','T1','T2','CONCOURSE'] as const;
export const interests = ['passengers','crowding','flights','airlines','foreign','weather','events','guidance'] as const;
export type Role = typeof roles[number];
export type Location = typeof locations[number];
export type Interest = typeof interests[number];
export interface PersonalPreferences { version: 1; role: Role; location: Location; terminal: typeof terminals[number]; interests: Interest[]; day: 'today' | 'tomorrow'; analytics: boolean }
export const PREFERENCE_KEY = 'koretail-personal-v1';
export function availableInterests(location: Location): Interest[] {
  return location === 'airport' ? ['passengers','crowding','flights','airlines'] : ['passengers','crowding','foreign','weather','events','guidance'];
}
export function recommendedPreferences(role: Role, location: Location = 'airport'): PersonalPreferences {
  const preferred: Interest[] = role === 'manager' ? ['passengers','crowding','flights','airlines','foreign','weather','events'] : role === 'guide' ? ['foreign','events','weather','flights','airlines','crowding','guidance'] : ['crowding','weather','events','flights'];
  return {version:1,role,location,terminal:'all',interests:preferred.filter(i=>availableInterests(location).includes(i)),day:role==='manager'?'tomorrow':'today',analytics:false};
}
export function parsePreferences(raw: string | null): PersonalPreferences | null {
  try {
    const p = JSON.parse(raw ?? 'null');
    if (!p || p.version !== 1 || !roles.includes(p.role) || !locations.includes(p.location) || !terminals.includes(p.terminal) || !['today','tomorrow'].includes(p.day) || typeof p.analytics !== 'boolean' || !Array.isArray(p.interests) || !p.interests.length || p.interests.length > interests.length || !p.interests.every((i: Interest)=>availableInterests(p.location).includes(i)) || new Set(p.interests).size !== p.interests.length) return null;
    return {version:1,role:p.role,location:p.location,terminal:p.terminal,day:p.day,interests:p.interests,analytics:p.analytics};
  } catch { return null; }
}
export function nextDay(date: string) { return new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) === date ? new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10) : date; }
const kstDay = (date: string) => Number.isFinite(Date.parse(date)) ? new Date(Date.parse(date)+9*3600000).toISOString().slice(0,10) : '';
const clock = (date: string) => new Date(Date.parse(date)+9*3600000).toISOString().slice(11,16);
export interface PersonalCard { interest: Interest; label: string; value: string; note: string; at?: string }
export function buildPersonalBrief(summary: LiveSummary | null | undefined, p: PersonalPreferences, date: string, lang: PersonalLang): {cards: PersonalCard[]; actions: string[]} {
  const cards: PersonalCard[] = [];
  const actions: string[] = [];
  if (!summary || summary.mode !== 'live-summary' || summary.serviceDateKst !== date) return {cards,actions};
  const add = (interest: Interest, label: string, value: string, note: string, at?: string) => { if(p.interests.includes(interest)) cards.push({interest,label,value,note,at}); };
  const num = (value: number) => value.toLocaleString(lang === 'zh' ? 'zh-CN' : lang);
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (p.location === 'airport') {
    const a = summary.airport;
    if (!a || a.serviceDateKst !== date) return {cards,actions};
    const all = p.terminal === 'all';
    const coverage = all ? a.forecastCoverage?.all : a.forecastCoverage?.byTerminal[p.terminal];
    const passengers = all ? a.todayExpectedPassengersTotal : a.todayExpectedPassengersByTerminal?.[p.terminal];
    const at = all ? a.passengerForecastRetrievedAt : a.passengerForecastRetrievedAtByTerminal?.[p.terminal];
    if (p.terminal !== 'CONCOURSE' && coverage === 'COMPLETE' && finite(passengers)) add('passengers',pc('expectedDepartures',lang),num(passengers),pc('forecast',lang),at ?? undefined);
    const peak = all ? a.peakExpectedTimeBand : a.peakExpectedTimeBandByTerminal?.[p.terminal];
    if (p.terminal !== 'CONCOURSE' && coverage === 'COMPLETE' && peak && kstDay(peak.targetStartAt)===date) add('crowding',pc('peak',lang),`${clock(peak.targetStartAt)}–${clock(peak.targetEndAt)} KST`,pc('forecast',lang),at ?? undefined);
    // Scope counters start at zero even when the date has no collected flights.
    // A real whole-airport count is the evidence gate before exposing any scope.
    const flights = !finite(a.departuresTrackedToday) ? null : p.terminal === 'CONCOURSE' ? a.flightScope?.CONCOURSE : all ? a.departuresTrackedToday : a.departuresTrackedTodayByTerminal?.[p.terminal];
    if (finite(flights)) add('flights',pc('flights',lang),num(flights),pc('flightBasis',lang) + (a.flightScope?.capped ? ` · ${pc('partial',lang)}` : ''),a.departuresTrackedTodayRetrievedAt ?? undefined);
    const ranking = all ? a.airlineRanking?.all : a.airlineRanking?.byTerminal[p.terminal];
    const airline = ranking?.airlines.find(row=>row.registryName && finite(row.flights));
    if(airline) add('airlines',pc('airlines',lang),`${airline.registryName}${airline.countryBasis==='REGISTRY'&&airline.country?` · ${airline.country}`:''}`,pc('airlineBasis',lang),ranking?.retrievedAt ?? undefined);
  } else {
    const a = summary.areas[p.location];
    if (!a) return {cards,actions};
    const now = a.realtime;
    if (date === summary.todayKst && now && kstDay(now.observedAt) === date && finite(now.populationMin) && finite(now.populationMax)) {
      add('passengers',pc('current',lang),`${num(now.populationMin)}–${num(now.populationMax)}`,now.freshness === 'STALE' ? pc('stale',lang) : pc('current',lang),now.observedAt);
    }
    const rows = (a.realtimeForecast ?? []).filter(r=>kstDay(r.targetAt) === date && Date.parse(r.targetAt)>=Date.parse(summary.generatedAt) && finite(r.populationMax));
    const peak = [...rows].sort((a,b)=>b.congestionLevel-a.congestionLevel || b.populationMax-a.populationMax)[0];
    if (peak) {
      add('crowding',pc('peak',lang),`${clock(peak.targetAt)} KST`,pc('partial',lang),peak.retrievedAt);
      if(date !== summary.todayKst) add('passengers',pc('passengers',lang),`${num(peak.populationMin)}–${num(peak.populationMax)}`,`${clock(peak.targetAt)} KST · ${pc('partial',lang)}`,peak.retrievedAt);
    }
    const weather = (a.weather ?? []).filter(r=>kstDay(r.targetAt)===date);
    const rain = weather.map(r=>r.precipitationProbability).filter(finite);
    if(rain.length) add('weather',pc('rain',lang),`${Math.max(...rain)}%`,`${date} · ${pc('forecast',lang)}`);
    const events = (a.events ?? []).filter(r=>r.eventStart<=date && (r.eventEnd ?? r.eventStart)>=date);
    if(events.length) add('events',pc('events',lang),events.slice(0,2).map(e=>e.title).join(' · '),pc('eventNote',lang));
    if(a.foreignPresence && finite(a.foreignPresence.value)) add('foreign',pc('foreign',lang),num(a.foreignPresence.value),pc('historic',lang),a.foreignPresence.referenceAt);
    if(p.interests.includes('guidance')) add('guidance',pc('guidance',lang),pc('details',lang),pc('guidePromise',lang));
  }
  if(cards.some(c=>c.interest==='crowding'||c.interest==='passengers')) actions.push(pc(p.role==='manager'?'managerPrep':p.role==='guide'?'guidePrep':'visitPrep',lang));
  if(cards.some(c=>c.interest==='flights')) actions.push(pc('flightPrep',lang));
  if(cards.some(c=>c.interest==='weather')) actions.push(pc('weatherPrep',lang));
  if(cards.some(c=>c.interest==='events')) actions.push(pc('eventPrep',lang));
  return {cards,actions:actions.slice(0,4)};
}
