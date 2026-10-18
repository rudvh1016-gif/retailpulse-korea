"use client";
/**
 * Airport screens that used to live in app/live-signals.tsx: the departure and
 * arrival summaries, the facility directory, the flight board and the store
 * briefing. They are only mounted by the airport view, so they are kept out of
 * the Seoul routes' download. Shared readers (useLiveSummary, text helpers,
 * AirportAtAGlance) stay in live-signals.tsx and are imported from there.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Lang } from "./retailpulse-data";
import { type TerminalFlightFallback } from "../lib/airport-flight-scope";
import { RateText } from "./change-rate";
import { formatChangeRate } from "../lib/change-rate";
import { airportCompositionCopy } from "../lib/airport-composition-copy";
import { usePresentationClock } from "./area-demand-card";
import { AirportFlowFigure } from "./airport-flow-figure";
import {AirportRouteCountryPassengers} from './airport-route-country-passengers';
import { useTimeBandReference } from "./airport-passenger-stats-client";
import { FlightCountPrism } from "./flight-count-prism";
import { kstStamp } from "../lib/demand-presentation";
import { flightBoardingLocation } from "../lib/flight-scope";
import { boardingAreaOf, gateSideOf, type GateSide } from "../lib/airport-sides";
import { mapCopy } from "../lib/airport-departure-map-copy";
import { HolidayContext, contextText } from "./operational-context";
import { friendlyCheckpointName, rankCurrentDepartureHallCheckpoints } from "../lib/airport-today-summary";
import { formatHumanFreshness } from "../lib/current-brief";
import { PERIOD_VOUCH_WINDOW_MS } from "../lib/source-period";
import { buildFacilityCopyText, type CopyableFacility } from "../lib/facility-share";
import { buildTerminalBriefings, type TerminalBriefing } from "../lib/terminal-briefing";
import { comparisonText } from "../lib/period-comparison";
import {
  AirportAtAGlance,
  FlightScopeNote,
  LiveLoadMessage,
  airportLocale,
  airportTodayText,
  formatKstBand,
  formatKstClock,
  formatKstDayClock,
  formatKstServicePeriod,
  useLiveSummary,
  type ForecastBand,
  type LiveCongestionRow,
  type LiveFlightRow,
  type LiveSummary,
  type RankedAirlineRow,
  type RemainingForecast,
} from "./live-signals";
const AirportGatePillars = lazy(() => import("./airport-gate-pillars"));
const AirportCheckpointSchematic = lazy(() => import('./airport-checkpoint-deferred'));

/**
 * The window a "rest of today" sum actually covers, e.g. "14:00–24:00 KST".
 *
 * The last band ends at midnight, which formats as 00:00 and reads like the
 * START of a day. The end of today is written 24:00 here for the same reason
 * the copy says "오늘 끝까지".
 */
function formatRemainingWindow(remaining: NonNullable<RemainingForecast>): string {
  const end = formatKstClock(remaining.toAt);
  return `${formatKstClock(remaining.fromAt)}–${end === "00:00" ? "24:00" : end} KST`;
}

/**
 * 입국 copy.
 *
 * Every line names the arrival forecast as a FORECAST and says what it is
 * not: it is the airport's own expectation of arriving passengers, not an
 * observed count, not a queue, and not a number of people heading into
 * Seoul. The departure screen's queue and gate facts have no arrival
 * equivalent in the official data and are deliberately absent here.
 */
const arrivalSectionText = {
  nowBand: { ko: "공식 예상 입국객", en: "official expected arrivals", zh: "官方预计入境旅客", ja: "公式予想入国旅客" },
  dayTotal: { ko: "금일 전체 공식 예상 입국객", en: "Today's total official expected arrivals", zh: "今日全天官方预计入境旅客", ja: "本日合計の公式予想入国旅客" },
  // A past or future date is not "today", and the departure brief has always
  // said so. The arrival one said 금일 whatever date was selected.
  selectedDayTotal: { ko: "선택일 전체 공식 예상 입국객", en: "Selected day's total official expected arrivals", zh: "所选日期全天官方预计入境旅客", ja: "選択日合計の公式予想入国旅客" },
  peak: { ko: "오늘 피크", en: "Today's peak", zh: "今日高峰", ja: "本日のピーク" },
  flowTitle: { ko: "시간대별 예상 입국객", en: "Expected arrivals by hour", zh: "分时段预计入境旅客", ja: "時間帯別の予想入国旅客" },
  flowOnly: { ko: "공식 예상 승객 · 실제 입국 인원 아님", en: "Official departure-hall passenger forecast · not an observed arrival count", zh: "官方预计旅客 · 非实际入境人数", ja: "公式予想旅客 · 実際の入国人数ではありません" },
  byTerminal: { ko: "터미널별 공식 예상 입국객", en: "Official expected arrivals by terminal", zh: "各航站楼官方预计入境旅客", ja: "ターミナル別の公式予想入国旅客" },
  source: { ko: "인천국제공항공사 승객예고", en: "Incheon International Airport Corporation passenger forecast", zh: "仁川国际机场公社旅客预告", ja: "仁川国際空港公社の旅客予告" },
  // Collection lag, named as ours. Never "the airport published nothing".
  behindTitle: {
    ko: "공식 예상 입국객 수집이 밀려 있습니다",
    en: "Arrival forecast collection is behind",
    zh: "官方预计入境旅客采集已滞后",
    ja: "公式予想入国旅客の収集が遅れています",
  },
  behindBody: {
    ko: (at: string) => `${at} 이후 수집이 성공하지 않아 이 날짜의 값이 아직 없습니다. 공급자가 자료를 내지 않은 것이 아닙니다`,
    en: (at: string) => `No collection has succeeded since ${at}, so this date has no value yet. This is not a gap in the provider's data`,
    zh: (at: string) => `自${at}起采集未成功，因此该日期尚无数值。并非供应方没有发布资料`,
    ja: (at: string) => `${at} 以降の収集が成功しておらず、この日付の値がまだありません。提供元が資料を出していないわけではありません`,
  },
} as const;

/**
 * One sentence saying which hours of the day the figure covers, e.g.
 * "2026-08-31 전체 공항 기준, 00:00부터 24:00까지 24개 시간대를 확인했습니다."
 * The date stays as written in the service date so a reader can match it to
 * the picker; the band count is the honest measure of coverage.
 */
function flowCoverageSentence(lang: Lang, serviceDate: string, scope: string, timeline: ForecastBand[]): string {
  if (!timeline.length) return `${serviceDate} ${scope} · ${airportTodayText.unavailable[lang]}`;
  const end = formatKstClock(timeline.at(-1)!.targetEndAt);
  const span = `${formatKstClock(timeline[0].targetStartAt)}–${end === "00:00" ? "24:00" : end}`;
  const count = timeline.length;
  return contextText(lang,
    `${serviceDate} ${scope} 기준, ${span.replace("–", "부터 ")}까지 ${count}개 시간대를 확인했습니다.`,
    `${serviceDate}, ${scope}: ${count} hourly bands confirmed, ${span} KST.`,
    `${serviceDate} ${scope}：已确认${span}（KST）的${count}个时段。`,
    `${serviceDate} ${scope}：${span}（KST）の${count}個の時間帯を確認しました。`);
}

/**
 * Terminal briefing copy. Every label names the KIND of the value beside it
 * (observed queue, official forecast, counted flights) so a card never reads
 * as one blended "busyness" number.
 */
const terminalBriefText = {
  title: { ko: "지금 주목할 곳", en: "Where to watch now", zh: "现在值得关注的地方", ja: "いま注目する場所" },
  intro: {
    ko: "터미널별로 현재 관측된 대기, 공식 예상 시간대, 집계된 출발편을 각각의 기준으로 나눠 보여줍니다.",
    en: "Per terminal: the observed queue, the official forecast bands and the counted departures, each on its own basis.",
    zh: "按航站楼分别显示当前观测等候、官方预计时段与统计出发航班，各自标注口径。",
    ja: "ターミナル別に、観測された待ち・公式予想時間帯・集計した出発便を、それぞれの基準で分けて示します。",
  },
  attentionObserved: { ko: "관측된 대기가 가장 긴 터미널", en: "Longest observed wait", zh: "观测等候最长的航站楼", ja: "観測された待ちが最も長いターミナル" },
  attentionForecast: { ko: "다음 시간대 공식 예상이 더 많은 터미널", en: "Larger official forecast for the next band", zh: "下一时段官方预计更多的航站楼", ja: "次の時間帯の公式予想が多いターミナル" },
  noAttention: { ko: "터미널 간 차이가 없어 지목하지 않습니다", en: "No terminal singled out: no difference to report", zh: "航站楼之间无差异，不作指定", ja: "ターミナル間に差がないため指定しません" },
  queue: { ko: "현재 가장 긴 대기 · 관측", en: "Longest wait now · observed", zh: "当前最长等候 · 观测", ja: "現在最も長い待ち · 観測" },
  queueCount: { ko: "현재 대기 인원 · 관측", en: "People waiting now · observed", zh: "当前等候人数 · 观测", ja: "現在の待機人数 · 観測" },
  next: { ko: "다음 시간대 · 공식 예상", en: "Next band · official forecast", zh: "下一时段 · 官方预计", ja: "次の時間帯 · 公式予想" },
  peak: { ko: "오늘 피크 · 공식 예상", en: "Today's peak · official forecast", zh: "今日高峰 · 官方预计", ja: "本日のピーク · 公式予想" },
  remaining: { ko: "남은 시간대 합계 · 공식 예상", en: "Rest of day · official forecast", zh: "剩余时段合计 · 官方预计", ja: "残り時間帯の合計 · 公式予想" },
  flights: { ko: "오늘 출발 운항 · 집계", en: "Departures today · counted", zh: "今日出发航班 · 统计", ja: "本日の出発便 · 集計" },
  gate: { ko: "가장 몰린 게이트", en: "Busiest gate", zh: "最集中的登机口", ja: "最も集中するゲート" },
  unavailable: { ko: "확인 불가", en: "Unavailable", zh: "暂无法确认", ja: "確認不可" },
  limitation: {
    ko: "대기는 출국장 관측값, 예상은 인천공항 공식 예고, 운항은 실제 편수입니다. 매장 방문객이나 매출을 뜻하지 않습니다.",
    en: "Waits are departure-hall observations, forecasts are Incheon's official announcements, flights are physical counts. None of this is store footfall or sales.",
    zh: "等候为出境区观测值，预计为仁川机场官方预告，航班为实际班次。均不代表门店客流或销售额。",
    ja: "待ちは出国場の観測値、予想は仁川空港の公式予告、運航は実便数です。店舗の来客や売上を意味しません。",
  },
} as const;

/**
 * One card per terminal, from the summary the page already holds. Shown in the
 * all-terminals scope only: a single-terminal scope already focuses the
 * at-a-glance grid on that terminal, so the cards would repeat it.
 */
function TerminalBriefingCards({ lang, airport, nowIso, dayRelation }: {
  lang: Lang;
  airport: LiveSummary["airport"];
  nowIso: string;
  dayRelation: LiveSummary["dayRelation"];
}) {
  const locale = airportLocale(lang);
  const peopleUnit = { ko: "명", en: " people", zh: "人", ja: "人" }[lang];
  const flightUnit = { ko: "편", en: " flights", zh: "班", ja: "便" }[lang];
  const waitUnit = { ko: "분", en: " min", zh: "分钟", ja: "分" }[lang];
  const terminals = ["T1", "T2"];
  const set = buildTerminalBriefings({
    terminals,
    congestion: airport.congestion ?? [],
    timelineByTerminal: Object.fromEntries(terminals.map((id) => [id, airport.passengerForecastTimelineByTerminal?.[id] ?? []])),
    coverageByTerminal: Object.fromEntries(terminals.map((id) => [id, airport.forecastCoverage?.byTerminal?.[id] ?? "UNAVAILABLE"])),
    peakByTerminal: Object.fromEntries(terminals.map((id) => [id, airport.peakExpectedTimeBandByTerminal?.[id] ?? null])),
    remainingByTerminal: Object.fromEntries(terminals.map((id) => [id, airport.remainingExpectedPassengersByTerminal?.[id] ?? null])),
    departuresByTerminal: Object.fromEntries(terminals.map((id) => [id, airport.departuresTrackedTodayByTerminal?.[id] ?? null])),
    topGateByTerminal: Object.fromEntries(terminals.map((id) => {
      const gate = airport.topDepartureGateByTerminal?.[id];
      return [id, gate ? { terminal: id, gate: gate.gate, flights: gate.flights } : null];
    })),
    dayRelation,
    nowIso,
  });
  if (!set.terminals.some((row) => row.evidenceTypes.length || row.currentBand)) return null;
  const waitText = (row: TerminalBriefing) => {
    const checkpoint = row.checkpoint;
    if (!checkpoint) return null;
    if (row.checkpointBasis === "WAIT_TIME") {
      const raw = checkpoint.waitTimeRaw ?? (checkpoint.waitTimeMinutes === null ? null : String(checkpoint.waitTimeMinutes));
      const wait = raw ? (/분|min|分钟|分/i.test(raw) ? raw : `${raw}${waitUnit}`) : terminalBriefText.unavailable[lang];
      return { label: terminalBriefText.queue[lang], value: `${friendlyCheckpointName(checkpoint.zone, lang)} · ${wait}` };
    }
    if (checkpoint.waitingCount !== null) {
      return { label: terminalBriefText.queueCount[lang], value: `${friendlyCheckpointName(checkpoint.zone, lang)} · ${checkpoint.waitingCount.toLocaleString(locale)}${peopleUnit}` };
    }
    return null;
  };
  const bandText = (band: { targetStartAt: string; targetEndAt: string; expectedPassengers: number } | null) => band
    ? `${formatKstBand(band.targetStartAt, band.targetEndAt).replace(" KST", "")} · ${Math.round(band.expectedPassengers).toLocaleString(locale)}${peopleUnit}`
    : null;
  const attention = set.attention
    ? `${set.attention.terminal} · ${set.attention.basis === "OBSERVED_WAIT" ? terminalBriefText.attentionObserved[lang] : terminalBriefText.attentionForecast[lang]}`
    : terminalBriefText.noAttention[lang];
  return <section className="terminal-briefing" data-signal-key="terminal-briefing" aria-labelledby="terminal-briefing-title">
    <div className="terminal-briefing-head">
      <div><p className="eyebrow">TERMINAL BRIEFING · OFFICIAL</p><h3 id="terminal-briefing-title">{terminalBriefText.title[lang]}</h3></div>
      <p>{terminalBriefText.intro[lang]}</p>
    </div>
    <p className="terminal-attention" data-attention-terminal={set.attention?.terminal ?? ""}><strong>{attention}</strong></p>
    <div className="terminal-brief-grid">
      {set.terminals.map((row) => {
        const queue = waitText(row);
        const cells: Array<{ key: string; label: string; value: string }> = [];
        if (queue) cells.push({ key: "queue", ...queue });
        const current = bandText(row.currentBand);
        if (current) cells.push({ key: "current", label: contextText(lang,"현재 시간대 · 공식 예상","Current interval · official forecast","当前时段 · 官方预计","現在の時間帯・公式予想"), value: current });
        const next = bandText(row.nextBand);
        if (next) cells.push({ key: "next", label: terminalBriefText.next[lang], value: next });
        const peak = bandText(row.peak);
        if (peak) cells.push({ key: "peak", label: terminalBriefText.peak[lang], value: peak });
        if (row.remaining) cells.push({ key: "remaining", label: terminalBriefText.remaining[lang], value: `${formatRemainingWindow(row.remaining)} · ${Math.round(row.remaining.expectedPassengers).toLocaleString(locale)}${peopleUnit}` });
        if (row.departures !== null) cells.push({ key: "flights", label: terminalBriefText.flights[lang], value: `${row.departures.toLocaleString(locale)}${flightUnit}` });
        if (row.topGate) cells.push({ key: "gate", label: terminalBriefText.gate[lang], value: `Gate ${row.topGate.gate} · ${row.topGate.flights.toLocaleString(locale)}${flightUnit}` });
        return <article key={row.terminal} className={`terminal-brief-card${set.attention?.terminal === row.terminal ? " is-attention" : ""}`} data-terminal={row.terminal}>
          <h4>{row.terminal}</h4>
          {cells.length
            ? <dl>{cells.map((cell) => <div key={cell.key} data-metric={cell.key}><dt>{cell.label}</dt><dd>{cell.value}</dd></div>)}</dl>
            : <p className="terminal-brief-empty">{terminalBriefText.unavailable[lang]}</p>}
        </article>;
      })}
    </div>
    <p className="terminal-brief-limitation">{terminalBriefText.limitation[lang]}</p>
  </section>;
}

/**
 * 입국 — the arrival side of the same official forecast.
 *
 * Owner request, 2026-09-06: "출국 바로 옆에 입국을 추가해서 입국객수도
 * 보여주면 안돼? 입국항공편까진 필요없어."
 *
 * Deliberately NOT a mirror of the departure screen. Everything that makes
 * the departure screen useful to a retail worker — the security-queue wait,
 * the busiest gate, the airline mix — is departure-only in the official
 * data: A4 congestion publishes 출국장 checkpoints only, and A1 gate/airline
 * counts are read for departures. Inventing arrival equivalents would mean
 * showing departure facts under an arrival heading, so this screen carries
 * exactly what the arrival forecast itself publishes and nothing else.
 *
 * The rows cost no extra request: the summary already selects both
 * directions in one statement for the departure page.
 */
export function AirportArrivalSummary({ lang, terminal = "all", date = null }: { lang: Lang; terminal?: "all" | "T1" | "T2"; date?: string | null }) {
  const summary = useLiveSummary(date);
  const presentationNow = usePresentationClock(summary?.generatedAt ?? "");
  const airport = summary?.airport;
  if (!summary) return <LiveLoadMessage loading={summary === undefined} lang={lang} />;
  if (!airport) return <div className="airport-unavailable" role="status"><strong>{airportTodayText.unavailable[lang]}</strong></div>;

  const arrival = airport.arrivalForecast;
  const numberLocale = airportLocale(lang);
  const peopleUnit = { ko: "명", en: " people", zh: "人", ja: "人" }[lang];
  const isAll = terminal === "all";
  const scopeLabel = airportTodayText.scope[lang][terminal];
  const nowIso = new Date(presentationNow).toISOString();

  const total = isAll ? arrival?.todayExpectedPassengersTotal ?? null : arrival?.todayExpectedPassengersByTerminal?.[terminal] ?? null;
  const peak = isAll ? arrival?.peakExpectedTimeBand ?? null : arrival?.peakExpectedTimeBandByTerminal?.[terminal] ?? null;
  const timeline = (isAll ? arrival?.passengerForecastTimeline : arrival?.passengerForecastTimelineByTerminal?.[terminal]) ?? [];
  const coverage = (isAll ? arrival?.forecastCoverage?.all : arrival?.forecastCoverage?.byTerminal?.[terminal]) ?? "UNAVAILABLE";
  const isPartial = coverage === "PARTIAL";
  const collected = arrival?.passengerForecastRetrievedAt
    ? formatHumanFreshness(arrival.passengerForecastRetrievedAt, nowIso, lang, "collected")
    : null;

  /*
   * An empty screen has to say WHY, exactly as the departure one does.
   *
   * "확인 불가" alone reads as "the airport published nothing", and on
   * 2026-09-07 that was wrong: the provider had simply been unreachable
   * since the 5th, so no row for the day existed to read. The departure
   * brief already drew that distinction and this screen did not — the owner
   * hit the same dead end one screen over.
   *
   * Judged on `source_health.last_retrieved_at`, on the same window the
   * rest of the product uses for collection lag.
   */
  const forecastCollectedAt = summary.sources?.find(
    (source) => source.sourceId === "INCHEON_PASSENGER_FORECAST")?.retrievedAt ?? null;
  const collectedMs = forecastCollectedAt ? Date.parse(forecastCollectedAt) : Number.NaN;
  const nowMs = Date.parse(nowIso);
  const collectionBehind = Number.isFinite(collectedMs) && Number.isFinite(nowMs)
    && nowMs - collectedMs > PERIOD_VOUCH_WINDOW_MS / 4;
  const emptyTitle = collectionBehind
    ? arrivalSectionText.behindTitle[lang]
    : isPartial ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang];
  const emptyBody = collectionBehind
    ? arrivalSectionText.behindBody[lang](formatKstDayClock(forecastCollectedAt!, lang))
    : isPartial ? airportTodayText.partialBody[lang] : airportTodayText.unavailableBody[lang];

  const nowBand = summary.dayRelation === "TODAY"
    ? timeline.find((row) => Date.parse(row.targetStartAt) <= Date.parse(nowIso) && Date.parse(nowIso) < Date.parse(row.targetEndAt)) ?? null
    : null;
  const nowBandStart = nowBand?.targetStartAt ?? null;
  const nowBandDuration = nowBand ? Date.parse(nowBand.targetEndAt) - Date.parse(nowBand.targetStartAt) : 0;
  const nowBandProgress = nowBand && nowBandDuration > 0
    ? Math.min(1, Math.max(0, (Date.parse(nowIso) - Date.parse(nowBand.targetStartAt)) / nowBandDuration))
    : null;
  const nowLabel = `${airportTodayText.nowMarker[lang]} ${formatKstClock(nowIso)}`;

  const people = (value: number) => `${Math.round(value).toLocaleString(numberLocale)}${peopleUnit}`;

  /*
   * The day's total leads, and the current hour follows it.
   *
   * This screen used to open with the current band and bury the day's figure
   * in a plain list line underneath. The departure screen has always led with
   * its day total in bold, so the same question got a different answer
   * depending on which of two adjacent tabs you were on. The owner asked for
   * them to match, and the day total is the one number that exists for every
   * date the picker offers — a past or future day has no "current hour" at
   * all, and on those days the old layout had nothing to lead with.
   */
  const totalLine = total === null ? null
    : `${(summary.dayRelation === "TODAY" ? arrivalSectionText.dayTotal : arrivalSectionText.selectedDayTotal)[lang]} ${people(total)}`;
  const nowLine = nowBand
    ? `${formatKstBand(nowBand.targetStartAt, nowBand.targetEndAt).replace(" KST", "")} ${arrivalSectionText.nowBand[lang]} ${people(nowBand.expectedPassengers)}`
    : null;
  const headline = totalLine ?? nowLine;

  return <>
    <section className="airport-arrival-brief" aria-labelledby="airport-arrival-title">
      <p className="eyebrow">OFFICIAL FORECAST · {scopeLabel}</p>
      <h2 id="airport-arrival-title">{headline ?? emptyTitle}</h2>
      {totalLine && nowLine && <strong className="airport-arrival-current">{nowLine}</strong>}
      <ul className="airport-arrival-lines">
        {peak && <li>{arrivalSectionText.peak[lang]} {formatKstBand(peak.targetStartAt, peak.targetEndAt).replace(" KST", "")} · {people(peak.expectedPassengers)}</li>}
        {headline === null && <li className="airport-arrival-basis">{emptyBody}</li>}
        {collected && <li className="airport-arrival-basis">{arrivalSectionText.source[lang]} · {collected}</li>}
      </ul>
    </section>

    <section className="airport-detail-section airport-forecast" aria-labelledby="airport-arrival-flow-title">
      <div className="airport-detail-head">
        <div><p className="eyebrow">OFFICIAL FORECAST · {scopeLabel}</p><h3 id="airport-arrival-flow-title">{arrivalSectionText.flowTitle[lang]}</h3></div>
        <p>{arrivalSectionText.flowOnly[lang]}</p>
      </div>
      <p className="flow-note">{flowCoverageSentence(lang, summary.serviceDateKst, scopeLabel, timeline)}{isPartial ? ` ${airportTodayText.partialBody[lang]}` : ""}</p>
      {timeline.length > 0
        ? <AirportFlowFigure
          timeline={timeline}
          terminal={terminal}
          layers={isAll ? arrival?.passengerForecastTimelineByTerminal ?? null : null}
          lang={lang}
          peakStartAt={peak?.targetStartAt ?? null}
          nowBandStart={nowBandStart}
          nowBandProgress={nowBandProgress}
          nowLabel={nowLabel}
          numberLocale={numberLocale}
          label={`${arrivalSectionText.flowTitle[lang]}. ${arrivalSectionText.flowOnly[lang]}${nowBandStart ? `. ${nowLabel}` : ""}`}
        />
        : <div className={`airport-forecast-state ${isPartial ? "partial" : "unavailable"}`}>
          <strong>{emptyTitle}</strong>
          <p>{emptyBody}</p>
          {collected && <small>{collected}</small>}
        </div>}
    </section>

    {isAll && <section className="airport-detail-section" aria-labelledby="airport-arrival-terminal-title">
      <div className="airport-detail-head"><div><h3 id="airport-arrival-terminal-title">{arrivalSectionText.byTerminal[lang]}</h3></div></div>
      <ul className="airport-arrival-terminals">
        {["T1", "T2"].map((id) => {
          const value = arrival?.todayExpectedPassengersByTerminal?.[id] ?? null;
          return <li key={id}><span>{id}</span><strong>{value === null ? airportTodayText.unavailable[lang] : people(value)}</strong></li>;
        })}
      </ul>
    </section>}
  </>;
}
export function AirportTodaySummary({ lang, terminal = "all", date = null }: { lang: Lang; terminal?: "all" | "T1" | "T2"; date?: string | null }) {
  const [compositionView, setCompositionView] = useState<"gates" | "airlines" | "countries">("gates");
  const summary = useLiveSummary(date);
  const presentationNow = usePresentationClock(summary?.generatedAt ?? "");
  // Owner-approved 2026-10-15: the newest published month's actual departures per hour, whole airport only.
  const timeBandReference = useTimeBandReference(summary?.serviceDateKst ?? null, lang);
  const airport = summary?.airport;
  if (!summary) return <div className={summary === undefined ? "airport-summary-reserved" : undefined}><LiveLoadMessage loading={summary === undefined} lang={lang} /></div>;
  if (!airport) return <div className="airport-unavailable" role="status"><strong>{airportTodayText.unavailable[lang]}</strong></div>;
  const numberLocale = airportLocale(lang);
  const peopleUnit = { ko: "명", en: " people", zh: "人", ja: "人" }[lang];
  const flightUnit = { ko: "편", en: " flights", zh: "班", ja: "便" }[lang];

  // Every metric reads from the SELECTED terminal's own field — never the
  // all-airport total — so choosing T1 cannot still show T1+T2. Per-terminal
  // fields are read defensively so a degraded payload never crashes the page.
  const isAll = terminal === "all";
  const expectedTotal = isAll ? airport.todayExpectedPassengersTotal : airport.todayExpectedPassengersByTerminal?.[terminal] ?? null;
  const flightsCount = isAll ? airport.departuresTrackedToday : airport.departuresTrackedTodayByTerminal?.[terminal] ?? null;
  const peak = isAll ? airport.peakExpectedTimeBand : airport.peakExpectedTimeBandByTerminal?.[terminal] ?? null;
  const remaining = isAll ? airport.remainingExpectedPassengers : airport.remainingExpectedPassengersByTerminal?.[terminal] ?? null;
  const timeline = isAll ? airport.passengerForecastTimeline : airport.passengerForecastTimelineByTerminal?.[terminal] ?? [];
  const forecastStatus = isAll ? airport.forecastCoverage?.all : airport.forecastCoverage?.byTerminal?.[terminal];
  const isForecastPartial = forecastStatus === "PARTIAL";
  const passengerRetrievedAt = isAll ? airport.passengerForecastRetrievedAt : airport.passengerForecastRetrievedAtByTerminal?.[terminal] ?? null;
  const flightsRetrievedAt = isAll ? airport.departuresTrackedTodayRetrievedAt : airport.topDepartureGateRetrievedAtByTerminal?.[terminal] ?? null;
  const gateRetrievedAt = isAll ? airport.topDepartureGateRetrievedAt : airport.topDepartureGateRetrievedAtByTerminal?.[terminal] ?? null;
  const nowIso = new Date(presentationNow).toISOString();
  const collectedText = (value: string | null) => value ? formatHumanFreshness(value, nowIso, lang, "collected") : null;
  const passengerCollected = collectedText(passengerRetrievedAt);
  const flightsCollected = collectedText(flightsRetrievedAt);
  const gateCollected = collectedText(gateRetrievedAt);

  const scopeLabel = airportTodayText.scope[lang][terminal];
  const ranking = isAll ? airport.airlineRanking?.all ?? null : airport.airlineRanking?.byTerminal?.[terminal] ?? null;
  const noFlightsText = summary?.dayRelation === "PAST" ? airportTodayText.noFlightsForDate[lang] : airportTodayText.noFlightsToday[lang];
  const rankedCheckpoints = rankCurrentDepartureHallCheckpoints(
    (airport.congestion ?? []).map((row) => ({ ...row, waitTimeRaw: row.waitTimeRaw ?? null })),
  ) as Record<string, LiveCongestionRow[]>;
  // The current-time marker exists only for TODAY. A past or future service
  // date has no "now" inside it, and drawing one would invent a moment in a
  // day the clock is not in. Bands the marker has passed stay forecasts.
  const nowBand = summary?.dayRelation === "TODAY"
    ? timeline.find((row) => Date.parse(row.targetStartAt) <= Date.parse(nowIso) && Date.parse(nowIso) < Date.parse(row.targetEndAt)) ?? null
    : null;
  const nowBandStart = nowBand?.targetStartAt ?? null;
  const nowBandDuration = nowBand ? Date.parse(nowBand.targetEndAt) - Date.parse(nowBand.targetStartAt) : 0;
  const nowBandProgress = nowBand && nowBandDuration > 0
    ? Math.min(1, Math.max(0, (Date.parse(nowIso) - Date.parse(nowBand.targetStartAt)) / nowBandDuration))
    : null;
  const nowLabel = `${airportTodayText.nowMarker[lang]} ${formatKstClock(nowIso)}`;
  // Metrics can be collected at different times (expected passengers 09:34 vs
  // flights 00:03), so each cell carries its own time. When all four agree the
  // section states it once instead of repeating it.
  const distinctFreshness = [...new Set([passengerCollected, flightsCollected, gateCollected].filter((value): value is string => Boolean(value)))];
  const sharesOneFreshness = distinctFreshness.length <= 1;
  // The shared line already carries the word "collected" in its own label, so
  // its stamp is the clock alone instead of saying "collected" twice.
  const plainText = (value: string | null) => value ? formatHumanFreshness(value, nowIso, lang, "plain") : null;
  const distinctSectionFreshness = [...new Set([passengerRetrievedAt, flightsRetrievedAt, gateRetrievedAt].map(plainText).filter((value): value is string => Boolean(value)))];
  const perMetric = (value: string | null) => (sharesOneFreshness ? null : value);

  return <section className="airport-today airport-approved" aria-label={airportTodayText.title[lang]}>
    {/* LOCK 4. The day's official size and the hour-by-hour shape of that same
        size are one question, so they are one block — and the chart has to sit
        INSIDE the brief to land between the limitation note and the at-a-glance
        grid. Passing it as a slot keeps a single component and a single DOM
        order; the personal home renders the same brief with no chart. */}
    <AirportAtAGlance summary={summary} lang={lang} terminal={terminal} flow={
    <section className="airport-detail-section airport-forecast" aria-labelledby="airport-forecast-title">
      <div className="airport-detail-head"><div><p className="eyebrow">OFFICIAL FORECAST · {scopeLabel}</p><h3 id="airport-forecast-title">{airportTodayText.forecastTitle[lang]}</h3></div><p>{airportTodayText.forecastOnly[lang]}</p></div>
      <p className="flow-note">{flowCoverageSentence(lang, summary.serviceDateKst, scopeLabel, timeline)}{isForecastPartial ? ` ${airportTodayText.partialBody[lang]}` : ''}</p>
      {timeline.length > 0
        ? <AirportFlowFigure
          timeline={timeline}
          layers={isAll ? airport.passengerForecastTimelineByTerminal ?? null : null}
          terminal={terminal}
          lang={lang}
          peakStartAt={peak?.targetStartAt ?? null}
          nowBandStart={nowBandStart}
          nowBandProgress={nowBandProgress}
          nowLabel={nowLabel}
          numberLocale={numberLocale}
          label={`${airportTodayText.forecastTitle[lang]}. ${airportTodayText.forecastOnly[lang]}${nowBandStart ? `. ${nowLabel}` : ""}`}
          showModel={false}
          reference={isAll ? timeBandReference : null}
        />
        : <div className={`airport-forecast-state ${isForecastPartial ? "partial" : "unavailable"}`}>
          <strong>{isForecastPartial ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang]}</strong>
          <p>{isForecastPartial ? airportTodayText.partialBody[lang] : airportTodayText.unavailableBody[lang]}</p>
          {passengerCollected && <small>{passengerCollected}</small>}
        </div>}
      <AirportRouteCountryPassengers lang={lang} month={summary.serviceDateKst.slice(0,7)} terminal={terminal}/>
      <div id="airport-departure-model-slot" data-testid="airport-departure-model-slot"/>
    </section>
    }/>

    <details className="airport-summary-details"><summary>{contextText(lang,"터미널별 상세·집계 기준 보기","Terminal details and counting basis","航站楼详情与统计标准","ターミナル詳細・集計基準を見る")}</summary>
    {isAll && <TerminalBriefingCards lang={lang} airport={airport} nowIso={nowIso} dayRelation={summary?.dayRelation ?? "TODAY"} />}
    <div className="section-head">
      <div><p className="eyebrow">OFFICIAL · {scopeLabel} · KST</p><h2 id="airport-today-title">{airportTodayText.title[lang]}</h2></div>
      <span className="airport-period-label">{airport.serviceDateKst ? formatKstServicePeriod(airport.serviceDateKst, lang) : airportTodayText.unavailable[lang]}</span>
    </div>

    <div className="airport-today-grid">
      <article><span>{airportTodayText.expected[lang]}</span><strong data-kind={expectedTotal === null ? "status" : "value"}>{expectedTotal === null ? (isForecastPartial ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang]) : `${Math.round(expectedTotal).toLocaleString(numberLocale)}${peopleUnit}`}</strong><small>{isForecastPartial ? airportTodayText.forecastPartialNote[lang] : airportTodayText.expectedNote[lang]}</small>{perMetric(passengerCollected) && <small className="metric-freshness">{passengerCollected}</small>}</article>
      <article><span>{airportTodayText.peak[lang]}</span><strong data-kind={peak ? "value" : "status"}>{peak ? formatKstBand(peak.targetStartAt, peak.targetEndAt) : airportTodayText.unavailable[lang]}</strong><small>{peak ? `${airportTodayText.peakNote[lang]} · ${Math.round(peak.expectedPassengers).toLocaleString(numberLocale)}${peopleUnit}` : (isForecastPartial ? airportTodayText.forecastPartialNote[lang] : airportTodayText.peakNote[lang])}</small>{perMetric(passengerCollected) && <small className="metric-freshness">{passengerCollected}</small>}</article>
      <article><span>{airportTodayText.flights[lang]}</span><strong data-kind={flightsCount === null ? "status" : "value"}>{flightsCount === null ? airportTodayText.unavailable[lang] : `${flightsCount.toLocaleString(numberLocale)}${flightUnit}`}</strong><small>{airportTodayText.flightsNote[lang]}</small>{perMetric(flightsCollected) && <small className="metric-freshness">{flightsCollected}</small>}</article>
      {remaining && <article className="airport-remaining"><span>{airportTodayText.remaining[lang]}</span><strong data-kind="value">{Math.round(remaining.expectedPassengers).toLocaleString(numberLocale)}{peopleUnit}</strong><small>{airportTodayText.remainingNote[lang](formatRemainingWindow(remaining))}</small>{perMetric(passengerCollected) && <small className="metric-freshness">{passengerCollected}</small>}</article>}
    </div>
    {sharesOneFreshness && distinctSectionFreshness.length > 0 && <p className="airport-section-freshness">{airportTodayText.retrieved[lang]} · {distinctSectionFreshness[0]}</p>}

    </details>

    {/*
      * 구성/이유. 게이트와 항공사는 "지금 어떤가"도 "다음에 무엇이 오는가"도
      * 아니고, 앞의 두 숫자가 왜 그런지를 설명하는 자료다. 그래서 각각 최상위
      * 섹션으로 흩어져 있지 않고 하나의 제목 아래 묶여 마지막에 온다.
      */}
    <section className="airport-composition" aria-labelledby="airport-composition-title">
      <div className="airport-composition-head">
        <div>
          <h3 id="airport-composition-title">{airportCompositionCopy(lang, summary.dayRelation, summary.serviceDateKst, scopeLabel).title}</h3>
          <p className="airport-composition-scope">{airportCompositionCopy(lang, summary.dayRelation, summary.serviceDateKst, scopeLabel).scope}</p>
          <p>{airportCompositionCopy(lang, summary.dayRelation, summary.serviceDateKst, scopeLabel).intro}</p>
          <small>{airportTodayText.compositionTruth[lang]}</small>
        </div>
      </div>

      <div className="airport-composition-tabs" role="tablist" aria-label={airportTodayText.compositionTabsLabel[lang]}>
        {(["gates", "airlines", "countries"] as const).map((view, index, views) => <button
          type="button"
          role="tab"
          id={`airport-composition-tab-${view}`}
          aria-controls={`airport-composition-panel-${view}`}
          aria-selected={compositionView === view}
          tabIndex={compositionView === view ? 0 : -1}
          key={view}
          onClick={() => setCompositionView(view)}
          onKeyDown={(event) => {
            let nextIndex = index;
            if (event.key === "ArrowRight") nextIndex = (index + 1) % views.length;
            else if (event.key === "ArrowLeft") nextIndex = (index - 1 + views.length) % views.length;
            else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = views.length - 1;
            else return;
            event.preventDefault();
            const nextView = views[nextIndex];
            setCompositionView(nextView);
            document.getElementById(`airport-composition-tab-${nextView}`)?.focus();
          }}
        >{airportTodayText.compositionTabs[view][lang]}</button>)}
      </div>

      {compositionView === "gates" && <section
        className="airport-composition-panel airport-gates"
        id="airport-composition-panel-gates"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby="airport-composition-tab-gates"
      >
        <Suspense fallback={<p className="airport-empty-line">{noFlightsText}</p>}>
          <AirportGatePillars key={`${terminal}:${summary.serviceDateKst}`} lang={lang} terminal={terminal} date={summary.serviceDateKst}/>
        </Suspense>
      </section>}

      {compositionView === "airlines" && <section
        className="airport-composition-panel airport-airlines"
        id="airport-composition-panel-airlines"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby="airport-composition-tab-airlines"
      >
        <div className="airport-composition-panel-head"><h4>{airportTodayText.airlinesTitle[lang]}</h4><p>{airportCompositionCopy(lang, summary.dayRelation, summary.serviceDateKst, scopeLabel).intro}</p></div>
        {ranking && ranking.airlines.length ? <>
          <ol className="airport-gate-list airport-airline-list">
            <li className="airport-gate-head" aria-hidden="true"><span>{airportTodayText.rankLabel[lang]}</span><strong>{airportTodayText.airlineColumn[lang]}</strong><b>{airportTodayText.departureShareColumn[lang]}</b></li>
            {ranking.airlines.map((row, index) => <li className="airport-rank-row airport-airline-row" key={row.iata ?? `label-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{row.iata ? <i>{row.iata}</i> : null}{airlineDisplayName(row, lang)}<em>{row.country ? regionName(row.country, lang) : airportTodayText.countryUnverified[lang]}</em><FlightCountPrism flights={row.flights} maximum={Math.max(...ranking.airlines.map(item=>item.flights))}/></strong>
              <b>{row.flights.toLocaleString(numberLocale)}{flightUnit}<small>{formatShare(row.share)}</small></b>
            </li>)}
          </ol>
          <p className="airport-detail-foot">{airportTodayText.airlineCountryShortBasis[lang]}</p>
        </> : <p className="airport-empty-line">{flightsCount === null ? noFlightsText : airportTodayText.noAirlineList[lang]}</p>}
      </section>}

      {compositionView === "countries" && <section
        className="airport-composition-panel airport-countries"
        id="airport-composition-panel-countries"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby="airport-composition-tab-countries"
      >
        <div className="airport-composition-panel-head"><h4>{airportTodayText.countriesTitle[lang]}</h4><p>{airportTodayText.countriesNote[lang]}</p></div>
        {ranking && ranking.countries.length ?
          <ol className="airport-gate-list airport-country-list">
            <li className="airport-gate-head" aria-hidden="true"><span>{airportTodayText.rankLabel[lang]}</span><strong>{airportTodayText.countryColumn[lang]}</strong><b>{airportTodayText.departureShareColumn[lang]}</b></li>
            {ranking.countries.map((row, index) => <li className="airport-rank-row airport-country-row" key={row.country ?? "unverified"}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{row.country ? <i>{row.country}</i> : null}{row.country ? regionName(row.country, lang) : airportTodayText.countryUnverified[lang]}<em>{row.airlines.toLocaleString(numberLocale)}{airportTodayText.airlinesUnit[lang]}</em><FlightCountPrism flights={row.flights} maximum={Math.max(...ranking.countries.map(item=>item.flights))}/></strong>
              <b>{row.flights.toLocaleString(numberLocale)}{flightUnit}<small>{formatShare(row.share)}</small></b>
            </li>)}
          </ol> : <p className="airport-empty-line">{flightsCount === null ? noFlightsText : airportTodayText.noAirlineList[lang]}</p>}
        <p className="airport-detail-foot">{airport.airlineRanking?.countrySource?.retrievedOn
          ? airportTodayText.airlineCountryBasis[lang](airport.airlineRanking.countrySource.retrievedOn)
          : airportTodayText.airlineCountryShortBasis[lang]}</p>
      </section>}
    </section>

    <section className="airport-detail-section airport-checkpoints" aria-labelledby="airport-checkpoints-title">
      <div className="airport-detail-head"><div><p className="eyebrow">CURRENT OBSERVATION · {scopeLabel}</p><h3 id="airport-checkpoints-title">{airportTodayText.current[lang]}</h3></div><p>{airportTodayText.currentNote[lang]}</p></div>
      <Suspense fallback={<div style={{minBlockSize:340}} aria-busy="true"/>}><div className="airport-checkpoint-schematics" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))',gap:20}}>{(['T1','T2'] as const).filter(value=>isAll||value===terminal).map(value=><AirportCheckpointSchematic key={value} terminal={value} rows={rankedCheckpoints[value]??[]} now={presentationNow} lang={lang}/>)}</div></Suspense>
    </section>
  </section>;
}

/** Locale region name for an ISO 3166-1 alpha-2 code; the code itself when the runtime has no display names. */
function regionName(code: string, lang: Lang): string {
  try {
    // `short` is deliberate. Node and Chromium use different CLDR long names
    // for a few regions (notably HK/MO), which can otherwise change this text
    // during hydration. The compact label also belongs with the dense ranking.
    return new Intl.DisplayNames([airportLocale(lang)], {
      type: "region",
      style: "short",
      fallback: "code",
    }).of(code) ?? code;
  } catch {
    return code;
  }
}

function airlineDisplayName(row: RankedAirlineRow, lang: Lang): string {
  if (row.iata === "RS" && row.registryName === "Air Seoul") return ({ ko: "에어서울", en: "Air Seoul", zh: "首尔航空", ja: "エアソウル" })[lang];
  // The name comes ONLY from the verified reference table, keyed by the
  // reliably-parsed operating designator — never from the raw per-row
  // provider field. Investigation on 2026-09-03 found that field unreliable:
  // when a codeshare pair shares a master flight number, `airport_flights`
  // keeps one row per physical flight and the stored "airline" text can be
  // whichever marketing partner's row was written last, not the operator
  // the flight number actually names (see lib/airline-ranking.ts). Showing
  // a possibly-wrong name is worse than showing none, so an airline the
  // table cannot vouch for gets the same "unavailable" text as no country.
  return row.registryName ?? airportTodayText.unavailable[lang];
}

function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/* ── A2 · Official passenger-terminal facility directory ─────────────── */
type FacilityRow = {
  /** A3: how firmly the location is known, and the zones the official text proved. */
  mappingMethod?: "OFFICIAL_DIRECT" | "OFFICIAL_MAP_REVIEW" | "AMBIGUOUS";
  gate?: string | null; gateGroup?: string | null; checkpointId?: string | null;
  facilityId: string; nameKo: string | null; nameEn: string | null; nameZh: string | null; nameJa: string | null;
  facilityItem: string | null; largeCategory: string | null; mediumCategory: string | null; smallCategory: string | null;
  categoryGroup: string; terminal: string | null; floor: string | null; dutyArea: string | null;
  arrivalDeparture: string | null; locationRaw: string | null; locationEn: string | null;
  businessHoursRaw: string | null; goodsBrands: string | null; phone: string | null; retrievedAt: string | null;
};

const facilityText = {
  title: { ko: "매장·시설", en: "Stores and facilities", zh: "店铺·设施", ja: "店舗・施設" },
  /**
   * The basis, stated before anything is trusted.
   *
   * The old copy said the same thing in a long paragraph plus a separate
   * line, and the owner reported it was still easy to read past. These two
   * short lines sit directly under the heading, above the filters, always
   * visible — no tooltip, no "more", no footer, no copy step. They are
   * styled as neutral information, not as a warning: an official
   * registration directory not being a live tenancy feed is a property of
   * the source, not a mistake the reader made.
   */
  basis: {
    ko: "공항공사 공식 등록 자료 · 실시간 입점 현황 아님",
    en: "Official airport-authority registration record · not live tenancy",
    zh: "机场公社官方登记资料 · 非实时入驻状况",
    ja: "空港公社の公式登録資料 · リアルタイムの入居状況ではありません",
  },
  categories: {
    DUTY_FREE: { ko: "면세점", en: "Duty-free", zh: "免税店", ja: "免税店" },
    FOOD: { ko: "식당·카페", en: "Food and cafés", zh: "餐厅·咖啡", ja: "レストラン・カフェ" },
    CONVENIENCE: { ko: "편의점", en: "Convenience", zh: "便利店", ja: "コンビニ" },
    PHARMACY: { ko: "약국", en: "Pharmacy", zh: "药店", ja: "薬局" },
    EXCHANGE_TELECOM: { ko: "환전·통신", en: "Exchange and telecom", zh: "换汇·通信", ja: "両替・通信" },
    SERVICE: { ko: "여객 서비스", en: "Passenger services", zh: "旅客服务", ja: "旅客サービス" },
  } as Record<string, Record<Lang, string>>,
  terminals: {
    T1: { ko: "제1여객터미널", en: "Terminal 1", zh: "第1航站楼", ja: "第1旅客ターミナル" },
    T2: { ko: "제2여객터미널", en: "Terminal 2", zh: "第2航站楼", ja: "第2旅客ターミナル" },
    CONCOURSE: { ko: "탑승동", en: "Concourse", zh: "登机楼", ja: "コンコース" },
    T1_TRANSPORT: { ko: "제1교통센터", en: "T1 Transport Centre", zh: "第1交通中心", ja: "第1交通センター" },
    T2_TRANSPORT: { ko: "제2교통센터", en: "T2 Transport Centre", zh: "第2交通中心", ja: "第2交通センター" },
  } as Record<string, Record<Lang, string>>,
  areaAll: { ko: "구역 전체", en: "All areas", zh: "全部区域", ja: "全エリア" },
  dutyFree: { ko: "면세구역", en: "Airside", zh: "免税区", ja: "免税エリア" },
  general: { ko: "일반구역", en: "Landside", zh: "一般区域", ja: "一般エリア" },
  sideAll: { ko: "출·입국 전체", en: "Arrival and departure", zh: "出入境全部", ja: "出入国すべて" },
  arrival: { ko: "입국장", en: "Arrival", zh: "入境区", ja: "入国場" },
  departure: { ko: "출국장", en: "Departure", zh: "出境区", ja: "出国場" },
  search: { ko: "매장·브랜드 검색", en: "Search a store or brand", zh: "搜索店铺·品牌", ja: "店舗・ブランド検索" },
  hours: { ko: "공식 영업시간 기준", en: "Official published hours", zh: "官方公布营业时间", ja: "公式営業時間基準" },
  location: { ko: "공식 위치", en: "Official location", zh: "官方位置", ja: "公式位置" },
  phone: { ko: "전화", en: "Phone", zh: "电话", ja: "電話" },
  brands: { ko: "취급 품목·브랜드", en: "Items and brands", zh: "经营品类·品牌", ja: "取扱品目・ブランド" },
  empty: { ko: "이 조건에 해당하는 공식 시설 정보가 없습니다.", en: "No official facility matches these filters.", zh: "没有符合该条件的官方设施信息。", ja: "この条件に該当する公式施設情報はありません。" },
  loading: { ko: "공식 시설 정보를 불러오는 중입니다.", en: "Loading the official facility directory.", zh: "正在载入官方设施信息。", ja: "公式施設情報を読み込んでいます。" },
  // A read that failed is not "no matching facility": the routes answer 200 with mode "degraded" on purpose.
  loadFailed: { ko: "공식 시설 정보를 지금 불러오지 못했습니다. 없는 것이 아니니 잠시 뒤 다시 열어 주세요.", en: "The official facility directory could not be loaded right now. That does not mean nothing matches; please try again shortly.", zh: "暂时无法载入官方设施信息。并不代表没有结果，请稍后再试。", ja: "公式施設情報を今は読み込めません。該当なしという意味ではありません。しばらくしてからもう一度お試しください。" },
  more: { ko: "더 보기", en: "Show more", zh: "查看更多", ja: "もっと見る" },
  count: { ko: (n: number) => `${n}곳 표시`, en: (n: number) => `${n} shown`, zh: (n: number) => `显示 ${n} 处`, ja: (n: number) => `${n}件を表示` },
  unknown: { ko: "확인 불가", en: "Unavailable", zh: "暂无法确认", ja: "確認不可" },
  /**
   * The directory is a registration record, not a live tenancy feed. A shop
   * that has already left can remain listed until the operator republishes;
   * a reader who trusts a store that is not there has been misled by the
   * screen, so the screen says this before they trust anything.
   *
   * KORETAIL never resolves that gap by deleting a facility it privately
   * believes is gone — that would quietly turn one person's workplace
   * knowledge into a public-data override, and the product would stop being
   * something anyone can verify against the official source. It shows the
   * official record and states the limitation instead.
   */
  staleness: {
    ko: "공식 자료가 갱신되기 전에는 이미 퇴점한 매장이 표시될 수 있습니다",
    en: "Until the operator republishes, a store that has already left may still be listed",
    zh: "官方资料更新前，已撤店的店铺可能仍会显示",
    ja: "公式資料が更新されるまで、すでに退店した店舗が表示される場合があります",
  },
  /**
   * Dataset 15095064 returns sn, arrordep, facilityitem, facilitynm,
   * floorinfo, goods, lcategorynm, lcduty, lcnm, mcategorynm, scategorynm,
   * servicetime, tel and terminalid — and no date of any kind. So KORETAIL
   * cannot show when a facility actually changed, and says that rather than
   * passing its own retrieval time off as the provider's update time. The
   * two are different facts.
   */
  noProviderChangeDate: {
    ko: "공급자가 개별 시설의 실제 변경일은 제공하지 않습니다",
    en: "The provider publishes no change date for individual facilities",
    zh: "供应方不提供各设施的实际变更日期",
    ja: "提供元は個別施設の実際の変更日を提供していません",
  },
  /** The per-card provenance label: what this row is, in two words. */
  recordLabel: {
    ko: "공식 등록 자료",
    en: "Official registration record",
    zh: "官方登记资料",
    ja: "公式登録資料",
  },
  copy: { ko: "정보 복사", en: "Copy details", zh: "复制信息", ja: "情報をコピー" },
  copied: { ko: "복사했습니다", en: "Copied", zh: "已复制", ja: "コピーしました" },
  copyFailed: { ko: "복사할 수 없습니다", en: "Could not copy", zh: "无法复制", ja: "コピーできません" },
  locationVerified: { ko: "위치 확인됨", en: "Location verified", zh: "位置已确认", ja: "位置確認済み" },
  locationAmbiguous: { ko: "정확한 위치 미확인", en: "Exact location unconfirmed", zh: "确切位置未确认", ja: "正確な位置は未確認" },
  nearGate: { ko: "게이트", en: "Gate", zh: "登机口", ja: "ゲート" },
  nearCheckpoint: { ko: "출국장", en: "Checkpoint", zh: "出境区", ja: "出国場" },
  mappingBasis: {
    ko: "게이트·출국장은 공식 위치 표기에 직접 적혀 있는 경우에만 표시합니다",
    en: "A gate or checkpoint is shown only where the official location text itself names one",
    zh: "仅在官方位置说明本身写明登机口或出境区时显示",
    ja: "ゲート・出国場は公式の位置表記に直接記載されている場合のみ表示します",
  },
  source: {
    ko: "출처: 인천국제공항공사 여객터미널 시설정보 현황 (공공데이터포털 15095064)",
    en: "Source: Incheon International Airport Corporation passenger-terminal facility information (Public Data Portal 15095064)",
    zh: "来源：仁川国际机场公社 旅客航站楼设施信息现况（公共数据门户 15095064）",
    ja: "出典: 仁川国際空港公社 旅客ターミナル施設情報現況 (公共データポータル 15095064)",
  },
} as const;

const FACILITY_CATEGORY_ORDER = ["DUTY_FREE", "FOOD", "CONVENIENCE", "PHARMACY", "EXCHANGE_TELECOM", "SERVICE"] as const;
const FACILITY_TERMINAL_ORDER = ["T1", "T2", "CONCOURSE", "T1_TRANSPORT", "T2_TRANSPORT"] as const;

type FacilityDisplayText = { text: string; lang: Lang; providerOwned: boolean };

function facilityNameValue(row: FacilityRow, lang: Lang): FacilityDisplayText {
  const preferred: Array<[string | null, Lang]> = lang === "en" ? [[row.nameEn, "en"], [row.nameKo, "ko"]]
    : lang === "ja" ? [[row.nameJa, "ja"], [row.nameKo, "ko"]]
      : lang === "zh" ? [[row.nameZh, "zh"], [row.nameKo, "ko"]]
        : [[row.nameKo, "ko"], [row.nameEn, "en"]];
  const picked = preferred.find(([value]) => Boolean(value));
  return picked
    ? { text: picked[0] as string, lang: picked[1], providerOwned: true }
    : { text: facilityText.unknown[lang], lang, providerOwned: false };
}

function facilityName(row: FacilityRow, lang: Lang): string {
  return facilityNameValue(row, lang).text;
}

function facilityRawValue(value: string | null, fallback: string, lang: Lang): FacilityDisplayText {
  return value
    ? { text: value, lang: "ko", providerOwned: true }
    : { text: fallback, lang, providerOwned: false };
}

function facilityLocationValue(row: FacilityRow, lang: Lang): FacilityDisplayText {
  if (lang === "en" && row.locationEn) return { text: row.locationEn, lang: "en", providerOwned: true };
  return facilityRawValue(row.locationRaw, facilityText.unknown[lang], lang);
}

function FacilityProviderText({ value }: { value: FacilityDisplayText }) {
  const classes = [
    value.providerOwned ? "airport-provider-text" : "",
    value.providerOwned && value.lang === "ko" ? "airport-official-ko" : "",
  ].filter(Boolean).join(" ");
  // The provider sometimes uses U+2219 as a visual list separator. None of
  // the pinned Korean/CJK sources carries it, while U+00B7 is the same neutral
  // separator already used throughout this UI. Normalize only the rendered
  // copy; clipboard/source data retains the provider's original character.
  const displayText = value.providerOwned ? value.text.replaceAll("∙", "·") : value.text;
  return <span className={classes || undefined} lang={value.lang}>{displayText}</span>;
}

/**
 * Copy-to-clipboard, as a hook so every surface that copies behaves the same.
 *
 * `navigator.clipboard` needs a secure context and can be refused outright, so
 * a failure is reported to the reader rather than swallowed — a button that
 * silently does nothing is worse than one that says it could not.
 */
function useCopyToClipboard(resetAfterMs = 2000) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), resetAfterMs);
    return () => window.clearTimeout(timer);
  }, [state, resetAfterMs]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  };
  return { state, copy };
}

/** The copy control on a facility card, with its own live-region feedback. */
function FacilityCopyButton({ facility, lang }: { facility: CopyableFacility; lang: Lang }) {
  const { state, copy } = useCopyToClipboard();
  const label = state === "copied" ? facilityText.copied[lang]
    : state === "failed" ? facilityText.copyFailed[lang]
      : facilityText.copy[lang];
  return <p className="facility-copy">
    <button
      type="button"
      onClick={() => void copy(buildFacilityCopyText(facility, lang, {
        location: facilityText.location[lang],
        hours: facilityText.hours[lang],
        brands: facilityText.brands[lang],
        phone: facilityText.phone[lang],
        unknown: facilityText.unknown[lang],
      }))}
    >{label}</button>
    <span role="status" aria-live="polite" className="sr-only">{state === "idle" ? "" : label}</span>
  </p>;
}

/** Shapes a directory row for copying, using the same localized labels the card shows. */
function copyableFacility(row: FacilityRow, lang: Lang): CopyableFacility {
  return {
    name: facilityName(row, lang),
    facilityItem: row.facilityItem,
    terminalLabel: row.terminal ? facilityText.terminals[row.terminal]?.[lang] ?? row.terminal : null,
    floor: row.floor,
    areaLabel: row.dutyArea ? (row.dutyArea === "DUTY_FREE" ? facilityText.dutyFree[lang] : facilityText.general[lang]) : null,
    sideLabel: row.arrivalDeparture ? (row.arrivalDeparture === "ARRIVAL" ? facilityText.arrival[lang] : facilityText.departure[lang]) : null,
    locationRaw: lang === "en" ? row.locationEn ?? row.locationRaw : row.locationRaw,
    businessHoursRaw: row.businessHoursRaw,
    goodsBrands: row.goodsBrands,
    phone: row.phone,
  };
}

/**
 * A3 location status, stated on every card.
 *
 * A facility whose official location text names a gate says so and shows it.
 * A facility whose text does not is told plainly that its exact position is
 * unconfirmed — it keeps the terminal, floor and area the provider published,
 * and is never given a nearby gate. Uncertainty is shown, not hidden: a shop
 * with no proven position must never look like one with a proven position.
 */
function FacilityLocationStatus({ row, lang }: { row: FacilityRow; lang: Lang }) {
  if (!row.mappingMethod) return null;
  const verified = row.mappingMethod !== "AMBIGUOUS";
  const zones = verified ? [
    row.gate ? `${facilityText.nearGate[lang]} ${row.gate}` : null,
    row.gateGroup ? `${facilityText.nearGate[lang]} ${row.gateGroup}` : null,
    row.checkpointId ? `${facilityText.nearCheckpoint[lang]} ${row.checkpointId}` : null,
  ].filter(Boolean) : [];
  return <p className={`facility-location-status${verified ? " verified" : ""}`}>
    <span>{verified ? facilityText.locationVerified[lang] : facilityText.locationAmbiguous[lang]}</span>
    {zones.map((zone) => <span key={zone}>{zone}</span>)}
  </p>;
}

/**
 * The official facility directory. Loaded only when this tab opens, because
 * it is a browsable list most visitors never need and every row it reads is
 * a D1 row read. Never claims a store is open now: the provider publishes
 * registered hours, so the card says "official published hours".
 */
export function FacilityDirectory({ lang, terminal }: { lang: Lang; terminal: "all" | "T1" | "T2" }) {
  const [pickedTerminal, setPickedTerminal] = useState<string>("T1");
  const [category, setCategory] = useState<string>("DUTY_FREE");
  const [area, setArea] = useState<"" | "DUTY_FREE" | "GENERAL">("");
  const [side, setSide] = useState<"" | "ARRIVAL" | "DEPARTURE">("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(60);
  // The page-level terminal selector leads; it is derived rather than copied
  // into state so choosing T1 up there can never disagree with this list.
  const scopeTerminal = terminal === "all" ? pickedTerminal : terminal;
  const params = new URLSearchParams({ terminal: scopeTerminal, category, limit: String(limit) });
  if (area) params.set("area", area);
  if (side) params.set("side", side);
  if (query.trim()) params.set("q", query.trim());
  const requestKey = params.toString();
  // The answered request is tracked with its own key and compared during
  // render, so changing a filter shows "loading" without clearing state from
  // inside the effect — and a slow earlier answer can never overwrite a newer.
  const [loaded, setLoaded] = useState<{ key: string; rows: FacilityRow[]; hasMore: boolean; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/airport/facilities?${requestKey}`, { headers: { accept: "application/json" } })
      .then(async (response) => {
        const json = response.ok ? await response.json() as { mode?: string; facilities?: FacilityRow[]; hasMore?: boolean } : null;
        return json && json.mode === "airport-facilities" ? { facilities: json.facilities, hasMore: json.hasMore, failed: false } : { facilities: [] as FacilityRow[], hasMore: false, failed: true };
      })
      .catch(() => ({ facilities: [] as FacilityRow[], hasMore: false, failed: true }))
      .then((payload) => { if (active) setLoaded({ key: requestKey, rows: payload.facilities ?? [], hasMore: Boolean(payload.hasMore), failed: payload.failed }); });
    return () => { active = false; };
  }, [requestKey]);

  const state = loaded && loaded.key === requestKey ? loaded : null;
  const rows = state?.rows ?? [];
  return <section className="airport-facilities" aria-labelledby="airport-facilities-title">
    <div className="section-head">
      <div><p className="eyebrow">OFFICIAL FACILITY DIRECTORY</p><h2 id="airport-facilities-title">{facilityText.title[lang]}</h2></div>
      {state && !state.failed && <span className="official-label">{facilityText.count[lang](rows.length)}</span>}
    </div>
    {/*
      * The basis, before the filters. Both lines are always on screen: the
      * reader must know this is a registration record, not a live tenancy
      * feed, BEFORE they trust a result — not after opening something.
      */}
    <div className="facility-basis">
      <p className="facility-basis-head">{facilityText.basis[lang]}</p>
      <p>{facilityText.staleness[lang]}</p>
      <p>{facilityText.noProviderChangeDate[lang]}</p>
    </div>

    <div className="facility-filters">
      <div className="facility-filter-row" role="tablist" aria-label={facilityText.title[lang]}>
        {FACILITY_TERMINAL_ORDER.map((item) => <button
          key={item}
          type="button"
          className={scopeTerminal === item ? "active" : ""}
          onClick={() => { setPickedTerminal(item); setLimit(60); }}
          role="tab"
          aria-selected={scopeTerminal === item}
        >{facilityText.terminals[item][lang]}</button>)}
      </div>
      <div className="facility-filter-row" role="tablist" aria-label={facilityText.categories.DUTY_FREE[lang]}>
        {FACILITY_CATEGORY_ORDER.map((item) => <button
          key={item}
          type="button"
          className={category === item ? "active" : ""}
          onClick={() => { setCategory(item); setLimit(60); }}
          role="tab"
          aria-selected={category === item}
        >{facilityText.categories[item][lang]}</button>)}
      </div>
      <div className="facility-filter-row">
        {([["", facilityText.areaAll[lang]], ["GENERAL", facilityText.general[lang]], ["DUTY_FREE", facilityText.dutyFree[lang]]] as const).map(([value, label]) => <button
          key={label}
          type="button"
          className={area === value ? "active" : ""}
          onClick={() => { setArea(value as "" | "DUTY_FREE" | "GENERAL"); setLimit(60); }}
        >{label}</button>)}
        {([["", facilityText.sideAll[lang]], ["DEPARTURE", facilityText.departure[lang]], ["ARRIVAL", facilityText.arrival[lang]]] as const).map(([value, label]) => <button
          key={label}
          type="button"
          className={side === value ? "active" : ""}
          onClick={() => { setSide(value as "" | "ARRIVAL" | "DEPARTURE"); setLimit(60); }}
        >{label}</button>)}
      </div>
      <label className="facility-search">
        <span className="sr-only">{facilityText.search[lang]}</span>
        <input
          type="search"
          value={query}
          placeholder={facilityText.search[lang]}
          onChange={(event) => { setQuery(event.target.value); setLimit(60); }}
        />
      </label>
    </div>

    {state === null ? <p className="airport-empty-line">{facilityText.loading[lang]}</p>
      : state.failed ? <p className="airport-empty-line" role="status" data-testid="facility-load-failed">{facilityText.loadFailed[lang]}</p>
      : rows.length === 0 ? <p className="airport-empty-line">{facilityText.empty[lang]}</p>
        : <ul className="facility-list">
          {rows.map((row) => <li key={row.facilityId} className="facility-card">
            <div className="facility-card-head">
              <h3><FacilityProviderText value={facilityNameValue(row, lang)} /></h3>
              <p className="facility-badges">
                <span>{row.terminal ? facilityText.terminals[row.terminal]?.[lang] ?? row.terminal : facilityText.unknown[lang]}</span>
                {row.floor && <span><FacilityProviderText value={facilityRawValue(row.floor, facilityText.unknown[lang], lang)} /></span>}
                {row.dutyArea && <span>{row.dutyArea === "DUTY_FREE" ? facilityText.dutyFree[lang] : facilityText.general[lang]}</span>}
                {row.arrivalDeparture && <span>{row.arrivalDeparture === "ARRIVAL" ? facilityText.arrival[lang] : facilityText.departure[lang]}</span>}
              </p>
            </div>
            <dl className="facility-details">
              <div><dt>{facilityText.location[lang]}</dt><dd><FacilityProviderText value={facilityLocationValue(row, lang)} /></dd></div>
              <div><dt>{facilityText.hours[lang]}</dt><dd><FacilityProviderText value={facilityRawValue(row.businessHoursRaw, facilityText.unknown[lang], lang)} /></dd></div>
              {row.goodsBrands && <div><dt>{facilityText.brands[lang]}</dt><dd><FacilityProviderText value={facilityRawValue(row.goodsBrands, facilityText.unknown[lang], lang)} /></dd></div>}
              {row.phone && <div><dt>{facilityText.phone[lang]}</dt><dd>{row.phone}</dd></div>}
            </dl>
            <FacilityLocationStatus row={row} lang={lang} />
            {/*
              * What this row IS, on the row itself. Two neutral words, so a
              * card lifted out of its section by search or a screen reader
              * still carries its own provenance — without turning every
              * card into a repeated warning.
              */}
            <p className="facility-record-label">{facilityText.recordLabel[lang]}</p>
            <FacilityCopyButton facility={copyableFacility(row, lang)} lang={lang} />
          </li>)}
        </ul>}

    {state?.hasMore && <button type="button" className="event-list-toggle" onClick={() => setLimit((value) => Math.min(120, value + 60))}>{facilityText.more[lang]}</button>}
    <p className="airport-detail-foot">{facilityText.mappingBasis[lang]}</p>
    <p className="airport-detail-foot">{facilityText.source[lang]}</p>
  </section>;
}

/* ── A4 · My store: the operations brief for one selected facility ────── */

const myStoreText = {
  title: { ko: "내 매장 찾기", en: "Find my store", zh: "查找我的店铺", ja: "自分の店舗を探す" },
  intro: {
    ko: "공식 시설 목록에서 매장을 고르면, 그 매장이 속한 터미널의 공식 신호를 한 화면에 정리합니다. 이 기기에만 저장되며 로그인은 없습니다.",
    en: "Pick your store from the official facility list and the official signals for its terminal are gathered on one screen. Saved on this device only; there is no sign-in.",
    zh: "从官方设施列表中选择店铺，即可在一个页面查看该航站楼的官方信号。仅保存在本设备，无需登录。",
    ja: "公式施設リストから店舗を選ぶと、その店舗が属するターミナルの公式シグナルを一画面にまとめます。この端末にのみ保存され、ログインはありません。",
  },
  search: { ko: "매장·브랜드·업종 검색", en: "Search a store, brand or category", zh: "搜索店铺·品牌·业态", ja: "店舗・ブランド・業種を検索" },
  choose: { ko: "이 매장 선택", en: "Select this store", zh: "选择该店铺", ja: "この店舗を選択" },
  change: { ko: "다른 매장 선택", en: "Choose another store", zh: "选择其他店铺", ja: "別の店舗を選ぶ" },
  selected: { ko: "선택한 매장", en: "Selected store", zh: "已选店铺", ja: "選択した店舗" },
  empty: { ko: "검색 결과가 없습니다", en: "No matching store", zh: "没有匹配的店铺", ja: "該当する店舗がありません" },
  loading: { ko: "공식 자료를 불러오는 중입니다", en: "Loading the official record", zh: "正在载入官方资料", ja: "公式資料を読み込んでいます" },
  briefTitle: { ko: "공항 리테일 운영 스냅샷", en: "Airport retail operations snapshot", zh: "机场零售运营快照", ja: "空港リテール運営スナップショット" },
  windows: { ko: "출발 예정 항공편", en: "Departures scheduled", zh: "预定出发航班", ja: "出発予定便" },
  minutes: { ko: "분 내", en: "min", zh: "分钟内", ja: "分以内" },
  flightsUnit: { ko: "편", en: "flights", zh: "班", ja: "便" },
  nextBand: { ko: "다음 공식 예상 시간대", en: "Next official expected band", zh: "下一官方预计时段", ja: "次の公式予想時間帯" },
  nextPeak: { ko: "남은 시간 중 공식 최대 예상", en: "Largest official band still ahead", zh: "剩余时段中官方最大预计", ja: "残り時間帯の公式最大予想" },
  passengersUnit: { ko: "명", en: "passengers", zh: "人", ja: "人" },
  checkpoint: { ko: "현재 출국장 관측", en: "Current departure-hall observation", zh: "当前出境区观测", ja: "現在の出国場観測" },
  waitMinutes: { ko: "대기", en: "wait", zh: "等候", ja: "待ち" },
  waitingCount: { ko: "대기 인원", en: "waiting", zh: "等候人数", ja: "待ち人数" },
  reference: { ko: "KORETAIL 운영 참고", en: "KORETAIL operating reference", zh: "KORETAIL 运营参考", ja: "KORETAIL 運営参考" },
  evidence: { ko: "사용한 근거", en: "Evidence used", zh: "所用依据", ja: "使用した根拠" },
  missing: { ko: "없는 근거", en: "Missing evidence", zh: "缺少的依据", ja: "不足している根拠" },
  freshness: { ko: "자료 수집 시각", en: "Source freshness", zh: "资料采集时间", ja: "資料取得時刻" },
  generated: { ko: "생성 시각", en: "Generated at", zh: "生成时间", ja: "生成時刻" },
  print: { ko: "브리핑 인쇄", en: "Print briefing", zh: "打印简报", ja: "ブリーフィングを印刷" },
  none: { ko: "없음", en: "none", zh: "无", ja: "なし" },
  noTerminal: {
    ko: "이 시설은 공식 자료에 터미널이 표기되어 있지 않아, 터미널 단위 신호를 연결하지 않았습니다",
    en: "The official record gives this facility no terminal, so no terminal-level signal is attached to it",
    zh: "官方资料未标明该设施所属航站楼，因此未关联航站楼级信号",
    ja: "公式資料にターミナルの記載がないため、ターミナル単位のシグナルは接続していません",
  },
  /** The disclaimer the owner requires beside every operating reference. */
  disclaimer: {
    ko: "공식 승객·항공편·출국장 데이터를 바탕으로 정리한 운영 참고이며 실제 매장 방문자 수나 매출을 의미하지 않습니다",
    en: "An operating reference compiled from official passenger, flight and departure-hall data. It does not mean store visitors or sales",
    zh: "基于官方旅客、航班与出境区数据整理的运营参考，并不代表实际到店人数或销售额",
    ja: "公式の旅客・運航・出国場データをもとに整理した運営参考であり、実際の来店客数や売上を意味しません",
  },
  evidenceLabels: {
    FLIGHTS: { ko: "출발 항공편", en: "Departures", zh: "出发航班", ja: "出発便" },
    PASSENGER_FORECAST: { ko: "출국장 공식 예상 승객", en: "Official departure-hall passenger forecast", zh: "出境大厅官方预计旅客", ja: "出国場公式予想旅客" },
    CHECKPOINT: { ko: "출국장 관측", en: "Departure-hall observation", zh: "出境区观测", ja: "出国場観測" },
    ZONE_MAPPING: { ko: "위치 매핑", en: "Location mapping", zh: "位置映射", ja: "位置マッピング" },
  },
  /**
   * The operating reference wording. These are KORETAIL readings of official
   * signals, and the card says so directly beneath them.
   */
  referenceLabels: {
    INFLOW_WAITING: { ko: "유입 대기", en: "Inflow held at the checkpoint", zh: "入场等候", ja: "流入待ち" },
    FLOW_RISING: { ko: "유동 상승", en: "Flow rising", zh: "客流上升", ja: "流動上昇" },
    CONCENTRATED_NOW: { ko: "현재 집중", en: "Concentrated now", zh: "当前集中", ja: "現在集中" },
    FAST_PURCHASE_WATCH: { ko: "빠른 구매 대응 확인", en: "Watch for quick purchases", zh: "留意快速购买", ja: "短時間購買への対応確認" },
    STABLE: { ko: "운영 안정", en: "Operations steady", zh: "运营平稳", ja: "運営安定" },
    INSUFFICIENT_EVIDENCE: { ko: "판단 근거 부족", en: "Not enough evidence to say", zh: "判断依据不足", ja: "判断根拠が不足" },
  },
} as const;

type OperationsResponse = {
  mode: string;
  generatedAt: string;
  facility: FacilityRow | null;
  mapping?: { mappingMethod: FacilityRow["mappingMethod"]; gate: string | null; gateGroup: string | null; checkpointId: string | null } | null;
  brief: {
    terminal: string | null;
    windows: Array<{ minutes: number; flights: number }>;
    nextBand: { targetStartAt: string; targetEndAt: string; expectedPassengers: number } | null;
    nextPeak: { targetStartAt: string; targetEndAt: string; expectedPassengers: number } | null;
    checkpoint: { zone: string; waitTimeMinutes: number | null; waitTimeRaw?: string | null; waitingCount: number | null; observedAt: string } | null;
    operatingReference: keyof typeof myStoreText.referenceLabels;
    evidence: Array<keyof typeof myStoreText.evidenceLabels>;
    missingEvidence: Array<keyof typeof myStoreText.evidenceLabels>;
    sourceRetrievedAt: Record<string, string | null>;
    generatedAt: string;
  } | null;
};

const MY_STORE_KEY = "koretail-my-facility";

function bandClock(value: string, lang: Lang): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(airportLocale(lang), {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(parsed);
}

/**
 * A4 — pick one official facility, then read the official signals its own
 * terminal actually publishes.
 *
 * The store is chosen from the A2 directory, so it is always a real published
 * facility; the id lives in localStorage on this device, with no account and
 * no server-side profile. Everything under the header keeps its own kind and
 * its own name, because the risk this screen carries is a reader collapsing
 * four different official measurements into "how busy my shop will be".
 */
export function MyStoreBriefing({ lang }: { lang: Lang }) {
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FacilityRow[] | "failed" | null>(null);
  const [operations, setOperations] = useState<OperationsResponse | "failed" | null>(null);

  // Deferred to a task, matching how the app reads its other stored
  // preferences: a synchronous setState inside an effect cascades a render.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(MY_STORE_KEY);
        if (saved && /^\d{1,12}$/.test(saved)) setFacilityId(saved);
      } catch {
        // Device-local storage is a convenience; the screen works without it.
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      if (facilityId) window.localStorage.setItem(MY_STORE_KEY, facilityId);
      else window.localStorage.removeItem(MY_STORE_KEY);
    } catch {
      // Storage is optional.
    }
  }, [facilityId, ready]);

  const trimmed = query.trim();
  useEffect(() => {
    let active = true;
    const idle = facilityId || trimmed.length < 2;
    const timer = window.setTimeout(() => {
      if (idle) { if (active) setResults(null); return; }
      fetch(`/api/airport/facilities?q=${encodeURIComponent(trimmed)}&limit=20`, { headers: { accept: "application/json" } })
        .then(async (response) => {
          const json = response.ok ? await response.json() as { mode?: string; facilities?: FacilityRow[] } : null;
          return json && json.mode === "airport-facilities" ? (json.facilities ?? []) : "failed" as const;
        })
        .catch(() => "failed" as const)
        .then((found) => { if (active) setResults(found); });
    }, idle ? 0 : 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [trimmed, facilityId]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setOperations(null);
      if (!facilityId) return;
      fetch(`/api/airport/facility-operations?facilityId=${encodeURIComponent(facilityId)}`, { headers: { accept: "application/json" } })
        .then(async (response) => {
          // 404 with mode "facility-not-found" is a real answer (the store does not exist); anything else that is not the brief is a failed read.
          const json = await response.json().catch(() => null) as OperationsResponse | null;
          return json && (json.mode === "facility-operations" || json.mode === "facility-not-found") ? json : "failed" as const;
        })
        .catch(() => "failed" as const)
        .then((payload) => { if (active) setOperations(payload); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [facilityId]);

  return <section className="my-store" aria-labelledby="my-store-title">
    <div className="section-head">
      <div><p className="eyebrow">KORETAIL · MY STORE</p><h2 id="my-store-title">{myStoreText.title[lang]}</h2></div>
      {facilityId && <button type="button" className="event-list-toggle" onClick={() => { setFacilityId(null); setQuery(""); }}>{myStoreText.change[lang]}</button>}
    </div>
    <p className="section-intro">{myStoreText.intro[lang]}</p>

    {!facilityId && <>
      <label className="facility-search">
        <span className="sr-only">{myStoreText.search[lang]}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={myStoreText.search[lang]} />
      </label>
      {results === "failed" && <p className="airport-empty-line" role="status" data-testid="my-store-search-failed">{facilityText.loadFailed[lang]}</p>}
      {results !== null && results !== "failed" && (results.length === 0
        ? <p className="airport-empty-line">{myStoreText.empty[lang]}</p>
        : <ul className="my-store-results">
          {results.map((row) => <li key={row.facilityId}>
            <button type="button" onClick={() => setFacilityId(row.facilityId)}>
              <strong><FacilityProviderText value={facilityNameValue(row, lang)} /></strong>
              <span>
                {row.terminal ? facilityText.terminals[row.terminal]?.[lang] ?? row.terminal : facilityText.unknown[lang]}
                {row.floor && <> · <FacilityProviderText value={facilityRawValue(row.floor, facilityText.unknown[lang], lang)} /></>}
                {row.facilityItem && <> · <FacilityProviderText value={facilityRawValue(row.facilityItem, facilityText.unknown[lang], lang)} /></>}
              </span>
            </button>
          </li>)}
        </ul>)}
    </>}

    {facilityId && <MyStoreSnapshot lang={lang} operations={operations} />}
  </section>;
}

/** The snapshot itself: official header first, then only evidence-backed context. */
function MyStoreSnapshot({ lang, operations }: { lang: Lang; operations: OperationsResponse | "failed" | null }) {
  if (!operations) return <p className="airport-empty-line">{myStoreText.loading[lang]}</p>;
  if (operations === "failed") return <p className="airport-empty-line" role="status" data-testid="my-store-failed">{facilityText.loadFailed[lang]}</p>;
  const { facility, brief } = operations;
  if (!facility) return <p className="airport-empty-line">{facilityText.empty[lang]}</p>;
  const locale = airportLocale(lang);
  const count = (value: number) => value.toLocaleString(locale);

  return <article className="my-store-brief">
    <header>
      <h3><FacilityProviderText value={facilityNameValue(facility, lang)} /></h3>
      <p className="facility-badges">
        {facility.facilityItem && <span><FacilityProviderText value={facilityRawValue(facility.facilityItem, facilityText.unknown[lang], lang)} /></span>}
        <span>{facility.terminal ? facilityText.terminals[facility.terminal]?.[lang] ?? facility.terminal : facilityText.unknown[lang]}</span>
        {facility.floor && <span><FacilityProviderText value={facilityRawValue(facility.floor, facilityText.unknown[lang], lang)} /></span>}
        {facility.dutyArea && <span>{facility.dutyArea === "DUTY_FREE" ? facilityText.dutyFree[lang] : facilityText.general[lang]}</span>}
        {facility.arrivalDeparture && <span>{facility.arrivalDeparture === "ARRIVAL" ? facilityText.arrival[lang] : facilityText.departure[lang]}</span>}
      </p>
      <dl className="facility-details">
        <div><dt>{facilityText.location[lang]}</dt><dd><FacilityProviderText value={facilityLocationValue(facility, lang)} /></dd></div>
        <div><dt>{facilityText.hours[lang]}</dt><dd><FacilityProviderText value={facilityRawValue(facility.businessHoursRaw, facilityText.unknown[lang], lang)} /></dd></div>
        {facility.phone && <div><dt>{facilityText.phone[lang]}</dt><dd>{facility.phone}</dd></div>}
      </dl>
      <FacilityLocationStatus row={facility} lang={lang} />
      {/*
        * Saving a store does not make its record live. This is the same
        * basis the directory shows, kept on the selected store and inside
        * the printed briefing — a sheet handed to someone else must not
        * arrive without it.
        */}
      <div className="facility-basis">
        <p className="facility-basis-head">{facilityText.basis[lang]}</p>
        <p>{facilityText.staleness[lang]}</p>
        <p>{facilityText.noProviderChangeDate[lang]}</p>
      </div>
      <FacilityCopyButton facility={copyableFacility(facility, lang)} lang={lang} />
    </header>

    {!brief || !brief.terminal
      ? <p className="airport-empty-line">{myStoreText.noTerminal[lang]}</p>
      : <>
        <h4>{myStoreText.briefTitle[lang]}</h4>
        <dl className="my-store-metrics">
          {brief.windows.map((window) => <div key={window.minutes}>
            <dt>{myStoreText.windows[lang]} · {window.minutes}{myStoreText.minutes[lang]}</dt>
            <dd>{count(window.flights)}{lang === "ko" || lang === "ja" || lang === "zh" ? myStoreText.flightsUnit[lang] : ` ${myStoreText.flightsUnit[lang]}`}</dd>
          </div>)}
          {brief.nextBand && <div>
            <dt>{myStoreText.nextBand[lang]}</dt>
            <dd>{bandClock(brief.nextBand.targetStartAt, lang)}–{bandClock(brief.nextBand.targetEndAt, lang)} · {count(brief.nextBand.expectedPassengers)}{myStoreText.passengersUnit[lang]}</dd>
          </div>}
          {brief.nextPeak && <div>
            <dt>{myStoreText.nextPeak[lang]}</dt>
            <dd>{bandClock(brief.nextPeak.targetStartAt, lang)}–{bandClock(brief.nextPeak.targetEndAt, lang)} · {count(brief.nextPeak.expectedPassengers)}{myStoreText.passengersUnit[lang]}</dd>
          </div>}
          {brief.checkpoint && <div>
            <dt>{myStoreText.checkpoint[lang]}</dt>
            <dd>{friendlyCheckpointName(brief.checkpoint.zone, lang)} · {brief.checkpoint.waitTimeRaw ?? brief.checkpoint.waitTimeMinutes ?? "—"}{myStoreText.waitMinutes[lang]}
              {brief.checkpoint.waitingCount !== null && ` · ${myStoreText.waitingCount[lang]} ${count(brief.checkpoint.waitingCount)}`}</dd>
          </div>}
        </dl>

        <p className="my-store-reference">
          <span>{myStoreText.reference[lang]}</span>
          <strong>{myStoreText.referenceLabels[brief.operatingReference][lang]}</strong>
        </p>
        <p className="my-store-disclaimer">{myStoreText.disclaimer[lang]}</p>

        <p className="my-store-meta">
          <span>{myStoreText.evidence[lang]}: {brief.evidence.length
            ? brief.evidence.map((item) => myStoreText.evidenceLabels[item][lang]).join(" · ")
            : myStoreText.none[lang]}</span>
          <span>{myStoreText.missing[lang]}: {brief.missingEvidence.length
            ? brief.missingEvidence.map((item) => myStoreText.evidenceLabels[item][lang]).join(" · ")
            : myStoreText.none[lang]}</span>
          <span>{myStoreText.freshness[lang]}: {Object.entries(brief.sourceRetrievedAt)
            .filter(([, value]) => Boolean(value))
            .map(([key, value]) => `${key} ${bandClock(String(value), lang)}`).join(" · ") || myStoreText.none[lang]}</span>
          <span>{myStoreText.generated[lang]}: {bandClock(brief.generatedAt, lang)} KST</span>
        </p>
      </>}

    <p className="airport-detail-foot">{facilityText.source[lang]}</p>
    <button type="button" className="event-list-toggle no-print" onClick={() => window.print()}>{myStoreText.print[lang]}</button>
  </article>;
}

const flightBoardText = {
  search: { ko: "항공편·도시 검색", en: "Search flight or city", zh: "搜索航班或城市", ja: "便名・都市を検索" },
  hint: { ko: "편명 또는 도착지 코드", en: "Flight number or destination code", zh: "航班号或目的地代码", ja: "便名または到着地コード" },
  departures: { ko: "출발", en: "Departures", zh: "出发", ja: "出発" },
  arrivals: { ko: "도착", en: "Arrivals", zh: "到达", ja: "到着" },
  none: { ko: "조건에 맞는 항공편이 없습니다.", en: "No flights match this search.", zh: "没有符合条件的航班。", ja: "条件に合う便がありません。" },
  empty: { ko: "이 날짜의 운항 기록이 저장되어 있지 않습니다.", en: "No flight record is stored for this date.", zh: "该日期没有已存储的航班记录。", ja: "この日付の運航記録は保存されていません。" },
  gate: { ko: "게이트", en: "Gate", zh: "登机口", ja: "ゲート" },
  counter: { ko: "카운터", en: "Counter", zh: "柜台", ja: "カウンター" },
  showing: { ko: (shown: number, total: number) => `${total.toLocaleString("ko-KR")}편 중 ${shown.toLocaleString("ko-KR")}편 표시`, en: (shown: number, total: number) => `Showing ${shown} of ${total} flights`, zh: (shown: number, total: number) => `显示${total}班中的${shown}班`, ja: (shown: number, total: number) => `${total}便中${shown}便を表示` },
} as const;

/**
 * The flight lookup, backed by the official flight rows stored for the
 * selected KST day. Everything shown — number, airline, destination, terminal,
 * gate, counter, status, time — is what the provider published for that flight.
 */
export function FlightBoard({ lang, terminal, date = null }: { lang: Lang; terminal: "all" | "T1" | "T2"; date?: string | null }) {
  const summary = useLiveSummary(date);
  const requestDate = date ?? summary?.serviceDateKst ?? null;
  const [visibleCount, setVisibleCount] = useState(10);
  const [direction, setDirection] = useState<"departure" | "arrival">("departure");
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<"ALL" | GateSide>("ALL");
  const [loaded, setLoaded] = useState<{ date: string; rows: LiveFlightRow[]; failed: boolean; truncated: boolean; basis?: string; retrievedAt?: string | null; terminalFallbacks?:Record<string,TerminalFlightFallback<LiveFlightRow>> } | null>(null);
  // Changing the date must not leave the previous day's flights on screen, so
  // the loaded date is tracked alongside the rows and compared during render
  // rather than cleared from inside the effect.
  const fallback = terminal==='all'?undefined:loaded?.terminalFallbacks?.[terminal];
  const selected = fallback ?? loaded;
  const flights = loaded && loaded.date === requestDate ? fallback?.flights ?? loaded.rows : null;
  // Loaded here rather than with the summary: the board reads far more rows
  // than the rest of the product, so it is fetched only once this tab opens.
  useEffect(() => {
    if (!requestDate) return;
    let active = true;
    const url = `/api/live/flights?date=${encodeURIComponent(requestDate)}`;
    fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) })
      .then(async (response) => (response.ok ? await response.json() as { mode?: string; serviceDateKst?: string; flights?: LiveFlightRow[]; truncated?: boolean; basis?: string; retrievedAt?: string | null; terminalFallbacks?:Record<string,TerminalFlightFallback<LiveFlightRow>> } : null))
      .catch(() => null)
      .then((payload) => {
        if (!active) return;
        const failed = !payload || payload.mode !== 'live-flights' || (payload.serviceDateKst && payload.serviceDateKst !== requestDate);
        setLoaded(previous => failed && previous?.date === requestDate && !previous.failed
          ? previous
          : { date: requestDate, rows: failed ? [] : payload?.flights ?? [], failed: Boolean(failed), truncated: payload?.truncated ?? false, basis: payload?.basis, retrievedAt: payload?.retrievedAt, terminalFallbacks:payload?.terminalFallbacks });
      });
    return () => { active = false; };
  }, [requestDate, summary?.generatedAt]);
  const scoped = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return (flights ?? []).filter((flight) => {
      if (flight.direction !== direction) return false;
      if (terminal !== "all" && flight.terminal !== terminal) return false;
      if (zone !== "ALL" && gateSideOf(boardingAreaOf(flight), flight.gate) !== zone) return false;
      if (!needle) return true;
      return `${flight.flightNumber} ${flight.airlineCode ?? ""} ${flight.airportCode ?? ""}`.toUpperCase().includes(needle);
    });
  }, [flights, direction, terminal, query, zone]);
  if (flights === null || loaded?.failed) return <section className="flight-board" aria-labelledby="flight-board-title"><div className="section-head"><h2 id="flight-board-title">{flightBoardText.search[lang]}</h2></div><LiveLoadMessage loading={flights === null} lang={lang} /></section>;
  const visible = scoped.slice(0, visibleCount);
  const planned = selected?.basis === 'OFFICIAL_DEPARTURE_SCHEDULE';
  const ranking = planned ? null : terminal === "all" ? summary?.airport.airlineRanking?.all : summary?.airport.airlineRanking?.byTerminal?.[terminal];
  const changes = summary?.airport.periodComparisons?.[terminal]?.[7]?.flightRecords;
  const composition = summary?.airport.periodComparisons?.[terminal]?.[7]?.composition;
  const unit = { ko: "편", en: " flights", zh: "班", ja: "便" }[lang];
  const airlineLine = ranking?.airlines.slice(0, 3).map(row => `${airlineDisplayName(row, lang)}${row.iata ? ` (${row.iata})` : ""} ${row.flights}${unit}`).join(" · ");
  const countryLine = ranking?.countries.filter(row => row.country).slice(0, 3).map((row, i) => `${i + 1}. ${regionName(row.country!, lang)} ${row.flights}${unit}`).join(" · ");

  return <section className="flight-board" aria-labelledby="flight-board-title">
    <div className="section-head">
      <div><p className="eyebrow">{planned ? 'SCHEDULED DEPARTURES' : 'OFFICIAL FLIGHT RECORD'} · KST</p><h2 id="flight-board-title">{flightBoardText.search[lang]}</h2></div>
    </div>
    {planned && <p className="flow-note" data-testid="planned-flight-basis">{requestDate} · {contextText(lang,
      '확보한 예정 출발편 · 변경·취소될 수 있으며 확정 운항 결과가 아닙니다.',
      'Held scheduled departures · may change or be cancelled; not confirmed operating results.',
      '已获取的计划出发航班 · 可能变更或取消，并非确认的运行结果。',
      '取得済みの出発予定便・変更や欠航の可能性があり、確定運航結果ではありません。')}{selected?.retrievedAt ? ` · ${kstStamp(selected.retrievedAt)} KST` : ''}</p>}
    {terminal==='all'&&Object.keys(loaded?.terminalFallbacks??{}).length>0&&<p className="prep-note" data-testid="terminal-schedule-gap">{Object.keys(loaded?.terminalFallbacks??{}).join(' · ')} · {contextText(lang,'당일 출발 기록 미확인 · 해당 터미널을 선택하면 보유 공식 일정을 확인할 수 있습니다. 0편을 뜻하지 않습니다.','Today’s departure records unavailable; select the building to view its held official schedule. This is not zero flights.','当日出发记录未确认；选择航站楼查看已获取的官方计划，不表示零班。','本日の出発記録は未確認です。建物を選ぶと取得済みの公式予定を確認できます。0便ではありません。')}</p>}
    {summary && <HolidayContext months={summary.holidays} date={summary.serviceDateKst} lang={lang} /> }
    <div className="flight-summary-area">
    {ranking && ranking.totalFlights > 0 && <div className="current-brief flight-summary">
      <strong>{({ ko: "선택 터미널 출발 운항", en: "Departures in the selected scope", zh: "所选范围的出发航班", ja: "選択範囲の出発運航" })[lang]} {ranking.totalFlights}{unit}{changes ? <> · <RateText text={comparisonText(changes, lang, 7)} lang={lang}/></> : ""}</strong>
      {terminal === "all" && summary && <FlightScopeNote airport={summary.airport} lang={lang} />}
      {airlineLine && <p>{airlineLine}</p>}
      {countryLine && <p>{({ ko: "항공사 등록 국가 순위", en: "Airline registration-country ranking", zh: "航空公司注册国家排名", ja: "航空会社登録国ランキング" })[lang]} · {countryLine}</p>}
      {composition && <details className="composition-changes"><summary>{contextText(lang,'전주 동요일 대비 항공사·국가별 변화','Airline/country changes vs. last weekday','较上周同日航空公司及国家变化','前週同曜日比の航空会社・国別変化')}</summary>
        <p>{composition.baselineDate} → {date || summary?.serviceDateKst}</p>
        {(['airlines','countries'] as const).map(kind=><p key={kind}><RateText lang={lang} text={composition[kind].slice(0,5).map(row=>`${kind==='countries'?regionName(row.id,lang):row.id} ${row.previous} → ${row.current}${unit} (${row.delta>=0?'+':''}${row.delta}${unit}${row.percent===null?'':`, ${formatChangeRate(row.percent)}`})`).join(' · ')}/></p>)}
      </details>}
      <small>{contextText(lang,'수집된 출발 운항 기록 비교 · 공동운항 중복 제외. 등록 국가는 승객 국적이 아닙니다.','Comparison of collected departure records, excluding codeshare duplicates. Registration country is not passenger nationality.','比较已收集的出发记录，排除代码共享重复。注册国家并非乘客国籍。','収集済み出発記録の比較・共同運航重複除外。登録国は旅客国籍ではありません。')}{!composition&&` · ${contextText(lang,'국가별 비교 기록 수집 중','Collecting country comparison history','收集各国比较记录中','国別比較記録を収集中')}`}</small>
    </div>}
    <div className="flight-zone-controls" role="group" aria-label={contextText(lang,'탑승구 구역','Gate area','登机口区域','搭乗口エリア')} data-testid="flight-zone-controls">
      {(['ALL','WEST','CENTER','EAST','UNVERIFIED'] as const).map(value => <button type="button" key={value} aria-pressed={zone === value} onClick={() => { setZone(value); setVisibleCount(10); }}>{value === 'ALL' ? contextText(lang,'전체','All','全部','すべて') : mapCopy.side[value][lang]}</button>)}
    </div>
    </div>
    <div className="flight-board-controls">
      <div className="flight-direction" role="group">
        {(["departure", "arrival"] as const).map((value) => <button
          key={value}
          type="button"
          className={direction === value ? "active" : ""}
          onClick={() => { setDirection(value); setVisibleCount(10); }}
          aria-pressed={direction === value}
        >{value === "departure" ? flightBoardText.departures[lang] : flightBoardText.arrivals[lang]}</button>)}
      </div>
      <label className="flight-search-field">
        <span>{flightBoardText.search[lang]}</span>
        <input type="search" value={query} placeholder={flightBoardText.hint[lang]} onChange={(event) => { setQuery(event.target.value); setVisibleCount(10); }} />
      </label>
    </div>
    {!flights.length ? <p className="airport-empty-line">{flightBoardText.empty[lang]}</p>
      : !visible.length ? <p className="airport-empty-line">{flightBoardText.none[lang]}</p>
        : <>
          <ol className="flight-rows">{visible.map((flight) => <li key={`${flight.direction}-${flight.flightNumber}-${flight.scheduledAt}`}>
            <b>{formatKstClock(flight.scheduledAt)}</b>
            <strong>{flight.flightNumber}</strong>
            <span>{flight.airportCode ?? ""}</span>
            <i>{[flightBoardingLocation(flight) === "CONCOURSE" ? contextText(lang,"탑승동","Concourse","登机楼","コンコース") : flight.terminal, flight.gate ? `${flightBoardText.gate[lang]} ${flight.gate}` : null, mapCopy.side[gateSideOf(boardingAreaOf(flight), flight.gate)][lang], flight.checkinCounter ? `${flightBoardText.counter[lang]} ${flight.checkinCounter}` : null].filter(Boolean).join(" · ")}</i>
            <small>{flight.status}</small>
          </li>)}</ol>
          {visible.length < scoped.length && <button type="button" className="event-list-toggle" onClick={() => setVisibleCount(count => count + 20)}>{({ ko: "항공편 20개 더 보기", en: "Show 20 more flights", zh: "再查看20班", ja: "さらに20便を見る" })[lang]}</button>}
          {loaded?.truncated && <p role="status">{({ ko: "편명 목록은 수집된 기록 중 시간순 첫 1,200개입니다. 검색도 이 범위에 적용됩니다. 위 운항 요약은 별도 집계입니다.", en: "The list and search cover the first 1,200 collected flight records in time order. The summary is calculated separately.", zh: "列表和搜索仅涵盖按时间排列的前1,200条记录。上方汇总另行统计。", ja: "一覧と検索は時刻順の先頭1,200件が対象です。上の運航概要は別集計です。" })[lang]}</p>}
          <p className="flight-board-foot">{flightBoardText.showing[lang](visible.length, scoped.length)}</p>
        </>}
  </section>;
}
