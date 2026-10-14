/**
 * The personal briefing's choices and the parser for the saved choice.
 *
 * Moved verbatim from ./personal-briefing, which re-exports all of it: the
 * analytics consent and the shell read the saved choice on every page, and
 * importing it from there also downloaded the briefing's copy in four
 * languages (./personal-copy), which only the briefing itself shows.
 */
export const roles = ['tourist','manager','guide'] as const;
export const locations = ['airport','myeongdong','hongdae','seongsu','itaewon'] as const;
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
