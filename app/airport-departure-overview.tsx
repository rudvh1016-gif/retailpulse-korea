'use client';

import type { Lang } from './retailpulse-data';
import { LiveLoadMessage, useLiveSummary } from './live-signals';
import { usePresentationClock } from './area-demand-card';
import { DayRadarSection, DepartureMapSection, FlightSplitCard } from './airport-sides';
import { cnJpHoliday, officialHolidaysOn } from '../lib/airport-prep-holidays';
import type { AirportSidesBlock as SidesBlock } from '../lib/airport-sides-summary';
import { sidesCopy as copy } from '../lib/airport-sides-copy';

/**
 * The departure comparison on the Airport page itself: east/west flights of
 * the terminal, the official gate map with the destination-region mix, and what
 * is different today. The same parts the store briefing uses, in the place a
 * reader of the airport figures looks for them. "전체" shows both terminals, one
 * under the other, because a side is only meaningful inside one building.
 */
export function AirportDepartureOverview({ lang, terminal, date }: { lang: Lang; terminal: 'all' | 'T1' | 'T2'; date: string | null }) {
  const summary = useLiveSummary(date);
  const clock = usePresentationClock(summary?.generatedAt ?? new Date(0).toISOString());
  const head = <div className="section-head"><div>
    <p className="eyebrow">KORETAIL · FLIGHTS</p>
    <h2>{copy.overviewTitle[lang]}</h2>
  </div></div>;
  if (!summary) return <section className="airport-departure-overview" id="airport-departure-overview" data-testid="airport-departure-overview">{head}<LiveLoadMessage loading={summary === undefined} lang={lang}/></section>;
  // The device clock only moves "now" forward between refreshes; a device set hours off is ignored.
  const generated = Date.parse(summary.generatedAt);
  const now = Number.isFinite(generated) && Math.abs(clock - generated) > 2 * 3_600_000 ? generated : clock;
  const nowIso = new Date(now).toISOString();
  const sides = (summary.airport as typeof summary.airport & { sides?: SidesBlock }).sides;
  const holidays = officialHolidaysOn(summary.serviceDateKst);
  const terminals = terminal === 'all' ? (['T1', 'T2'] as const) : ([terminal] as const);
  return <section className="airport-departure-overview" id="airport-departure-overview" data-testid="airport-departure-overview" data-terminals={terminals.join(',')}>
    {head}
    <p className="section-intro">{copy.overviewIntro[lang]}</p>
    {!sides
      ? <p className="prep-note" data-testid="overview-no-flights">{copy.noFlights[lang]}</p>
      : terminals.map((item) => <div key={item} data-testid={`overview-${item}`}>
        <FlightSplitCard lang={lang} summary={summary} sides={sides} terminal={item} nowIso={nowIso}/>
        <DepartureMapSection lang={lang} summary={summary} terminal={item} nowIso={nowIso} holidays={holidays} defaultOpen/>
        <DayRadarSection lang={lang} summary={summary} terminal={item} nowIso={nowIso} holidays={holidays} isHoliday={cnJpHoliday}/>
      </div>)}
    <p className="prep-note" data-testid="sides-notice">{copy.notice[lang]}</p>
  </section>;
}
