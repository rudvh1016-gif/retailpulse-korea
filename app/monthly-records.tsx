'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { comparisonValue } from '../lib/period-comparison';
import { RECORD_AREAS, type MonthlyRecords, type RecordArea, type RecordMonth } from '../lib/monthly-records';
import { recordText } from './monthly-records-copy';
import './monthly-records.css';

const areaNames = {
  myeongdong: { ko: '명동', en: 'Myeongdong', zh: '明洞', ja: '明洞' },
  hongdae: { ko: '홍대', en: 'Hongdae', zh: '弘大', ja: '弘大' },
  seongsu: { ko: '성수', en: 'Seongsu', zh: '圣水', ja: '聖水' },
  itaewon: { ko: '이태원', en: 'Itaewon', zh: '梨泰院', ja: '梨泰院' },
};
function range(min: number | null, max: number | null, lang: Lang) {
  if (min === null || max === null) return '—';
  const locale = ({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const)[lang] ?? 'en-US';
  return `${Math.floor(min).toLocaleString(locale)}–${Math.ceil(max).toLocaleString(locale)}`;
}
function monthChoices(data: MonthlyRecords | null, selected: string) {
  if (!data) return [];
  const first = data.availableFrom?.slice(0, 7) ?? data.currentMonth;
  const result: string[] = [];
  let month = data.currentMonth;
  while (month >= first && result.length < 600) {
    result.push(month);
    const [year, number] = month.split('-').map(Number);
    month = `${number === 1 ? year - 1 : year}-${String(number === 1 ? 12 : number - 1).padStart(2, '0')}`;
  }
  if (selected && !result.includes(selected)) result.push(selected);
  return result.sort().reverse();
}
function MonthValue({ value, label, lang }: { value: RecordMonth; label: string; lang: Lang }) {
  const t = (key: Parameters<typeof recordText>[0]) => recordText(key, lang);
  return <div className="records-month-value" data-testid={`record-month-${value.month}`}>
    <span>{label} · {value.month}</span>
    <p className="records-average-label"><b>{t('metric')}</b></p>
    <strong>{range(value.min, value.max, lang)}{value.min !== null && <small> {t('unit')}</small>}</strong>
    <p className="records-coverage" data-observed-days={value.includedDays} data-eligible-days={value.expectedDays}><b>{({ko:'관측 완료',en:'Complete hourly coverage',zh:'完整观测',ja:'全時間帯観測済み'})[lang]} {value.includedDays}{t('days')}</b> / {({ko:'대상',en:'Eligible',zh:'应观测',ja:'対象'})[lang]} {value.expectedDays}{t('days')}</p>
    <p>{value.cutoff ? `${t('cutoff')} ${value.cutoff} KST` : t('none')}</p>
  </div>;
}
function DailyRanges({ value, lang }: { value: RecordMonth; lang: Lang }) {
  const t = (key: Parameters<typeof recordText>[0]) => recordText(key, lang);
  const max = Math.max(1, ...value.days.map(day => day.max ?? 0));
  return <div className="records-chart">
    <p>{t('daily')} · {value.month}</p>
    <svg viewBox="0 0 620 106" role="img" aria-label={`${t('daily')} ${value.month}. ${t('note')}`}>
      <line x1="4" x2="616" y1="101" y2="101" stroke="#ddd" />
      {value.days.map((day, i) => {
        if (day.status === 'FUTURE') return null;
        const x = 6 + i * (608 / value.days.length), width = 608 / value.days.length - 5;
        const height = day.max === null ? 0 : Math.max(1, day.max / max * 90);
        const minHeight = day.min === null ? 0 : day.min / max * 90;
        return <g key={day.date}>
          <title>{day.date}: {day.min === null ? t(day.status === 'IN_PROGRESS' ? 'progress' : day.status === 'PARTIAL' ? 'partial' : 'missing') : `${range(day.min, day.max, lang)} ${t('unit')}`}</title>
          {day.max !== null ? <><rect x={x} y={100-height} width={width} height={height} fill="#c6dddd" /><rect x={x} y={100-minHeight} width={width} height={minHeight} fill="#94bfc4" /></>
            : <line x1={x} x2={x+width} y1="95" y2="95" stroke="#555" strokeDasharray="2 2" />}
        </g>;
      })}
    </svg>
    <div className="records-chart-dates" style={{gridTemplateColumns:`repeat(${value.days.length}, minmax(0, 1fr))`}} aria-hidden="true">{[1,7,14,21,value.days.length].map(day => <span key={day} style={{gridColumn:day}}>{day}</span>)}</div>
    <p>{t('note')}</p>
  </div>;
}
export function MonthlyRecordsView({ lang, area, onArea }: { lang: Lang; area: RecordArea; onArea: (value: RecordArea) => void }) {
  const t = (key: Parameters<typeof recordText>[0]) => recordText(key, lang);
  const [month, setMonth] = useState('');
  const [retry, setRetry] = useState(0);
  const [catalog, setCatalog] = useState<MonthlyRecords | null>(null);
  const [response, setResponse] = useState<{ key: string; data: MonthlyRecords | null; error: boolean } | null>(null);
  const requestKey = `${area}/${month}/${retry}`;
  const data = response?.key === requestKey ? response.data : null;
  const error = response?.key === requestKey && response.error;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view: 'records', area });
    if (month) params.set('month', month);
    fetch(`/api/live/summary?${params}`, { signal: controller.signal }).then(async result => {
      if (!result.ok) throw new Error('records_unavailable');
      const value = await result.json() as MonthlyRecords;
      // Older cached deployments or unrelated summary payloads must not masquerade as records.
      if (value.area !== area || !Array.isArray(value.current?.days) || !Array.isArray(value.previous?.days) || !value.definition || (month && value.current.month !== month)) throw new Error('records_shape');
      if (!controller.signal.aborted) { setCatalog(value); setResponse({ key: requestKey, data: value, error: false }); }
    }).catch(() => { if (!controller.signal.aborted) setResponse({ key: requestKey, data: null, error: true }); });
    return () => controller.abort();
  }, [area, month, requestKey]);
  const choices = monthChoices(catalog, month);
  const selectedMonth = month || catalog?.current.month || '';
  return <section className="monthly-records insight-block" aria-labelledby="records-metric-title">
    <div className="records-controls">
      <label><span>{t('area')}</span><Image unoptimized className="records-select-scene" src={`/visuals/seoul-comparison/${area}-320.webp`} width="44" height="44" alt="" aria-hidden="true" loading="lazy" decoding="async"/><select value={area} onChange={event => onArea(event.target.value as RecordArea)}>{RECORD_AREAS.map(id => <option key={id} value={id}>{areaNames[id][lang] ?? areaNames[id].en}</option>)}</select></label>
      <label><span>{t('month')}</span><Image unoptimized className="records-select-scene" src="/visuals/clarity/v1/calendar-256.webp" width="44" height="44" alt="" aria-hidden="true" loading="lazy" decoding="async"/><select value={selectedMonth} disabled={!choices.length} onChange={event => setMonth(event.target.value)}>{!choices.length && <option value="">—</option>}{choices.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <div className="section-head"><div><p className="eyebrow">SEOUL · MONTHLY RECORDS</p><h2 id="records-metric-title">{t('metric')}</h2></div></div>
    <p className="records-note">{t('peopleNote')}</p>
    {!data && <p role="status">{error ? t('error') : t('loading')}{error && <button className="records-retry" onClick={() => setRetry(value => value + 1)}>{t('retry')}</button>}</p>}
    {data && <div aria-live="polite" aria-atomic="false" data-testid="monthly-records-result">
      {data.current.month === data.currentMonth && <p className="records-note">{t('pending')}</p>}
      <div className="records-comparison"><MonthValue value={data.current} label={t('selected')} lang={lang} /><MonthValue value={data.previous} label={t('previous')} lang={lang} /></div>
      <p className="records-change">{t('compare')} <b>{data.change ? comparisonValue(data.change) : '—'}</b></p>
      {(!data.change || data.current.includedDays !== data.current.expectedDays || data.previous.includedDays !== data.previous.expectedDays || data.current.includedDays !== data.previous.includedDays) && <p className="records-note">{t(data.change ? 'comparing' : 'unavailableCompare')}</p>}
      <DailyRanges value={data.current} lang={lang} />
      <details className="records-details"><summary>{t('details')}</summary><p>{t('method')}</p><p>{t('comparisonMethod')}</p>
        <p>{t('stored')}: {data.availableFrom && data.availableThrough ? `${data.availableFrom} – ${data.availableThrough} KST` : '—'}. {t('storedNote')}</p>
        <p>{t('calculated')} · <a href="https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do" target="_blank" rel="noreferrer">{t('source')}</a></p>
        <p>{t('sourceLimit')}</p>
        <p>{data.definition.areaCode ?? '—'} · {data.definition.schemaVersion ?? '—'} · Asia/Seoul</p>
      </details>
      <details className="records-details"><summary>{t('dayList')}</summary><div className="records-table-wrap"><table><caption>{data.current.month} · {t('metric')}</caption><thead><tr><th>{t('date')}</th><th>{t('coverage')}</th><th>{t('metric')}</th><th>{t('status')}</th></tr></thead><tbody>{data.current.days.filter(day => day.status !== 'FUTURE').map(day => <tr key={day.date}><th scope="row">{day.date.slice(5)}</th><td>{day.hours === null ? '—' : `${day.hours}/24`}</td><td>{range(day.min, day.max, lang)}</td><td>{t(day.status === 'COMPLETE' ? 'complete' : day.status === 'PARTIAL' ? 'partial' : day.status === 'IN_PROGRESS' ? 'progress' : 'missing')}</td></tr>)}</tbody></table></div></details>
    </div>}
  </section>;
}
