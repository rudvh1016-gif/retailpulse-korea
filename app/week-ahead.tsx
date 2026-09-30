'use client';

import type { Lang } from './retailpulse-data';
import type { LiveSummary } from './live-signals';
import type { PrepPlace } from '../lib/business-prep';
import { buildWeekAhead } from '../lib/week-ahead';
import { isPublished } from '../lib/holiday-calendar';
import { kstDay } from '../lib/demand-presentation';
import { unpublishedLine, weekCopy, weekDayLabel, weekHeadline, weekItemLine, weekLabel } from '../lib/week-copy';
import { prepTime } from '../lib/business-prep-copy';

export function WeekAheadBlock({ lang, summary, place }: { lang: Lang; summary: LiveSummary; place: PrepPlace }) {
  const week = buildWeekAhead(summary, place, summary.todayKst);
  const years = [...new Set(week.days.map((day) => Number(day.date.slice(0, 4))))];
  return <details className="prep-block prep-week" data-testid="week-ahead">
    <summary>{weekHeadline(week, lang)}</summary>
    <ol className="prep-week-days">{week.days.map((day) => <li key={day.date} data-weekend={day.weekend} data-today={day.today}>
      <span className="prep-week-date">{weekDayLabel(day.date, day.today, lang)}</span>
      <ul>{day.items.map((item, index) => <li key={index} data-label={item.label}>
        <span className="prep-week-label">{weekLabel(item.label, lang)}</span> {weekItemLine(item, lang)}
      </li>)}</ul>
    </li>)}</ol>
    {week.events && <div className="prep-week-events">
      <h4>{weekCopy.events[lang]}</h4>
      {week.events.length
        ? <ul>{week.events.map((event, index) => <li key={index}>
          <strong>{event.title}</strong>
          <span>{event.eventEnd && event.eventEnd !== event.eventStart ? `${event.eventStart}~${event.eventEnd}` : event.eventStart}</span>
          {event.place && <span>{event.place}</span>}
          {event.retrievedAt && <span>{prepTime(event.retrievedAt, kstDay(event.retrievedAt), lang)}</span>}
        </li>)}</ul>
        : <p className="prep-note" data-testid="week-no-events">{weekCopy.noEvents[lang]}</p>}
    </div>}
    <div className="prep-week-notes">
      {week.koreanHolidays === 'UNAVAILABLE' && <p className="prep-note" data-testid="week-korean-unavailable">{weekCopy.koreanUnavailable[lang]}</p>}
      {week.unpublished.flatMap((country) => years.filter((year) => !isPublished(country, `${year}-01-01`)).map((year) => <p key={`${country}${year}`} className="prep-note" data-testid="week-unpublished">{unpublishedLine(country, year, lang)}</p>))}
      {!week.weather && <p className="prep-note">{weekCopy.airport[lang]}</p>}
      <p className="prep-note">{weekCopy.population[lang]}</p>
      <p className="prep-note">{weekCopy.pastPattern[lang]}</p>
      <p className="prep-note">{weekCopy.sources[lang]}</p>
    </div>
  </details>;
}
