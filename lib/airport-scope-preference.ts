export type AirportScope = 'all' | 'T1' | 'T2' | 'CONCOURSE';
export const AIRPORT_SCOPE_KEY = 'koretail-airport-scope';
export function validAirportScope(value: unknown): value is AirportScope {
  return value === 'all' || value === 'T1' || value === 'T2' || value === 'CONCOURSE';
}
export function readAirportScope(query: URLSearchParams, storage: Pick<Storage, 'getItem'> | null, historyState?: unknown): AirportScope {
  if (query.has('building') || query.has('terminal')) {
    if (query.get('building') === 'CONCOURSE') return 'CONCOURSE';
    const terminal = query.get('terminal');
    return validAirportScope(terminal) ? terminal : 'all';
  }
  const previous = historyState && typeof historyState === 'object' && 'koretailAirportScope' in historyState
    ? historyState.koretailAirportScope : null;
  if (validAirportScope(previous)) return previous;
  try {
    const saved = storage?.getItem(AIRPORT_SCOPE_KEY);
    return validAirportScope(saved) ? saved : 'all';
  } catch { return 'all'; }
}
export function saveAirportScope(scope: AirportScope) {
  try { window.localStorage.setItem(AIRPORT_SCOPE_KEY, scope); } catch { /* Optional device preference. */ }
}
export function deviceAirportScope(historyState?: unknown) {
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* Storage may be disabled. */ }
  return readAirportScope(new URLSearchParams(window.location.search), storage, historyState);
}

/** Keep an unqueried All (or a preference-backed entry) stable across Back/Forward. */
export function pushAirportHistory(history: Pick<History, 'state' | 'replaceState' | 'pushState'>,
  url: string, current: AirportScope, next: AirportScope = current) {
  const retained = history.state && typeof history.state === 'object' ? history.state : {};
  history.replaceState({ ...retained, koretailAirportScope: current }, '');
  history.pushState({ koretailAirportScope: next }, '', url);
}
