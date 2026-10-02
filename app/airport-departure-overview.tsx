'use client';

import { useEffect, useRef, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { LiveLoadMessage, useLiveSummary } from './live-signals';
import { usePresentationClock } from './area-demand-card';
import { DayRadarSection, DepartureMapSection, FlightSplitCard } from './airport-sides';
import { cnJpHoliday, officialHolidaysOn } from '../lib/airport-prep-holidays';
import type { AirportSidesBlock as SidesBlock } from '../lib/airport-sides-summary';
import { sidesCopy as copy } from '../lib/airport-sides-copy';
// Styles: app/airport-visual.css, imported once by app/retailpulse-app.tsx (this
// module is now loaded by live-signals.tsx, which the node tests import).

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
  const [picked, setPicked] = useState<Terminal>('T1');
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setNear(true); }, { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  const shown: Terminal = terminal === 'all' ? picked : terminal;
  const head = <div className="section-head"><div>
    <p className="eyebrow">KORETAIL · FLIGHTS</p>
    <h2>{copy.overviewTitle[lang]}</h2>
  </div></div>;
  const frame = (body: React.ReactNode) => <section ref={ref} className="airport-departure-overview" id="airport-departure-overview" data-testid="airport-departure-overview" data-terminals={near ? shown : ''}>{head}{body}</section>;
  if (!near || !summary) return frame(<LiveLoadMessage loading={summary !== null} lang={lang}/>);
  // The device clock only moves "now" forward between refreshes; a device set hours off is ignored.
  const generated = Date.parse(summary.generatedAt);
  const now = Number.isFinite(generated) && Math.abs(clock - generated) > 2 * 3_600_000 ? generated : clock;
  const nowIso = new Date(now).toISOString();
  const sides = (summary.airport as typeof summary.airport & { sides?: SidesBlock }).sides;
  const holidays = officialHolidaysOn(summary.serviceDateKst);
  return frame(<>
    <p className="section-intro">{copy.overviewIntro[lang]}</p>
    {terminal === 'all' && <div role="group" className="av-overview-switch" aria-label={copy.overviewSwitch[lang]} data-testid="overview-switch">
      {(['T1', 'T2'] as const).map((item) => <button key={item} type="button" aria-pressed={picked === item} aria-label={`${copy.overviewSwitchTo[lang]} ${item}`} onClick={() => setPicked(item)}>{item}</button>)}
    </div>}
    {!sides
      ? <p className="prep-note" data-testid="overview-no-flights">{copy.noFlights[lang]}</p>
      : <div key={shown} data-testid={`overview-${shown}`}>
        <FlightSplitCard lang={lang} summary={summary} sides={sides} terminal={shown} nowIso={nowIso}/>
        <DepartureMapSection lang={lang} summary={summary} terminal={shown} nowIso={nowIso} holidays={holidays} defaultOpen/>
        <DayRadarSection lang={lang} summary={summary} terminal={shown} nowIso={nowIso} holidays={holidays} isHoliday={cnJpHoliday}/>
      </div>}
    <p className="prep-note" data-testid="sides-notice">{copy.notice[lang]}</p>
  </>);
}
