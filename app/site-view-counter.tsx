'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { Lang } from './retailpulse-data';
import { parsePageviewsDisplay, pageviewsKstDay, untilPageviewsMidnight, type PageviewsDisplay } from '../lib/pageviews-display';
import { getPageviewsSnapshot, subscribePageviews } from '../lib/pageviews-client';
import './site-view-counter.css';

const copy = {
  ko: { unavailable: '누적 조회수 확인 불가', gap: '집계 일부 누락으로 누적 조회수를 표시하지 않습니다.', today: '오늘 조회수', total: '누적 조회수', since: '집계 시작', details: '누적 조회수와 집계 기준', definition: '통계 수집이 허용된 페이지 조회 횟수로, 새로고침도 포함합니다. 방문자 수가 아니며 오늘은 한국 시간 기준입니다.' },
  en: { unavailable: 'Total views unavailable', gap: 'Total views are withheld because some counts are missing.', today: 'Today’s views', total: 'Total views', since: 'Counting since', details: 'Total views and counting details', definition: 'Page views permitted by analytics preferences, including reloads—not unique visitors. Today follows Korea time.' },
  zh: { unavailable: '累计浏览量不可用', gap: '因部分统计缺失，暂不显示累计浏览量。', today: '今日浏览量', total: '累计浏览量', since: '统计开始', details: '累计浏览量与统计说明', definition: '统计偏好允许的页面浏览次数（含刷新），并非独立访客人数。今日以韩国时间为准。' },
  ja: { unavailable: '累計閲覧数は確認できません', gap: '集計に一部欠落があるため、累計閲覧数を表示しません。', today: '今日の閲覧数', total: '累計閲覧数', since: '集計開始', details: '累計閲覧数と集計基準', definition: '統計収集が許可されたページ閲覧回数（再読み込みを含む）で、訪問者数ではありません。今日は韓国時間基準です。' },
} satisfies Record<Lang, Record<string, string>>;
const locales = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' };

// A one-shot midnight timer and visibility wake-up invalidate yesterday's value.
// No polling, extra requests, or synthetic reset to zero.
function subscribeKstDay(listener: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => { listener(); schedule(); }, untilPageviewsMidnight());
  };
  const wake = () => { clearTimeout(timer); listener(); schedule(); };
  schedule();
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', wake);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('pageshow', wake);
  };
}

export function SiteViewCounter({ lang }: { lang: Lang }) {
  const snapshot = useSyncExternalStore(subscribePageviews, getPageviewsSnapshot, () => null);
  const day = useSyncExternalStore(subscribeKstDay, pageviewsKstDay, () => '');
  const counts = parsePageviewsDisplay(snapshot);
  if (!counts || counts.day !== day) return null;
  return <SiteViewCounterContent lang={lang} counts={counts} />;
}

function SiteViewCounterContent({ lang, counts }: { lang: Lang; counts: PageviewsDisplay }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const text = copy[lang];
  const number = new Intl.NumberFormat(locales[lang]);
  const started = new Intl.DateTimeFormat(locales[lang], { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(counts.startedAt));
  return <div className="site-view-counter" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={button} type="button" className="site-view-counter-button" aria-expanded={open} aria-controls={id}
      aria-label={`${text.today}: ${number.format(counts.today)}. ${text.details}`}
      onClick={() => setOpen(value => !value)}>
      <span className="site-view-counter-today"><span>{text.today}</span><strong>{number.format(counts.today)}</strong></span>
      <span className="site-view-counter-desktop-total"><span>{text.total}</span><strong aria-label={counts.total === null ? text.unavailable : undefined}>{counts.total === null ? '—' : number.format(counts.total)}</strong></span>
      <span className="site-view-counter-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <div id={id} className="site-view-counter-details" hidden={!open}>
      <p className="site-view-counter-total"><span>{text.total}</span><strong aria-label={counts.total === null ? text.unavailable : undefined}>{counts.total === null ? '—' : number.format(counts.total)}</strong></p>
      {counts.total === null && <p className="site-view-counter-gap">{text.gap}</p>}
      <p>{text.since} <time dateTime={counts.startedAt}>{started}</time></p>
      <p>{text.definition}</p>
    </div>
  </div>;
}
