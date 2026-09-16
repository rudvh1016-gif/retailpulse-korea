import type { LiveSummary } from '../app/live-signals';
import { pc, type PersonalLang } from './personal-copy';

export const roles = ['tourist','manager','guide'] as const;
export const locations = ['airport','myeongdong','hongdae','seongsu'] as const;
export const terminals = ['all','T1','T2','CONCOURSE'] as const;
export const interests = ['passengers','crowding','flights','airlines','foreign','weather','events','guidance'] as const;
export type Role = typeof roles[number];
export type Location = typeof locations[number];
export type Interest = typeof interests[number];
export const days = ['yesterday','today','tomorrow'] as const;
export type BriefingDay = typeof days[number];
export interface PersonalPreferences { version: 1; role: Role; location: Location; terminal: typeof terminals[number]; interests: Interest[]; day: BriefingDay; analytics: boolean; selectedLocations?: Location[]; selectedTerminals?: (typeof terminals[number])[]; selectedDays?: BriefingDay[] }
export function toggleChoice<T>(values:T[],value:T):T[] { return values.includes(value) ? values.length===1 ? values : values.filter(v=>v!==value) : [...values,value]; }
export function briefingDate(today:string,day:BriefingDay) { return new Date(Date.parse(`${today}T00:00:00Z`)+(day==='yesterday'?-1:day==='tomorrow'?1:0)*86400000).toISOString().slice(0,10); }
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
    if (!p || p.version !== 1 || !roles.includes(p.role) || !locations.includes(p.location) || !terminals.includes(p.terminal) || !days.includes(p.day) || typeof p.analytics !== 'boolean') return null;
    const extra:Partial<PersonalPreferences>={};
    for(const [key,allowed,primary] of [['selectedLocations',locations,p.location],['selectedTerminals',terminals,p.terminal],['selectedDays',days,p.day]] as const){
      if(p[key]===undefined)continue;
      const values=p[key];
      if(!Array.isArray(values)||!values.length||values.length>allowed.length||new Set(values).size!==values.length||!values.every((v:unknown)=>(allowed as readonly unknown[]).includes(v))||values[0]!==primary)return null;
      Object.assign(extra,{[key]:values});
    }
    if(p.selectedTerminals?.includes('all')&&p.selectedTerminals.length>1)return null;
    const available=(extra.selectedLocations??[p.location]).flatMap(availableInterests);
    if(!Array.isArray(p.interests)||!p.interests.length||p.interests.length>interests.length||!p.interests.every((i:Interest)=>available.includes(i))||new Set(p.interests).size!==p.interests.length)return null;
    return {version:1,role:p.role,location:p.location,terminal:p.terminal,day:p.day,interests:p.interests,analytics:p.analytics,...extra};
  } catch { return null; }
}
export function nextDay(date: string) { return new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) === date ? new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10) : date; }
const kstDay = (date: string) => Number.isFinite(Date.parse(date)) ? new Date(Date.parse(date)+9*3600000).toISOString().slice(0,10) : '';
const clock = (date: string) => new Date(Date.parse(date)+9*3600000).toISOString().slice(11,16);
export interface PersonalCard { interest: Interest; label: string; value: string; note: string; at?: string; details?: string[] }
export function buildPersonalBrief(summary: LiveSummary | null | undefined, p: PersonalPreferences, date: string, lang: PersonalLang): {cards: PersonalCard[]; actions: string[]} {
  const cards: PersonalCard[] = [];
  const actions: string[] = [];
  if (!summary || summary.mode !== 'live-summary' || summary.serviceDateKst !== date) return {cards,actions};
  const add = (interest: Interest, label: string, value: string, note: string, at?: string, details?: string[]) => { if(p.interests.includes(interest)) cards.push({interest,label,value,note,at,details}); };
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
    if (p.terminal !== 'CONCOURSE' && coverage === 'COMPLETE' && peak && kstDay(peak.targetStartAt)===date) add('crowding',pc('peak',lang),`${clock(peak.targetStartAt)}–${clock(peak.targetEndAt)}`,`${pc('forecast',lang)} · KST`,at ?? undefined,finite(peak.expectedPassengers)?[`${num(peak.expectedPassengers)}${pc('peopleUnit',lang)}`]:undefined);
    // Scope counters start at zero even when the date has no collected flights.
    // A real whole-airport count is the evidence gate before exposing any scope.
    const flights = !finite(a.departuresTrackedToday) ? null : p.terminal === 'CONCOURSE' ? a.flightScope?.CONCOURSE : all ? a.departuresTrackedToday : a.departuresTrackedTodayByTerminal?.[p.terminal];
    const schedule = a.scheduledBriefing?.serviceDateKst === date && date >= summary.todayKst ? a.scheduledBriefing : undefined;
    const officialSchedule = schedule?.basis === 'OFFICIAL_DEPARTURE_SCHEDULE';
    const scheduleNote = pc(officialSchedule ? 'officialScheduleBasis' : 'scheduleBasis',lang);
    const planned = all ? schedule?.ranking.all : schedule?.ranking.byTerminal[p.terminal];
    const useSchedule = !finite(flights) && Boolean(planned?.totalFlights);
    if (finite(flights)) add('flights',pc('flights',lang),`${num(flights)}${pc('flightUnit',lang)}`,pc('flightBasis',lang) + (a.flightScope?.capped ? ` · ${pc('partial',lang)}` : ''),a.departuresTrackedTodayRetrievedAt ?? undefined);
    else if(useSchedule && planned) add('flights',pc(officialSchedule ? 'officialScheduledFlights' : 'scheduledFlights',lang),`${num(planned.totalFlights)}${pc('flightUnit',lang)}`,scheduleNote,planned.retrievedAt ?? undefined);
    const ranking = useSchedule ? planned : all ? a.airlineRanking?.all : a.airlineRanking?.byTerminal[p.terminal];
    const ranked = ranking?.airlines.filter(row=>row.registryName && finite(row.flights)).slice(0,3) ?? [];
    const airlineLines = ranked.map(row=>{
      let country = row.country ?? '';
      if(country) { try { country = new Intl.DisplayNames([lang],{type:'region',style:'short'}).of(country) ?? country; } catch { /* Retain registry code. */ } }
      return `${row.registryName}${row.countryBasis==='REGISTRY'&&country?` · ${country}`:''} · ${num(row.flights)}${pc('flightUnit',lang)} (${Math.round(row.share*100)}%)`;
    });
    if(airlineLines.length) add('airlines',pc('airlines',lang),airlineLines[0],`${useSchedule?`${scheduleNote} · `:''}${pc('airlineBasis',lang)}`,ranking?.retrievedAt ?? undefined,airlineLines.slice(1));
  } else {
    const a = summary.areas[p.location];
    if (!a) return {cards,actions};
    const now = a.realtime;
    // Today's glance and cards share the latest observation, including across
    // midnight. Keep its original timestamp/freshness; never reuse it for a selected past/future day.
    if (date === summary.todayKst && now && Number.isFinite(Date.parse(now.observedAt)) && finite(now.populationMin) && finite(now.populationMax)) {
      add('passengers',pc('current',lang),`${num(now.populationMin)}–${num(now.populationMax)}`,now.freshness === 'STALE' ? pc('stale',lang) : pc('current',lang),now.observedAt);
    }
    const rows = (a.realtimeForecast ?? []).filter(r=>kstDay(r.targetAt) === date && Date.parse(r.targetAt)>=Date.parse(summary.generatedAt) && finite(r.populationMax));
    const peak = [...rows].sort((a,b)=>b.congestionLevel-a.congestionLevel || b.populationMax-a.populationMax)[0];
    if (peak) {
      add('crowding',pc('peak',lang),`${clock(peak.targetAt)}`,pc('partial',lang),peak.retrievedAt);
      if(date !== summary.todayKst) add('passengers',pc('passengers',lang),`${num(peak.populationMin)}–${num(peak.populationMax)}`,`${clock(peak.targetAt)} KST · ${pc('partial',lang)}`,peak.retrievedAt);
    }
    const weather = (a.weather ?? []).filter(r=>kstDay(r.targetAt)===date);
    const rain = weather.map(r=>r.precipitationProbability).filter(finite);
    if(rain.length) add('weather',pc('rain',lang),`${Math.max(...rain)}%`,`${date} · ${pc('forecast',lang)}`);
    const events = (a.events ?? []).filter(r=>r.eventStart<=date && (r.eventEnd ?? r.eventStart)>=date);
    if(events.length) add('events',pc('events',lang),events.slice(0,2).map(e=>e.title).join(' · '),pc('eventNote',lang));
    if(a.foreignPresence && finite(a.foreignPresence.value)) add('foreign',pc('foreign',lang),num(a.foreignPresence.value),pc('historic',lang),a.foreignPresence.referenceAt);
    if(p.interests.includes('guidance')) add('guidance',pc('guidance',lang),pc('details',lang),pc(date<summary.todayKst?'pastNote':'guidePromise',lang));
  }
  if(date<summary.todayKst)return {cards,actions};
  if(cards.some(c=>c.interest==='crowding'||c.interest==='passengers')) actions.push(pc(p.role==='manager'?'managerPrep':p.role==='guide'?'guidePrep':'visitPrep',lang));
  if(cards.some(c=>c.interest==='flights')) actions.push(pc('flightPrep',lang));
  if(cards.some(c=>c.interest==='weather')) actions.push(pc('weatherPrep',lang));
  if(cards.some(c=>c.interest==='events')) actions.push(pc('eventPrep',lang));
  return {cards,actions:actions.slice(0,4)};
}
