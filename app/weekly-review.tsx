'use client';

import { useEffect, useState } from 'react';
import type { Lang } from './retailpulse-data';
import type { LiveSummary } from './live-signals';
import type { PrepPlace } from '../lib/business-prep';
import type { IndustryId } from '../lib/industry-guidance';
import { useUsualComparison } from './business-compare';
import { buildWeeklyReview } from '../lib/weekly-review';
import { categoryName, feelingLabels, reviewCopy, tenthsPercent, verdictLabel } from '../lib/review-copy';
import { commercialActivityContext } from '../lib/commercial-context';
import { comparisonValue } from '../lib/period-comparison';
import { FEELINGS, FEELING_KEY, parseFeelings, recordFeeling, removeFeeling, type Feeling, type FeelingEntry } from '../lib/feeling-log';
import { placeKey } from '../lib/last-check';
import { placeName } from '../lib/business-prep-copy';
import { trackPersonalEvent } from '../lib/personal-analytics';

export function WeeklyReviewBlock({ lang, summary, place, industry }: { lang: Lang; summary: LiveSummary; place: PrepPlace; industry: IndustryId }) {
  const usual = useUsualComparison(place.kind === 'area' && summary.dayRelation === 'TODAY' ? place.area : null);
  const review = buildWeeklyReview(summary, place, industry, usual);
  return <details className="prep-block prep-review" data-testid="weekly-review">
    <summary>{reviewCopy.title[lang]}</summary>
    {review.population && <div className="prep-review-part">
      <h4>{reviewCopy.population[lang]}</h4>
      <ul>{review.population.map((row) => <li key={row.weeks} data-verdict={row.verdict ?? ''}>{reviewCopy.weeksAgo[row.weeks][lang]}{row.date ? ` (${row.date.slice(5).replace('-', '/')})` : ''}: {verdictLabel(row.verdict, lang)}</li>)}</ul>
    </div>}
    {review.subway && <div className="prep-review-part">
      <h4>{reviewCopy.subway[lang]}</h4>
      <ul>
        <li>{reviewCopy.lastWeek[lang]}: {tenthsPercent(review.subway.lastWeekTenths, lang)}</li>
        <li>{reviewCopy.fourWeek[lang]}: {tenthsPercent(review.subway.fourWeekTenths, lang)}</li>
      </ul>
      <p className="prep-note">{review.subway.referenceDate}{review.subway.stations ? ` · ${review.subway.stations}` : ''}</p>
    </div>}
    {review.categories && <div className="prep-review-part">
      <h4>{reviewCopy.categories[lang]}</h4>
      {review.categories.mapped.length
        ? <>
          <ul>{review.categories.mapped.map((category) => {
            const found = review.categories!.rows.find((row) => row.category === category);
            const level = found?.level ? commercialActivityContext(found.level, lang) : null;
            return <li key={category}>{categoryName(category, lang)}: {level ?? reviewCopy.unavailable[lang]}</li>;
          })}</ul>
          <p className="prep-note">{reviewCopy.mapped[lang]}: {review.categories.mapped.map((category) => categoryName(category, lang)).join(', ')}</p>
        </>
        : <p className="prep-note">{reviewCopy.noCategory[lang]}</p>}
      <p className="prep-note">{reviewCopy.categoriesNote[lang]}</p>
    </div>}
    {review.quarterly && (review.quarterly.salesQuarter || review.quarterly.storeQuarter) && <div className="prep-review-part">
      <h4>{reviewCopy.quarterly[lang]}</h4>
      <ul>
        {review.quarterly.salesQuarter && <li>{reviewCopy.salesQuarter[lang]}: {review.quarterly.salesQuarter}</li>}
        {review.quarterly.storeQuarter && <li>{reviewCopy.storeQuarter[lang]}: {review.quarterly.storeQuarter}</li>}
      </ul>
    </div>}
    {review.airport && <div className="prep-review-part">
      <h4>{reviewCopy.airport[lang]} · {review.airport.terminal}</h4>
      <ul>{([7, 28] as const).map((days) => <li key={days}>{days}: {reviewCopy.passengers[lang]} {review.airport!.passengers[days] ? comparisonValue(review.airport!.passengers[days]!) : reviewCopy.unavailable[lang]} · {reviewCopy.flights[lang]} {review.airport!.flights[days] ? comparisonValue(review.airport!.flights[days]!) : reviewCopy.unavailable[lang]}</li>)}</ul>
    </div>}
  </details>;
}

function readFeelings(today: string): FeelingEntry[] | null {
  try { return parseFeelings(window.localStorage.getItem(FEELING_KEY), today); } catch { return null; }
}

export function FeelingLogBlock({ lang, place, industry, today }: { lang: Lang; place: PrepPlace; industry: IndustryId; today: string }) {
  const [entries, setEntries] = useState<FeelingEntry[] | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const key = placeKey(place);
  useEffect(() => {
    const timer = window.setTimeout(() => setEntries(readFeelings(today)), 0);
    return () => window.clearTimeout(timer);
  }, [today]);
  if (entries === undefined) return null;
  const write = (next: FeelingEntry[]) => {
    try { window.localStorage.setItem(FEELING_KEY, JSON.stringify(next)); setEntries(next); return true; } catch { setEntries(null); return false; }
  };
  const current = entries?.find((entry) => entry.date === today && entry.place === key && entry.industry === industry)?.feeling ?? null;
  const choose = (feeling: Feeling) => {
    if (!entries) return;
    if (write(recordFeeling(entries, { date: today, place: key, industry, feeling }, today))) {
      setSaved(true);
      trackPersonalEvent('business_feeling_recorded', { language: lang, location: place.kind === 'airport' ? 'airport' : place.area, day: 'today' });
    }
  };
  return <div className="prep-block prep-feeling" data-testid="feeling-log">
    <h3>{reviewCopy.feelingTitle[lang]}</h3>
    {entries === null ? <p className="prep-note">{reviewCopy.storageBlocked[lang]}</p> : <>
      <div className="prep-feeling-choices" role="group" aria-label={reviewCopy.feelingTitle[lang]}>
        {FEELINGS.map((feeling) => <button key={feeling} type="button" aria-pressed={current === feeling} onClick={() => choose(feeling)}>{feelingLabels[feeling][lang]}</button>)}
      </div>
      <p className="prep-note" role="status" aria-live="polite">{saved ? reviewCopy.saved[lang] : ''}</p>
      {entries.length > 0 && <details className="prep-evidence"><summary>{reviewCopy.recent[lang]}</summary>
        <ul className="prep-feeling-list">{[...entries].reverse().slice(0, 7).map((entry) => <li key={`${entry.date}${entry.place}${entry.industry}`}>
          <span>{entry.date.slice(5).replace('-', '/')} · {entry.place.startsWith('airport:') ? placeName({ kind: 'airport', terminal: entry.place.slice(8, 10) as 'T1' | 'T2', side: (entry.place.slice(11) || null) as 'EAST' | 'WEST' | null }, lang) : placeName({ kind: 'area', area: entry.place.slice(5) as 'myeongdong' }, lang)} · {feelingLabels[entry.feeling][lang]}</span>
          <button type="button" onClick={() => write(removeFeeling(entries, entry.date, entry.place, entry.industry))}>{reviewCopy.remove[lang]}</button>
        </li>)}</ul>
      </details>}
    </>}
    <p className="prep-note">{reviewCopy.feelingNote[lang]}</p>
  </div>;
}
