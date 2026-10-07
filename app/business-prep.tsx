'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { useLiveSummary, LiveLoadMessage } from './live-signals';
import { usePresentationClock } from './area-demand-card';
import { saveBusinessPreferences, useBusinessPreferences } from './business-preferences';
import { buildBusinessPrep, prepInputFromSummary, type BusinessHours, type PrepArea, type PrepFact, type PrepPlace, type PrepSource } from '../lib/business-prep';
import { HOUR_CHOICES, type BusinessPreferences } from '../lib/business-preferences';
import { actionText, coverageLine, evidenceText, factLine, hoursLabel, isWholeDayFact, levelName, limitLine, placeName, prepCopy, prepSpan, sideNames, statusLine } from '../lib/business-prep-copy';
import { industryProfiles, type IndustryId } from '../lib/industry-guidance';
import { snapshotOf } from '../lib/last-check';
import { LastCheckBlock, UsualComparisonBlock } from './business-compare';
import { PrepShare } from './prep-share';
import { buildShareDocument, shareLink } from '../lib/prep-share';
import { siteOrigin } from './seo-config';
import { WeekAheadBlock } from './week-ahead';
import { AirportSidesBlock } from './airport-sides';
import { FeelingLogBlock, WeeklyReviewBlock } from './weekly-review';
import { trackPersonalEvent } from '../lib/personal-analytics';
import { placeKey } from '../lib/last-check';
import { cnJpHoliday, officialHolidaysOn } from '../lib/airport-prep-holidays';
import { PrepSymbolScene, type PrepSymbolKind } from './prep-symbol-scene';
import './prep-scenes.css';

const prepText = (lang: Lang, ko: string, en: string, zh: string, ja: string) => ({ ko, en, zh, ja })[lang];

function AreaPrepFact({ fact, serviceDate, lang }: { fact: PrepFact; serviceDate: string; lang: Lang }) {
  let scene: PrepSymbolKind;
  let title: string;
  let value: string;
  let source: PrepSource;
  switch (fact.kind) {
    case 'CROWD_MAX':
      scene = 'crowd'; source = 'SEOUL_FORECAST';
      title = prepText(lang, '최고 혼잡 예측', 'Highest crowd forecast', '最高拥挤预测', '最高混雑予測');
      value = `${levelName(fact.level, lang)} · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`;
      break;
    case 'RAIN_MAX':
      scene = 'rain'; source = 'KMA_FORECAST';
      title = prepText(lang, '최고 강수확률', 'Highest rain probability', '最高降水概率', '最高降水確率');
      value = `${fact.percent}% · ${prepSpan(fact.startAt, fact.endAt, serviceDate, lang)}`;
      break;
    case 'TEMPERATURE_RANGE':
      scene = 'temperature'; source = 'KMA_FORECAST';
      title = prepText(lang, '기온 예보', 'Temperature forecast', '气温预报', '気温予報');
      value = fact.minC === fact.maxC ? `${fact.minC}°C` : `${fact.minC}–${fact.maxC}°C`;
      break;
    case 'EVENTS':
      scene = 'event'; source = 'TOURAPI_EVENTS';
      title = prepText(lang, '근처 공식 행사', 'Official events nearby', '附近官方活动', '近くの公式イベント');
      value = prepText(lang, `${fact.count}건`, `${fact.count} event(s)`, `${fact.count}项`, `${fact.count}件`);
      break;
    case 'HOLIDAY':
      scene = 'holiday'; source = 'HOLIDAY_CALENDAR';
      title = prepText(lang, '공식 공휴일', 'Official public holiday', '官方假日', '公式の祝日');
      value = factLine(fact, serviceDate, lang);
      break;
    default:
      return <>{factLine(fact, serviceDate, lang)}</>;
  }
  return <>
    <PrepSymbolScene kind={scene} lang={lang}/>
    <div><h4 className="prep-fact-title">{title}</h4><p className="prep-fact-value">{value}</p>
      <details className="prep-fact-detail"><summary>{prepText(lang, '자료와 한계', 'Source and limits', '资料与局限', '資料と限界')}</summary>
        <p>{factLine(fact, serviceDate, lang)}</p><p>{limitLine(source, lang)}</p>
      </details>
    </div>
  </>;
}

/** Analytics context: only enumerated values, never hours, names or free text. */
export function prepAnalytics(lang: Lang, place: PrepPlace, serviceDate: string, todayKst: string) {
  const shift = (days: number) => new Date(Date.parse(`${todayKst}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const day = serviceDate === todayKst ? 'today' : serviceDate === shift(1) ? 'tomorrow' : serviceDate === shift(-1) ? 'yesterday' : undefined;
  return { language: lang, location: place.kind === 'airport' ? 'airport' : place.area, ...(day ? { day } : {}) };
}

/** Where the reader's store is: the area tab, or an airport terminal they chose. */
export function prepPlaceOf(preferences: BusinessPreferences, area: PrepArea): PrepPlace {
  return preferences.place === 'airport' ? { kind: 'airport', terminal: preferences.terminal, side: preferences.side } : { kind: 'area', area };
}

function Conditions({ lang, place, preferences, saved, storageFailed, industry, onIndustryChange }: {
  lang: Lang; place: PrepPlace; preferences: BusinessPreferences; saved: boolean; storageFailed: boolean;
  industry: IndustryId; onIndustryChange: (value: IndustryId) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [wholeDay, setWholeDay] = useState(preferences.hours === null);
  const [openAt, setOpenAt] = useState(preferences.hours?.open ?? '10:00');
  const [closeAt, setCloseAt] = useState(preferences.hours?.close ?? '22:00');
  const [terminal, setTerminal] = useState(preferences.terminal);
  const [side, setSide] = useState(preferences.side);
  const start = () => {
    setWholeDay(preferences.hours === null);
    setOpenAt(preferences.hours?.open ?? '10:00');
    setCloseAt(preferences.hours?.close ?? '22:00');
    setTerminal(preferences.terminal);
    setSide(preferences.side);
    setOpen(true);
  };
  const save = () => {
    const hours: BusinessHours | null = wholeDay ? null : { open: openAt, close: closeAt };
    saveBusinessPreferences({ version: 1, place: preferences.place, terminal, side, hours });
    trackPersonalEvent('business_hours_saved', { language: lang, location: place.kind === 'airport' ? 'airport' : place.area });
    setOpen(false);
  };
  return <div className="prep-conditions">
    <p className="prep-conditions-line">
      <span className="prep-conditions-label">{prepCopy.conditions[lang]}</span>
      <span data-testid="prep-place">{placeName(place, lang)}</span>
      <span aria-hidden="true">·</span>
      <span data-testid="prep-industry">{industryProfiles[industry].label[lang]}</span>
      <span aria-hidden="true">·</span>
      <span data-testid="prep-hours">{hoursLabel(preferences.hours, lang)}</span>
      <button type="button" className="prep-change" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => (open ? setOpen(false) : start())}>{open ? prepCopy.close[lang] : prepCopy.change[lang]}</button>
    </p>
    {open && <form id={`${id}-form`} className="prep-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
      {place.kind === 'airport' && <fieldset className="prep-terminal">
        <legend>{prepCopy.terminal[lang]}</legend>
        {(['T1', 'T2'] as const).map((value) => <label key={value}><input type="radio" name={`${id}-terminal`} value={value} checked={terminal === value} onChange={() => setTerminal(value)}/>{value}</label>)}
      </fieldset>}
      {place.kind === 'airport' && <fieldset className="prep-terminal" data-testid="prep-side">
        <legend>{prepCopy.side[lang]}</legend>
        {([null, 'EAST', 'WEST'] as const).map((value) => <label key={value ?? 'all'}><input type="radio" name={`${id}-side`} value={value ?? 'all'} checked={side === value} onChange={() => setSide(value)}/>{value ? sideNames[value][lang] : prepCopy.wholeTerminal[lang]}</label>)}
      </fieldset>}
      <label className="prep-field">{prepCopy.industry[lang]}
        <select value={industry} onChange={(event) => onIndustryChange(event.target.value as IndustryId)}>
          {(Object.keys(industryProfiles) as IndustryId[]).map((value) => <option key={value} value={value}>{industryProfiles[value].label[lang]}</option>)}
        </select>
      </label>
      <label className="prep-check"><input type="checkbox" checked={wholeDay} onChange={(event) => setWholeDay(event.target.checked)}/>{prepCopy.wholeDayOption[lang]}</label>
      {!wholeDay && <div className="prep-hours">
        <label className="prep-field">{prepCopy.open[lang]}
          <select value={openAt} onChange={(event) => setOpenAt(event.target.value)}>{HOUR_CHOICES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </label>
        <label className="prep-field">{prepCopy.closeTime[lang]}
          <select value={closeAt} onChange={(event) => setCloseAt(event.target.value)}>{HOUR_CHOICES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </label>
      </div>}
      <p className="prep-note">{prepCopy.deviceOnly[lang]}</p>
      <button type="submit" className="prep-save">{prepCopy.save[lang]}</button>
    </form>}
    {storageFailed && saved && <p className="prep-note" role="status">{prepCopy.storageBlocked[lang]}</p>}
  </div>;
}

export function BusinessPrep({ lang, area, industry, onIndustryChange, date }: {
  lang: Lang; area: PrepArea; industry: IndustryId; onIndustryChange: (value: IndustryId) => void; date: string | null;
}) {
  const id = useId();
  const summary = useLiveSummary(date);
  const { ready, saved, preferences, storageFailed } = useBusinessPreferences();
  const clock = usePresentationClock(summary?.generatedAt ?? new Date(0).toISOString());
  // The service date is always the server's. The device clock only moves
  // "now" forward between refreshes; a device set hours off is ignored.
  const generated = summary ? Date.parse(summary.generatedAt) : NaN;
  const now = Number.isFinite(generated) && Math.abs(clock - generated) > 2 * 3_600_000 ? generated : clock;
  const place = prepPlaceOf(preferences, area);
  const nowIso = new Date(now).toISOString();
  // China's and Japan's official holidays on the service date; Korea's come in the summary.
  const officialHolidays = summary ? officialHolidaysOn(summary.serviceDateKst) : [];
  const input = summary && ready ? prepInputFromSummary(summary, place, preferences.hours, nowIso, officialHolidays) : null;
  const prep = input ? buildBusinessPrep(input) : null;
  const snapshot = input && prep && prep.status !== 'PAST' && prep.status !== 'ENDED' ? snapshotOf(input, prep, nowIso) : null;
  const serviceDate = summary?.serviceDateKst ?? '';
  // One valid view per date, place, language and verdict: a view counts only
  // once the prep has data behind it, never while loading or on an error.
  const viewed = useRef<string | null>(null);
  const viewKey = prep && summary ? `${serviceDate}|${placeKey(place)}|${lang}|${prep.status}` : null;
  useEffect(() => {
    if (!viewKey || !prep || !summary || viewed.current === viewKey) return;
    viewed.current = viewKey;
    trackPersonalEvent('business_prep_viewed', { ...prepAnalytics(lang, place, serviceDate, summary.todayKst), prep_status: prep.status });
    // viewKey already names everything this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  return <section className="business-prep" data-testid="business-prep" data-place={place.kind} aria-labelledby={`${id}-title`}>
    <div className="section-head"><div>
      <p className="eyebrow">KORETAIL · {prepCopy.eyebrow[lang]}</p>
      <h2 id={`${id}-title`}>{prepCopy.title[lang]}</h2>
    </div></div>
    <Conditions key={`${preferences.place}:${preferences.terminal}:${preferences.side ?? ''}:${preferences.hours?.open ?? ''}:${preferences.hours?.close ?? ''}`}
      lang={lang} place={place} preferences={preferences} saved={saved} storageFailed={storageFailed} industry={industry} onIndustryChange={onIndustryChange}/>
    {!summary || !prep ? <LiveLoadMessage loading={summary === undefined || !ready} lang={lang}/> : <>
      <div className="prep-block">
        <h3>{prepCopy.factsTitle[lang]}</h3>
        {/* The whole-day east/west flight comparison is the card at the top of the airport block (same sentences as the shared text and image). */}
        {prep.facts.some((fact) => !isWholeDayFact(fact))
          ? <ul className="prep-facts" data-testid="prep-facts" key={`${serviceDate}:${place.kind === 'area' ? place.area : place.terminal}:${preferences.hours?.open ?? ''}:${preferences.hours?.close ?? ''}`}>{prep.facts.filter((fact) => !isWholeDayFact(fact)).map((fact, index) => <li key={index} data-fact={fact.kind}>{place.kind === 'area'
            ? <AreaPrepFact fact={fact} serviceDate={serviceDate} lang={lang}/>
            : factLine(fact, serviceDate, lang)}</li>)}</ul>
          : prep.status === 'PAST' || prep.status === 'ENDED' ? null : <p className="prep-empty">{prepCopy.noFacts[lang]}</p>}
        {prep.coverage.map((entry) => coverageLine(entry, serviceDate, lang)).filter(Boolean).map((line, index) => <p key={index} className="prep-coverage">{line}</p>)}
      </div>
      {place.kind === 'airport' && <AirportSidesBlock lang={lang} summary={summary} terminal={place.terminal} side={place.side ?? null} hours={preferences.hours} nowIso={nowIso} holidays={officialHolidays} isHoliday={cnJpHoliday}/>}
      {prep.status !== 'PAST' && <UsualComparisonBlock lang={lang} place={place} today={summary.dayRelation === 'TODAY'}/>}
      <LastCheckBlock lang={lang} snapshot={snapshot} serviceDate={serviceDate} nowIso={nowIso}/>
      <div className="prep-block">
        <h3>{prepCopy.actionsTitle[lang]}</h3>
        {prep.actions.length ? <ol className="prep-actions" data-testid="prep-actions">{prep.actions.map((action, index) => {
          const text = actionText(action, serviceDate, industry, lang);
          const evidence = evidenceText(action, serviceDate, lang);
          return <li key={index} data-rule={action.rule}>
            <p className="prep-action-title">{text.title}</p>
            {place.kind === 'airport' && <><p>{text.body}</p>
              {text.industryHint && <p className="prep-industry-hint"><strong>{prepCopy.industryCheck[lang]}</strong> {text.industryHint}</p>}</>}
            <details className={`prep-evidence${place.kind === 'area' ? ' prep-action-detail' : ''}`}><summary>{place.kind === 'area'
              ? prepText(lang, '실행 방법과 근거', 'Steps and basis', '执行方法与依据', '実行方法と根拠') : prepCopy.evidence[lang]}</summary>
              {place.kind === 'area' && <><p>{text.body}</p>
                {text.industryHint && <p className="prep-industry-hint"><strong>{prepCopy.industryCheck[lang]}</strong> {text.industryHint}</p>}</>}
              <dl>
              <dt>{prepCopy.condition[lang]}</dt><dd>{evidence.condition}</dd>
              <dt>{prepCopy.dataUsed[lang]}</dt><dd>{evidence.data}</dd>
              <dt>{prepCopy.issuedAt[lang]}</dt><dd>{evidence.issued}</dd>
              <dt>{prepCopy.target[lang]}</dt><dd>{evidence.target}</dd>
              <dt>{prepCopy.limit[lang]}</dt><dd>{evidence.limit}</dd>
            </dl></details>
          </li>;
        })}</ol> : null}
        {(!prep.actions.length || prep.hourlyStatus !== 'ACTIONS') && <p className="prep-status" data-testid="prep-status" data-status={prep.actions.length ? prep.hourlyStatus : prep.status}>
          {statusLine(prep.actions.length ? prep.hourlyStatus : prep.status, lang)}
        </p>}
        <p className="prep-note">{prepCopy.standing[lang]}</p>
      </div>
      {prep.status !== 'PAST' && prep.status !== 'ENDED' && <PrepShare
        lang={lang}
        fileName={`koretail-${serviceDate}-${place.kind === 'airport' ? `airport-${place.terminal}` : place.area}.png`}
        doc={buildShareDocument({ prep, serviceDate, place, industry, hours: preferences.hours, lang, link: shareLink(siteOrigin, lang, serviceDate), savedAt: nowIso })}
        analytics={prepAnalytics(lang, place, serviceDate, summary.todayKst)}
      />}
      {summary.dayRelation === 'TODAY' && <WeekAheadBlock lang={lang} summary={summary} place={place}/>}
      {summary.dayRelation !== 'PAST' && <WeeklyReviewBlock lang={lang} summary={summary} place={place} industry={industry}/>}
      {summary.dayRelation === 'TODAY' && <FeelingLogBlock lang={lang} place={place} industry={industry} today={summary.todayKst}/>}
    </>}
  </section>;
}
