"use client";
// The official summary reader shared by every screen, with the two small pieces
// every screen's frame shows from it (the load message and the header date chip).
// Moved verbatim from ./live-signals, which re-exports all four, so the home and
// the other screens that show no Seoul signals do not download those with it.
import { useEffect, useState } from "react";
import type { Lang } from "./retailpulse-data";
import type { LiveSummary } from "./live-signals";
import { kstDay } from "../lib/demand-presentation";

// Rechecks use only the existing summary read API. Each date/month shares one
// request; an unsuccessful refresh keeps the previous payload and source times.
type SummaryCacheEntry = { value: LiveSummary | null; recheckAt: number };
const summaryCache = new Map<string, SummaryCacheEntry>();
const summaryPending = new Map<string, Promise<LiveSummary | null>>();
let initialUndatedSummaryDay: string | undefined;
const SUMMARY_RECHECK_MS = { empty: 60_000, partial: 120_000, normal: 300_000 };

function summaryKey(date: string | null, month?: string): string {
  // The device day only invalidates the cache. The undated request still lets
  // the server decide today, including the first paint and midnight rollover.
  return `${date ?? `__today__:${kstDay(new Date().toISOString())}`}|${month ?? ""}`;
}

export function nextKstMidnight(now: number): number {
  return Date.parse(`${kstDay(new Date(now).toISOString())}T00:00:00+09:00`) + 86_400_000;
}

function summaryRecheckDelay(value: LiveSummary | null): number {
  if (!value) return SUMMARY_RECHECK_MS.empty;
  const airport = value.airport;
  const hasAirportData = airport.todayExpectedPassengersTotal != null
    || airport.departuresTrackedToday != null
    || airport.passengerForecastTimeline?.length || airport.passengerForecast?.length
    || airport.arrivalForecast?.todayExpectedPassengersTotal != null
    || airport.arrivalForecast?.passengerForecastTimeline?.length
    || airport.scheduled?.length || airport.congestion?.length || airport.transferForecast?.length;
  const hasAreaData = Object.values(value.areas).some(area => area && (
    area.realtime || area.realtimeForecast?.length || area.observedSeries?.length || area.weather?.length
  ));
  if (!hasAirportData && !hasAreaData) return SUMMARY_RECHECK_MS.empty;
  if (airport.forecastCoverage?.all !== "COMPLETE"
    || airport.arrivalForecast?.forecastCoverage?.all !== "COMPLETE"
    || value.sources?.some(source => ["ERROR", "DEGRADED", "MISSING"].includes(source.status))) {
    return SUMMARY_RECHECK_MS.partial;
  }
  return SUMMARY_RECHECK_MS.normal;
}

async function loadSummary(date: string | null, month: string | undefined, key: string): Promise<LiveSummary | null> {
  const cached = summaryCache.get(key);
  if (cached && cached.recheckAt > Date.now()) return cached.value;
  let pending = summaryPending.get(key);
  if (!pending) {
    const query = new URLSearchParams();
    if(date)query.set("date",date);
    else {
      const day = kstDay(new Date(Date.now()).toISOString());
      initialUndatedSummaryDay ??= day;
      // The first URL consumes the existing server preload. Only a calendar
      // rollover needs a new URL; the cache key never overrides server today.
      if (day !== initialUndatedSummaryDay) query.set("_day", day);
    }
    if (month) query.set("month", month);
    // toString(), not .size: URLSearchParams.size only exists in Chrome 113+, Firefox 112+ and Safari 17+.
    const queryText = query.toString();
    const url = `/api/live/summary${queryText ? `?${queryText}` : ""}`;
    pending = fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json() as LiveSummary;
        return payload?.mode === "live-summary" && payload.areas && payload.airport
          && payload.serviceDateKst === (date ?? payload.todayKst) ? payload : null;
      })
      .catch(() => null)
      .then((value) => {
        const now = Date.now();
        // A valid response (including no data) clears the browser-only failure.
        // Wrap once per failed request, never during render: all original source
        // fields and times remain the last successful response's values.
        if (value) delete value.clientRefresh;
        const retained = value ?? (cached?.value
          ? { ...cached.value, clientRefresh: { failedAt: new Date(now).toISOString() } }
          : null);
        summaryCache.set(key, {
          value: retained,
          recheckAt: Math.min(now + summaryRecheckDelay(value), nextKstMidnight(now)),
        });
        summaryPending.delete(key);
        return retained;
      });
    summaryPending.set(key, pending);
  }
  return pending;
}

/**
 * Loads the official summary for a service date.
 *
 * `date` is null for "whatever today is in KST", which keeps the first paint
 * free of any date the client had to guess before the server answered.
 */
export function useLiveSummary(date: string | null = null, availabilityMonth?: string): LiveSummary | null | undefined {
  const key = summaryKey(date, availabilityMonth);
  const [state, setState] = useState<{ key: string; value: LiveSummary | null | undefined }>(() => ({ key, value: summaryCache.get(key)?.value }));
  // Switching dates must not leave the previous day's numbers on screen for a
  // frame. The state is adjusted during render rather than in an effect, which
  // React handles without a second pass and without cascading renders.
  if (state.key !== key) setState({ key, value: summaryCache.get(key)?.value });
  useEffect(() => {
    let active = true;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      if (!active || refreshing || document.visibilityState === "hidden") return;
      const currentKey = summaryKey(date, availabilityMonth);
      if (currentKey !== key) {
        setState({ key: currentKey, value: summaryCache.get(currentKey)?.value });
        return;
      }
      refreshing = true;
      void loadSummary(date, availabilityMonth, key).then(value => {
        refreshing = false;
        if (!active) return;
        const latestKey = summaryKey(date, availabilityMonth);
        // A response started before midnight or a date switch must never
        // replace the new selection, even if that older response arrives last.
        if (latestKey !== key) {
          setState({ key: latestKey, value: summaryCache.get(latestKey)?.value });
          return;
        }
        setState({ key, value });
        if (document.visibilityState !== "hidden") {
          timer = setTimeout(refresh, Math.max(1, (summaryCache.get(key)?.recheckAt ?? Date.now() + SUMMARY_RECHECK_MS.empty) - Date.now()));
        }
      });
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [date, availabilityMonth, key]);
  return state.key === key ? state.value : undefined;
}

export function LiveLoadMessage({ loading, lang }: { loading: boolean; lang: Lang }) {
  return <p className="airport-empty-line" role="status" aria-live="polite" aria-busy={loading}>{(loading
    ? { ko: "로딩 중, 잠시 기다려주세요.", en: "Loading, please wait.", zh: "正在加载，请稍候。", ja: "読み込み中です。しばらくお待ちください。" }
    : { ko: "자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.", en: "Could not load data. Please refresh shortly.", zh: "未能加载资料，请稍后刷新。", ja: "データを取得できませんでした。しばらくして再読み込みしてください。" })[lang]}</p>;
}


export function airportLocale(lang: Lang): string {
  return lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB";
}

/**
 * The header date chip.
 *
 * It shows the KST day the data on screen belongs to, taken from the server's
 * own answer. Nothing is rendered before that answer arrives, because a date
 * invented on the client is exactly the kind of value this product must not
 * put on screen.
 */
export function KstTodayChip({ lang, date = null }: { lang: Lang; date?: string | null }) {
  const summary = useLiveSummary(date);
  if (!summary?.serviceDateKst) return null;
  const parsed = new Date(`${summary.serviceDateKst}T12:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const label = new Intl.DateTimeFormat(airportLocale(lang), {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short",
  }).format(parsed);
  return <span className="kst-chip" title={`${summary.serviceDateKst} (Asia/Seoul)`}>{label} · KST</span>;
}
