'use client';

import {useState, useSyncExternalStore, type ReactNode} from 'react';
import {airportAudience, airportAudienceCopy, airportAudienceUrl, type AirportAudience} from '../lib/airport-audience';
import './airport-audience-view.css';

const changeEvent = 'koretail-airport-audience';
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(changeEvent, listener);
  };
}
const readAudience = () => airportAudience(window.location.search);
const serverAudience = (): AirportAudience => 'passenger';

export function AirportAudienceView({lang, enabled, passenger, children}: {
  lang: string; enabled: boolean; passenger: ReactNode; children: ReactNode;
}) {
  const audience = useSyncExternalStore(subscribe, readAudience, serverAudience);
  const [staffVisited, setStaffVisited] = useState(false);
  // Mount staff data only on first access, then retain its filters across switches.
  if (enabled && audience === 'staff' && !staffVisited) setStaffVisited(true);
  const c = airportAudienceCopy(lang);
  if (!enabled) return <>{children}</>;

  function choose(next: AirportAudience) {
    if (readAudience() === next) return;
    window.history.pushState({}, '', airportAudienceUrl(new URL(window.location.href), next));
    window.dispatchEvent(new Event(changeEvent));
  }

  return <>
    <div className="airport-audience-choice" role="group" aria-label={c.choice}>
      {(['passenger', 'staff'] as const).map(item => <button key={item} type="button"
        id={`airport-audience-${item}`} aria-pressed={audience === item}
        aria-controls={`airport-${item}-panel`} onClick={() => choose(item)}>{c[item]}</button>)}
    </div>
    <div id="airport-passenger-panel" className="airport-audience-panel" hidden={audience !== 'passenger'}
      role="region" aria-labelledby="airport-audience-passenger">{passenger}</div>
    <div id="airport-staff-panel" className="airport-audience-panel" hidden={audience !== 'staff'}
      role="region" aria-labelledby="airport-audience-staff">{staffVisited ? children : null}</div>
  </>;
}
