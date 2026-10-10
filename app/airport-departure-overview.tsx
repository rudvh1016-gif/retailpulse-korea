'use client';

import { useEffect, useRef, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { LiveLoadMessage, useLiveSummary } from './live-signals';
import { usePresentationClock } from './area-demand-card';
import { DayRadarSection, DepartureMapSection } from './airport-sides';
import { cnJpHoliday, officialHolidaysOn } from '../lib/airport-prep-holidays';
import type { AirportSidesBlock as SidesBlock } from '../lib/airport-sides-summary';
import { sidesCopy as copy } from '../lib/airport-sides-copy';
import './airport-visual.css';
import './airport-scene-model.css';
import { useAirportModelTarget } from './use-airport-model-target';

type Terminal = 'T1' | 'T2';

/**
 * The departure comparison on the Airport page itself: east/west flights of
 * the terminal, the official gate map with the destination-region mix, and what
 * is different today. The same parts the store briefing uses, in the place a
 * reader of the airport figures looks for them.
 *
 * It is heavy (a gate map and its list are most of the page's elements), so it
 * mounts only when the reader scrolls near it, and for "전체" shows one
 * terminal at a time with a switch: a side is only meaningful inside one
 * building anyway.
 */
export function AirportDepartureOverview({ lang, terminal, date }: { lang: Lang; terminal: 'all' | Terminal; date: string | null }) {
  const summary = useLiveSummary(date);
  const clock = usePresentationClock(summary?.generatedAt ?? new Date(0).toISOString());
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const modelTarget = useAirportModelTarget('airport-departure-model-slot');
  const ready = near || Boolean(modelTarget);
  useEffect(() => {
    const node = ref.current;
    if (!node || ready) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setNear(true); }, { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);
  const shown: Terminal = terminal === 'all' ? 'T1' : terminal;
  const frame = (body: React.ReactNode) => <section ref={ref} className="airport-departure-overview" data-testid="airport-departure-overview" data-terminals={ready ? terminal : ''}>{body}</section>;
  if (!ready || !summary) return frame(<LiveLoadMessage loading={summary !== null} lang={lang}/>);
  // The device clock only moves "now" forward between refreshes; a device set hours off is ignored.
  const generated = Date.parse(summary.generatedAt);
  const now = Number.isFinite(generated) && Math.abs(clock - generated) > 2 * 3_600_000 ? generated : clock;
  const nowIso = new Date(now).toISOString();
  const sides = (summary.airport as typeof summary.airport & { sides?: SidesBlock }).sides;
  const holidays = officialHolidaysOn(summary.serviceDateKst);
  return frame(<>
    {!sides
      ? <><p className="prep-note" data-testid="overview-no-flights">{copy.noFlights[lang]}</p><DepartureMapSection lang={lang} summary={summary} terminal={shown} nowIso={nowIso} holidays={holidays} defaultBuildingScope={terminal} modelPlacement="airport-departure-model-slot"/></>
      : <div key={shown} data-testid={`overview-${shown}`}>
        <DepartureMapSection lang={lang} summary={summary} terminal={shown} nowIso={nowIso} holidays={holidays} defaultBuildingScope={terminal} modelPlacement="airport-departure-model-slot"/>
        <DayRadarSection lang={lang} summary={summary} terminal={shown} nowIso={nowIso} holidays={holidays} isHoliday={cnJpHoliday}/>
        {terminal==='all'&&<DayRadarSection lang={lang} summary={summary} terminal="T2" nowIso={nowIso} holidays={holidays} isHoliday={cnJpHoliday}/>}
      </div>}
    <p className="prep-note" data-testid="sides-notice">{copy.notice[lang]}</p>
  </>);
}
