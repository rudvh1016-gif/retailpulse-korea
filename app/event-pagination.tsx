"use client";
import { useState } from "react";
import type { Lang } from "./retailpulse-data";
import type { EventPresentationInput } from "../lib/event-presentation";

export function useEventPagination<T extends EventPresentationInput>(initial: T[], area: string, date: string) {
  const key = `${area}/${date}`;
  const [state, setState] = useState<{ key: string; rows: T[]; next: number | null; expanded: boolean; loading: boolean; failed: boolean }>({ key, rows: [], next: 0, expanded: false, loading: false, failed: false });
  if (state.key !== key) setState({ key, rows: [], next: 0, expanded: false, loading: false, failed: false });
  const current = state.key === key ? state : { key, rows: [], next: 0, expanded: false, loading: false, failed: false };
  async function more() {
    if (current.loading || current.next === null) return;
    const offset = current.next;
    setState(old => ({ ...old, loading: true, failed: false, expanded: true }));
    try {
      const response = await fetch(`/api/live/events?area=${encodeURIComponent(area)}&date=${encodeURIComponent(date)}&offset=${offset}`);
      if (!response.ok) throw new Error("events_unavailable");
      const data = await response.json() as { events: T[]; nextOffset: number | null };
      if (!Array.isArray(data.events)) throw new Error("invalid_events");
      setState(old => old.key !== key ? old : { ...old, rows: [...old.rows, ...data.events].filter((event, index, all) => all.findIndex(other => (other.contentId ?? `${other.title}/${other.eventStart}`) === (event.contentId ?? `${event.title}/${event.eventStart}`)) === index), next: data.nextOffset, loading: false });
    } catch { setState(old => old.key !== key ? old : { ...old, loading: false, failed: true }); }
  }
  return { ...current, visible: current.expanded && (current.rows.length || current.next === null) ? current.rows : initial.slice(0, 3), more,
    collapse: () => setState(old => ({ ...old, expanded: false })),
    expand: () => current.rows.length ? setState(old => ({ ...old, expanded: true })) : void more() };
}

export function EventPaginationControls({ page, lang }: { page: { rows: readonly unknown[]; expanded: boolean; loading: boolean; failed: boolean; next: number | null; more: () => void; collapse: () => void; expand: () => void }; lang: Lang }) {
  const labels = {
    ko: ["수집된 행사 전체 보기", "행사 더 보기", "대표 3개만 보기", "행사를 불러오는 중입니다. 잠시 기다려주세요.", "행사를 불러오지 못했습니다. 다시 눌러주세요."],
    en: ["Browse all collected events", "More events", "Show 3 highlights", "Loading events, please wait.", "Could not load events. Please try again."],
    zh: ["查看全部已收集活动", "更多活动", "仅显示3项", "正在加载活动，请稍候。", "活动加载失败，请重试。"],
    ja: ["収集済みの全イベントを見る", "さらにイベントを見る", "代表3件のみ表示", "イベントを読み込み中です。", "取得できませんでした。再試行してください。"],
  }[lang];
  return <div className="event-pagination">
    {page.expanded && page.rows.length > 0 && <p>{({ ko: `${page.rows.length}개 행사 표시${page.next !== null ? " · 더 있는 행사는 아래에서 계속 확인하세요" : " · 수집된 목록의 끝입니다"}`, en: `${page.rows.length} events shown${page.next !== null ? " · more available below" : " · end of collected list"}`, zh: `已显示${page.rows.length}项活动${page.next !== null ? " · 下方还有更多" : " · 已到已收集列表末尾"}`, ja: `${page.rows.length}件を表示${page.next !== null ? "・下に続きがあります" : "・収集済み一覧の末尾です"}` })[lang]}</p>}
    {page.loading && <p role="status">{labels[3]}</p>}
    {page.failed && <p role="status">{labels[4]}</p>}
    {!page.expanded ? <button type="button" className="event-list-toggle" aria-expanded={false} onClick={page.expand}>{labels[0]}</button> : <>
      {page.next !== null && <button type="button" className="event-list-toggle" disabled={page.loading} aria-expanded={true} onClick={page.more}>{labels[1]}</button>}
      <button type="button" className="event-list-toggle" aria-expanded={true} onClick={page.collapse}>{labels[2]}</button>
    </>}
  </div>;
}
