"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "./retailpulse-data";
import { friendlyCheckpointName, rankCurrentDepartureHallCheckpoints } from "../lib/airport-today-summary";
import {
  buildAirportCurrentBrief,
  buildAreaCurrentBrief,
  formatHumanFreshness,
  type AreaCurrentBrief,
  type AirportCurrentBrief,
  type ForecastDayOffset,
} from "../lib/current-brief";

type AreaId = "myeongdong" | "hongdae" | "seongsu";

interface LiveRealtime {
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  observedAt: string;
  freshness: "LIVE" | "STALE";
}

interface LiveWeatherRow {
  targetAt: string;
  precipitationProbability: number | null;
  temperatureTenthC: number | null;
  conditionCode: string | null;
}

interface LiveRealtimeForecast {
  targetAt: string;
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  issuedAt?: string;
  retrievedAt?: string;
}

interface LiveEventRow {
  title: string;
  eventStart: string;
  eventEnd: string | null;
  distanceM: number | null;
}

interface LiveSales {
  quarterCode: string;
  tradeAreaName: string | null;
  totalAmount: number;
  industryCount: number;
}

interface LiveForeignPresence {
  value: number;
  unit: "people";
  referenceAt: string;
  retrievedAt: string;
  productVersion: string;
  freshness: "OFFICIAL_HISTORICAL";
  qualityStatus: string;
}

export interface LiveObservedPoint {
  observedAt: string;
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
}

interface LiveAreaBlock {
  realtime: LiveRealtime | null;
  realtimeForecast: LiveRealtimeForecast[];
  weather: LiveWeatherRow[];
  events: LiveEventRow[];
  eventCount: number;
  observedSeries: LiveObservedPoint[];
  sales: LiveSales | null;
  foreignPresence: LiveForeignPresence | null;
}

interface LiveCongestionRow {
  terminal: string;
  zone: string;
  waitingCount: number | null;
  waitTimeMinutes: number | null;
  waitTimeRaw?: string | null;
  observedAt: string;
  retrievedAt?: string;
  freshness: "LIVE" | "STALE";
}

interface LiveScheduledRow {
  terminal: string | null;
  flights: number;
  firstTime: string;
  lastTime: string;
}

export interface LiveFlightRow {
  flightNumber: string;
  airlineCode: string | null;
  airportCode: string | null;
  direction: string;
  terminal: string | null;
  gate: string | null;
  checkinCounter: string | null;
  status: string;
  scheduledAt: string;
}

/** A5 — official FORECAST/EXPECTED departure passengers. Never an actual observed queue. */
interface LivePassengerForecastRow {
  terminal: string;
  targetDate: string;
  timeBandRaw: string;
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
  retrievedAt: string;
}

/** COMPLETE = full KST-day coverage proven, safe to show as a whole-day figure. PARTIAL = some official bands missing, a total/peak could hide the true peak. UNAVAILABLE = no official band at all. */
type ForecastCoverageStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
type ForecastBand = { targetStartAt: string; targetEndAt: string; expectedPassengers: number };
type TerminalGate = { gate: string; flights: number } | null;
type RankedGate = { terminal: string | null; gate: string; flights: number };
type RemainingForecast = { expectedPassengers: number; fromAt: string; toAt: string; bands: number } | null;

export interface LiveSummary {
  mode: string;
  generatedAt: string;
  todayKst: string;
  serviceDateKst: string;
  dayRelation: "PAST" | "TODAY" | "FUTURE";
  dateAvailability: {
    airportFlights: string[];
    airportPassengerForecast: string[];
    seoulObserved: string[];
  };
  areas: Partial<Record<AreaId, LiveAreaBlock>>;
  airport: {
    congestion: LiveCongestionRow[];
    currentBusiestDepartureHallByTerminal: Record<string, LiveCongestionRow>;
    departuresTrackedToday: number | null;
    departuresTrackedTodayByTerminal: Record<string, number | null>;
    departuresTrackedTodayRetrievedAt: string | null;
    topDepartureGate: string | null;
    topDepartureGateTerminal: string | null;
    topDepartureGateFlights: number | null;
    topDepartureGateByTerminal: Record<string, TerminalGate>;
    busyDepartureGates: RankedGate[];
    busyDepartureGatesByTerminal: Record<string, RankedGate[]>;
    topDepartureGateRetrievedAt: string | null;
    topDepartureGateRetrievedAtByTerminal: Record<string, string | null>;
    gateCoverageRatio: number;
    gateCoverageRatioByTerminal: Record<string, number>;
    serviceDateKst: string | null;
    periodStartAt: string | null;
    periodEndAt: string | null;
    /** Latest retrieval AMONG airport datasets — not proof every metric below shares this freshness. */
    latestRetrievedAt: string | null;
    todayExpectedPassengersTotal: number | null;
    todayExpectedPassengersByTerminal: Record<string, number | null>;
    remainingExpectedPassengers: RemainingForecast;
    remainingExpectedPassengersByTerminal: Record<string, RemainingForecast>;
    passengerForecastRetrievedAt: string | null;
    passengerForecastRetrievedAtByTerminal: Record<string, string | null>;
    peakExpectedTimeBand: ForecastBand | null;
    peakExpectedTimeBandByTerminal: Record<string, ForecastBand | null>;
    peakExpectedPassengers: number | null;
    peakExpectedPassengersByTerminal: Record<string, number | null>;
    passengerForecastTimeline: ForecastBand[];
    passengerForecastTimelineByTerminal: Record<string, ForecastBand[]>;
    forecastCoverage: { all: ForecastCoverageStatus; byTerminal: Record<string, ForecastCoverageStatus> };
    scheduled: LiveScheduledRow[];
    passengerForecast: LivePassengerForecastRow[];
  };
}

// One in-flight request and one cached payload per service date, so switching
// between 어제/오늘/내일 never refetches a day already loaded and never leaves
// two responses racing to render.
const summaryCache = new Map<string, LiveSummary | null>();
const summaryPending = new Map<string, Promise<LiveSummary | null>>();
const DEFAULT_KEY = "__today__";

async function loadSummary(date: string | null): Promise<LiveSummary | null> {
  const key = date ?? DEFAULT_KEY;
  if (summaryCache.has(key)) return summaryCache.get(key) ?? null;
  let pending = summaryPending.get(key);
  if (!pending) {
    const url = date ? `/api/live/summary?date=${encodeURIComponent(date)}` : "/api/live/summary";
    pending = fetch(url, { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json() as LiveSummary;
        return payload.mode === "live-summary" ? payload : null;
      })
      .catch(() => null)
      .then((value) => {
        summaryCache.set(key, value);
        summaryPending.delete(key);
        return value;
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
export function useLiveSummary(date: string | null = null): LiveSummary | null {
  const key = date ?? DEFAULT_KEY;
  const [state, setState] = useState<{ key: string; value: LiveSummary | null }>(() => ({ key, value: summaryCache.get(key) ?? null }));
  // Switching dates must not leave the previous day's numbers on screen for a
  // frame. The state is adjusted during render rather than in an effect, which
  // React handles without a second pass and without cascading renders.
  if (state.key !== key) setState({ key, value: summaryCache.get(key) ?? null });
  useEffect(() => {
    let active = true;
    loadSummary(date).then((value) => { if (active) setState({ key, value }); });
    return () => { active = false; };
  }, [date, key]);
  return state.key === key ? state.value : null;
}

const text = {
  eyebrow: "OFFICIAL DATA SIGNALS · KST",
  title: { ko: "오늘 수요를 움직이는 신호", en: "Signals moving demand today", zh: "今日影响需求的信号", ja: "今日の需要を動かすシグナル" },
  intro: {
    ko: "모두 공식 기관이 발표한 값입니다. 신호는 매출이나 방문자 수가 아니며, 각 줄에 출처와 기준시각을 함께 적었습니다.",
    en: "Every value below is published by an official body. A signal is not sales or visitor counts; each row carries its source and reference time.",
    zh: "以下数值均由官方机构发布。信号不等于销售额或访客数，每行均标注来源与基准时间。",
    ja: "すべて公式機関が発表した値です。シグナルは売上や来訪者数ではなく、各行に出典と基準時刻を併記しています。",
  },
  realtime: { ko: "실시간 활동", en: "Live activity", zh: "实时活动", ja: "リアルタイム活動" },
  weather: { ko: "날씨", en: "Weather", zh: "天气", ja: "天気" },
  rainChance: { ko: "강수확률 최대", en: "max rain chance", zh: "最大降水概率", ja: "降水確率 最大" },
  events: { ko: "주변 행사", en: "Nearby events", zh: "周边活动", ja: "周辺イベント" },
  eventCount: { ko: "건 진행·예정", en: "running or upcoming", zh: "项进行或即将举行", ja: "件 開催・予定" },
  sales: { ko: "상권 과거 흐름", en: "Commercial history", zh: "商圈历史", ja: "商圏の過去推移" },
  salesNote: { ko: "분기 추정매출 · 실매출 아님", en: "Quarterly estimate · not POS sales", zh: "季度推算 · 非实际销售", ja: "四半期推定 · 実売上ではない" },
  foreignPresence: { ko: "단기외국인 생활인구", en: "Short-stay foreign living population", zh: "短期停留外国人生活人口", ja: "短期滞在外国人生活人口" },
  foreignPeople: { ko: "명", en: "people", zh: "人", ja: "人" },
  foreignNote: {
    ko: "서울시 공식자료 · 지연 공개 · 실시간 아님",
    en: "Official Seoul data · delayed publication · not real-time",
    zh: "首尔市官方数据 · 延迟发布 · 非实时",
    ja: "ソウル市公式データ · 遅延公開 · リアルタイムではありません",
  },
  airportTerminal: {
    ko: (terminal: string) => `${terminal} 현재 출국장 대기`,
    en: (terminal: string) => `${terminal} departure-hall wait now`,
    zh: (terminal: string) => `${terminal} 出境区现时等候`,
    ja: (terminal: string) => `${terminal} 出国場の現在の待ち`,
  },
  airportPeople: { ko: "명 대기 중", en: "people waiting", zh: "人等候中", ja: "人待機中" },
  // A5 — official FORECAST/EXPECTED passengers. Wording must stay clearly
  // distinct from A4's CURRENT/OBSERVED wording above (see docs/DATA_SOURCES.md).
  // Never "실시간 승객" / "현재 대기인원" / "확정 승객" for this block.
  passengerForecastLabel: {
    ko: (terminal: string) => `${terminal} 다음 시간대 예상 출국 승객`,
    en: (terminal: string) => `${terminal} next-hour expected departures`,
    zh: (terminal: string) => `${terminal} 下一时段预计出境人数`,
    ja: (terminal: string) => `${terminal} 次の時間帯の予想出国者数`,
  },
  passengerForecastUnit: { ko: "명", en: " expected", zh: "人", ja: "人" },
  passengerForecastSource: { ko: "인천공항 공식 예고", en: "Incheon Airport official forecast", zh: "仁川机场官方预告", ja: "仁川空港公式予告" },
  passengerForecastNotice: { ko: "실제 대기인원 아님", en: "not actual waiting count", zh: "非实际等候人数", ja: "実際の待機人数ではありません" },
  airportFlights: { ko: "출발 운항", en: "Departing flights", zh: "出发航班", ja: "出発便" },
  airportScheduled: { ko: "정기운항 편성", en: "scheduled service", zh: "定期航班", ja: "定期運航" },
  flightUnit: { ko: "편", en: " flights", zh: "班", ja: "便" },
  stale: { ko: "지연됨", en: "STALE", zh: "已延迟", ja: "遅延" },
  sourceSeoul: { ko: "서울 실시간 도시데이터", en: "Seoul real-time city data", zh: "首尔实时城市数据", ja: "ソウルリアルタイム都市データ" },
  sourceKma: { ko: "기상청 단기예보", en: "KMA short-term forecast", zh: "气象厅短期预报", ja: "気象庁短期予報" },
  sourceKto: { ko: "한국관광공사 TourAPI", en: "KTO TourAPI", zh: "韩国观光公社 TourAPI", ja: "韓国観光公社 TourAPI" },
  sourceSales: { ko: "서울시 상권분석서비스", en: "Seoul commercial-district analysis", zh: "首尔商圈分析服务", ja: "ソウル商圏分析サービス" },
  sourceAirport: { ko: "인천공항 출국장 혼잡도", en: "Incheon departure-hall congestion", zh: "仁川机场出境区拥挤度", ja: "仁川空港出国場混雑度" },
} as const;

const congestionLabels: Record<number, Record<Lang, string>> = {
  1: { ko: "여유", en: "Calm", zh: "宽松", ja: "余裕" },
  2: { ko: "보통", en: "Normal", zh: "一般", ja: "普通" },
  3: { ko: "약간 붐빔", en: "Somewhat busy", zh: "略拥挤", ja: "やや混雑" },
  4: { ko: "붐빔", en: "Crowded", zh: "拥挤", ja: "混雑" },
};

const conditionLabels: Record<string, Record<Lang, string>> = {
  clear: { ko: "맑음", en: "Clear", zh: "晴", ja: "晴れ" },
  cloudy: { ko: "구름많음", en: "Cloudy", zh: "多云", ja: "くもり" },
  overcast: { ko: "흐림", en: "Overcast", zh: "阴", ja: "曇天" },
  rain: { ko: "비", en: "Rain", zh: "雨", ja: "雨" },
  shower: { ko: "소나기", en: "Showers", zh: "阵雨", ja: "にわか雨" },
  snow: { ko: "눈", en: "Snow", zh: "雪", ja: "雪" },
};

export function airportLocale(lang: Lang): string {
  return lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB";
}

export function formatKstServicePeriod(serviceDate: string, lang: Lang): string {
  const parsed = new Date(`${serviceDate}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = new Intl.DateTimeFormat(airportLocale(lang), {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(parsed);
  return `${day} 00:00–23:59 KST`;
}

function formatKstBand(start: string, end: string): string {
  const clock = (value: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
  return `${clock(start)}–${clock(end)} KST`;
}

function formatKstClock(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(parsed);
}

const dayWord: Record<ForecastDayOffset, Record<Lang, string>> = {
  TODAY: { ko: "오늘", en: "today", zh: "今天", ja: "今日" },
  TOMORROW: { ko: "내일", en: "tomorrow", zh: "明天", ja: "明日" },
  LATER: { ko: "이후", en: "later", zh: "之后", ja: "以降" },
};

const airportTodayText = {
  title: { ko: "한눈에 보기", en: "At a glance", zh: "概览", ja: "概要" },
  // Means "the latest retrieval AMONG airport datasets" — never that every
  // metric below shares this freshness (see per-metric `collected` lines).
  retrieved: { ko: "공항 데이터 중 최근 수집", en: "Latest collected, among airport datasets", zh: "机场数据中最近一次采集", ja: "空港データの中で最終取得" },
  expected: { ko: "공식 예상 출국객", en: "Official expected departures", zh: "官方预计出境人数", ja: "公式予想出国者数" },
  expectedNote: { ko: "인천공항 공식 예상 · 실제 출국객 집계 아님", en: "Official Incheon forecast · not an actual passenger count", zh: "仁川机场官方预测 · 非实际出境人数", ja: "仁川空港公式予測 · 実際の出国者集計ではありません" },
  remaining: { ko: "지금부터 오늘 끝까지", en: "From this hour to end of day", zh: "从此刻到今日结束", ja: "今の時間帯から今日終わりまで" },
  remainingNote: {
    ko: "현재 시간대부터 24:00까지 공식 예상 승객 합계",
    en: "Official expected passengers from the current hour band to 24:00",
    zh: "从当前时段到24:00的官方预计旅客合计",
    ja: "現在の時間帯から24:00までの公式予想旅客合計",
  },
  flights: { ko: "출발 운항", en: "Departing flights", zh: "出发航班", ja: "出発便" },
  flightsNote: { ko: "실제 운항편 기준 · 승객 수 아님", en: "Physical flights · not passengers", zh: "实际航班口径 · 非旅客人数", ja: "実運航便基準 · 旅客数ではありません" },
  peak: { ko: "예상 피크", en: "Expected peak", zh: "预计高峰", ja: "予想ピーク" },
  peakNote: { ko: "공식 예상 출국객 시간대", en: "Official expected departure band", zh: "官方预计出境时段", ja: "公式予想出国時間帯" },
  unavailable: { ko: "확인 불가", en: "Unavailable", zh: "暂无法确认", ja: "確認不可" },
  // A5 daily total/peak honesty gate: shown only in place of a number when the
  // day's official aggregate bands do not prove full-day coverage — never a
  // fabricated zero and never a silently partial sum.
  forecastPartial: { ko: "전체 시간대 확인 불가", en: "Full-day coverage unavailable", zh: "无法确认全天时段", ja: "全時間帯を確認できません" },
  forecastPartialNote: { ko: "공식 예상 데이터 일부 누락", en: "Some official forecast data missing", zh: "部分官方预计数据缺失", ja: "公式予測データの一部が欠落" },
  current: { ko: "현재 출국장", en: "Current departure halls", zh: "当前出境区", ja: "現在の出国場" },
  currentNote: { ko: "출국장 체크포인트 관측 · 탑승 게이트 아님", en: "Observed checkpoints · not boarding gates", zh: "出境检查点观测 · 非登机口", ja: "出国場チェックポイント観測 · 搭乗ゲートではありません" },
  waiting: { ko: "명 대기", en: " waiting", zh: "人等候", ja: "人待機" },
  waitLabel: { ko: "대기시간", en: "Wait", zh: "等候时间", ja: "待ち時間" },
  peopleLabel: { ko: "대기인원", en: "People", zh: "等候人数", ja: "待機人数" },
  forecastOnly: { ko: "공식 예상 승객 · 실제 대기인원 아님", en: "Official expected passengers · not actual waiting", zh: "官方预计旅客 · 非实际等候人数", ja: "公式予想旅客 · 実際の待機人数ではありません" },
  scope: {
    ko: { all: "전체 공항", T1: "제1터미널", T2: "제2터미널" },
    en: { all: "All terminals", T1: "Terminal 1", T2: "Terminal 2" },
    zh: { all: "全部航站楼", T1: "1号航站楼", T2: "2号航站楼" },
    ja: { all: "全ターミナル", T1: "第1ターミナル", T2: "第2ターミナル" },
  },
  gatesTitle: { ko: "운항 집중 게이트", en: "Busiest departure gates", zh: "航班集中登机口", ja: "運航集中ゲート" },
  gatesNote: { ko: "출발편이 많이 배정된 게이트 순위입니다. 출국장 대기시간과는 다른 정보입니다.", en: "Gates ranked by tracked departures. This is separate from checkpoint waiting time.", zh: "按出发航班数排名的登机口，与出境区等候时间不同。", ja: "出発便数で並べたゲートです。出国場の待ち時間とは別の情報です。" },
  noGateList: { ko: "게이트 정보 범위가 충분하지 않아 순위를 표시하지 않습니다.", en: "Gate coverage is insufficient to show a reliable ranking.", zh: "登机口数据覆盖不足，暂不显示排名。", ja: "ゲート情報の範囲が十分でないため、順位を表示しません。" },
  longest: { ko: "현재 가장 긴 대기", en: "Longest current wait", zh: "当前最长等候", ja: "現在最も長い待ち" },
  forecastTitle: { ko: "공식 예상 출국객 흐름", en: "Official expected passenger flow", zh: "官方预计出境客流", ja: "公式予想出国者の流れ" },
  partialBody: { ko: "공식 예상 데이터의 일부 시간대가 누락되어 하루 전체 합계와 피크는 표시하지 않습니다.", en: "Some official time bands are missing, so the full-day total and peak are not shown.", zh: "部分官方时段数据缺失，因此不显示全天合计与高峰。", ja: "公式予測の一部時間帯が欠けているため、1日全体の合計とピークは表示しません。" },
  unavailableBody: { ko: "이 날짜의 공식 예상 시간대가 없습니다. 실제 출발 운항과 현재 출국장 정보는 계속 확인할 수 있습니다.", en: "No official forecast bands exist for this date. Physical departures and current checkpoints remain available.", zh: "该日期没有官方预计时段数据，仍可查看实际出发航班和当前出境区信息。", ja: "この日付の公式予測時間帯はありません。実出発便と現在の出国場情報は引き続き確認できます。" },
  gateRankHead: { ko: "순위 · 터미널 · 게이트 · 출발편", en: "Rank · Terminal · Gate · Departures", zh: "排名 · 航站楼 · 登机口 · 出发航班", ja: "順位 · ターミナル · ゲート · 出発便" },
  nowOnly: {
    ko: "현재 출국장 대기는 실시간 관측이라 언제나 지금 시점만 보여줍니다.",
    en: "Departure-hall waits are live observations, so they always show the present moment.",
    zh: "出境区等候为实时观测，因此始终显示当前时刻。",
    ja: "出国場の待ちはリアルタイム観測のため、常に現在時点のみを表示します。",
  },
} as const;

const areaBriefText = {
  title: { ko: "서울 지금", en: "Seoul now", zh: "首尔当前", ja: "ソウル現在" },
  unavailableNow: { ko: "현재 공식 활동 상태를 확인할 수 없습니다", en: "Current official activity is unavailable", zh: "当前官方活动状态暂不可用", ja: "現在の公式活動状況を確認できません" },
  noForecast: { ko: "공식 혼잡 예측이 아직 발표되지 않았습니다", en: "No official crowd forecast has been published yet", zh: "官方拥挤预测尚未发布", ja: "公式の混雑予測はまだ発表されていません" },
  stale: { ko: "최근 관측 지연", en: "Latest observation delayed", zh: "最新观测延迟", ja: "最新観測に遅れ" },
  nowLabel: { ko: "지금", en: "now", zh: "当前", ja: "現在" },
} as const;

const areaNames: Record<AreaId, Record<Lang, string>> = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
};

export const AREA_IDS: AreaId[] = ["myeongdong", "hongdae", "seongsu"];
export function areaDisplayName(area: AreaId, lang: Lang): string {
  return areaNames[area][lang];
}

function formatForecastHour(value: string): string {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 3_600_000);
  return `${formatKstClock(start.toISOString())}–${formatKstClock(end.toISOString())}`;
}

/**
 * Turns one area's brief into the 3–4 lines the reader sees first.
 *
 * Every line is a statement about official data that exists. When a line has
 * no data behind it, it is dropped rather than filled with a placeholder, so
 * the brief is short and true instead of long and padded.
 */
function localizeAreaBrief(brief: AreaCurrentBrief, lang: Lang): { headline: string; lines: string[]; freshness: string | null } {
  const locale = airportLocale(lang);
  let headline: string = areaBriefText.unavailableNow[lang];
  let freshness: string | null = null;
  if (brief.current) {
    const level = congestionLabels[brief.current.congestionLevel]?.[lang] ?? String(brief.current.congestionLevel);
    const range = `${brief.current.populationMin.toLocaleString(locale)}–${brief.current.populationMax.toLocaleString(locale)}`;
    const people = lang === "en" ? " people" : lang === "ko" ? "명" : "人";
    headline = brief.current.freshness === "STALE" ? `${areaBriefText.stale[lang]} · ${level} · ${range}${people}` : `${level} · ${range}${people}`;
    freshness = brief.current.observedAt;
  }

  const lines: string[] = [];
  if (brief.upcomingPeak) {
    const band = formatForecastHour(brief.upcomingPeak.targetAt);
    // The day is always said out loud: Seoul's rolling 12-hour horizon means
    // the busiest hour ahead is often tomorrow, and "04:00" alone would read
    // as an hour that already passed.
    const when = `${dayWord[brief.upcomingPeak.dayOffset][lang]} ${band}`;
    const level = congestionLabels[brief.upcomingPeak.congestionLevel]?.[lang] ?? "";
    lines.push(lang === "ko" ? `서울시 공식 예측: ${when}가 가장 붐빌 전망 (${level})`
      : lang === "en" ? `Seoul's official forecast: ${when} is the busiest hour ahead (${level})`
      : lang === "zh" ? `首尔市官方预测：${when}最为拥挤（${level}）`
      : `ソウル市公式予測：${when}が最も混雑する見込み（${level}）`);
  } else lines.push(areaBriefText.noForecast[lang]);

  if (brief.weatherAdvice) {
    const advice = brief.weatherAdvice;
    if (advice.kind === "UMBRELLA") lines.push(lang === "ko" ? `비 가능성 ${advice.probability}% · 우산을 챙기세요` : lang === "en" ? `${advice.probability}% chance of rain · bring an umbrella` : lang === "zh" ? `降雨概率${advice.probability}% · 请带伞` : `降水確率${advice.probability}% · 傘を用意してください`);
    else if (advice.kind === "CHECK_RAIN") lines.push(lang === "ko" ? `비 가능성 ${advice.probability}% · 이동 전 날씨를 확인하세요` : lang === "en" ? `${advice.probability}% chance of rain · check before heading out` : lang === "zh" ? `降雨概率${advice.probability}% · 出发前请确认天气` : `降水確率${advice.probability}% · 移動前に天気を確認してください`);
    else if (advice.kind === "HOT") lines.push(lang === "ko" ? `최고 ${advice.temperatureC.toFixed(0)}°C · 가벼운 복장과 물을 준비하세요` : lang === "en" ? `Up to ${advice.temperatureC.toFixed(0)}°C · dress lightly and carry water` : lang === "zh" ? `最高${advice.temperatureC.toFixed(0)}°C · 建议轻装并备水` : `最高${advice.temperatureC.toFixed(0)}°C · 軽い服装と水を用意してください`);
    else lines.push(lang === "ko" ? `최저 ${advice.temperatureC.toFixed(0)}°C · 겉옷을 챙기세요` : lang === "en" ? `Down to ${advice.temperatureC.toFixed(0)}°C · bring an outer layer` : lang === "zh" ? `最低${advice.temperatureC.toFixed(0)}°C · 建议携带外套` : `最低${advice.temperatureC.toFixed(0)}°C · 上着を用意してください`);
  }

  // The events line is reference material, so it only appears when there is
  // something to reference — never as filler to reach a line count.
  if (brief.eventCount > 0) {
    const label = brief.nextEventTitle
      ? (lang === "ko" ? `인근 행사 ${brief.eventCount}건 · ${brief.nextEventTitle}`
        : lang === "en" ? `${brief.eventCount} nearby event${brief.eventCount === 1 ? "" : "s"} · ${brief.nextEventTitle}`
        : lang === "zh" ? `附近${brief.eventCount}项活动 · ${brief.nextEventTitle}`
        : `周辺イベント${brief.eventCount}件 · ${brief.nextEventTitle}`)
      : (lang === "ko" ? `인근 행사 ${brief.eventCount}건` : lang === "en" ? `${brief.eventCount} nearby events` : lang === "zh" ? `附近${brief.eventCount}项活动` : `周辺イベント${brief.eventCount}件`);
    lines.push(label);
  }
  return { headline, lines: lines.slice(0, 3), freshness };
}


function localizeAirportBrief(
  brief: AirportCurrentBrief,
  lang: Lang,
  remaining: RemainingForecast,
): string[] {
  const locale = airportLocale(lang);
  const lines: string[] = [];
  const scopeName = airportTodayText.scope[lang][brief.scope];
  if (brief.checkpoint) {
    const checkpoint = friendlyCheckpointName(brief.checkpoint.zone, lang);
    const terminalPrefix = brief.scope === "all" ? `${brief.checkpoint.terminal} ` : "";
    if (brief.checkpointBasis === "WAIT_TIME") {
      const raw = brief.checkpoint.waitTimeRaw ?? (brief.checkpoint.waitTimeMinutes === null ? null : String(brief.checkpoint.waitTimeMinutes));
      const unit = { ko: "분", en: " min", zh: "分钟", ja: "分" }[lang];
      const wait = raw ? (/분|min|分钟|分/i.test(raw) ? raw : `${raw}${unit}`) : "";
      lines.push(lang === "ko" ? `지금 ${scopeName}에서 대기가 가장 긴 곳은 ${terminalPrefix}${checkpoint}, ${wait}입니다`
        : lang === "en" ? `${terminalPrefix}${checkpoint} has the longest ${scopeName} wait right now at ${wait}`
        : lang === "zh" ? `当前${scopeName}等候最长的是${terminalPrefix}${checkpoint}，${wait}`
        : `現在、${scopeName}で最も待ちが長いのは${terminalPrefix}${checkpoint}の${wait}です`);
    } else if (brief.checkpoint.waitingCount !== null) {
      lines.push(lang === "ko" ? `지금 ${terminalPrefix}${checkpoint}에 ${brief.checkpoint.waitingCount.toLocaleString(locale)}명이 대기 중입니다`
        : lang === "en" ? `${brief.checkpoint.waitingCount.toLocaleString(locale)} people are waiting at ${terminalPrefix}${checkpoint} right now`
        : lang === "zh" ? `当前${terminalPrefix}${checkpoint}有${brief.checkpoint.waitingCount.toLocaleString(locale)}人等候`
        : `現在、${terminalPrefix}${checkpoint}で${brief.checkpoint.waitingCount.toLocaleString(locale)}人が待機中です`);
    }
  }

  if (brief.forecastCoverage === "COMPLETE" && brief.peak) {
    const band = formatKstBand(brief.peak.targetStartAt, brief.peak.targetEndAt).replace(" KST", "");
    const people = Math.round(brief.peak.expectedPassengers).toLocaleString(locale);
    lines.push(lang === "ko" ? `공식 예상 승객 기준 ${band}가 오늘 피크입니다 (${people}명)`
      : lang === "en" ? `Official expected passengers peak at ${band} today (${people})`
      : lang === "zh" ? `按官方预计旅客，今日高峰为${band}（${people}人）`
      : `公式予想旅客では本日のピークは${band}（${people}人）`);
  } else if (brief.forecastCoverage === "PARTIAL") {
    lines.push(lang === "ko" ? "공식 예상 승객 데이터가 일부 누락되어 피크는 판단하지 않습니다" : lang === "en" ? "Some official passenger forecast bands are missing, so no peak is inferred" : lang === "zh" ? "部分官方预计旅客时段缺失，因此不判断高峰" : "公式予想旅客データの一部が欠けているため、ピークは判断しません");
  } else {
    lines.push(lang === "ko" ? "이 날짜의 공식 예상 승객 데이터는 아직 없습니다" : lang === "en" ? "No official passenger forecast exists for this date yet" : lang === "zh" ? "该日期尚无官方预计旅客数据" : "この日付の公式予想旅客データはまだありません");
  }

  const departure = brief.departures === null ? null
    : (lang === "ko" ? `출발 ${brief.departures.toLocaleString(locale)}편` : lang === "en" ? `${brief.departures.toLocaleString(locale)} departing flights` : lang === "zh" ? `出发${brief.departures.toLocaleString(locale)}班` : `出発${brief.departures.toLocaleString(locale)}便`);
  const gate = brief.topGate
    ? (lang === "ko" ? `Gate ${brief.topGate.gate}에 ${brief.topGate.flights.toLocaleString(locale)}편으로 가장 집중` : lang === "en" ? `Gate ${brief.topGate.gate} is busiest with ${brief.topGate.flights.toLocaleString(locale)} flights` : lang === "zh" ? `Gate ${brief.topGate.gate}最集中，共${brief.topGate.flights.toLocaleString(locale)}班` : `Gate ${brief.topGate.gate}が最多で${brief.topGate.flights.toLocaleString(locale)}便`)
    : null;
  // The remaining figure is only ever present when the day's official bands
  // are provably complete, so it can be stated without a hedge.
  const rest = remaining
    ? (lang === "ko" ? `${formatKstClock(remaining.fromAt)}부터 오늘 끝까지 예상 ${Math.round(remaining.expectedPassengers).toLocaleString(locale)}명`
      : lang === "en" ? `${Math.round(remaining.expectedPassengers).toLocaleString(locale)} expected from ${formatKstClock(remaining.fromAt)} to end of day`
      : lang === "zh" ? `${formatKstClock(remaining.fromAt)}起至今日结束预计${Math.round(remaining.expectedPassengers).toLocaleString(locale)}人`
      : `${formatKstClock(remaining.fromAt)}から今日終わりまで予想${Math.round(remaining.expectedPassengers).toLocaleString(locale)}人`)
    : null;
  const third = [departure, gate].filter(Boolean).join(" · ");
  if (third) lines.push(third);
  if (rest) lines.push(rest);
  return lines.slice(0, 4);
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

const dateNavText = {
  yesterday: { ko: "어제", en: "Yesterday", zh: "昨天", ja: "昨日" },
  today: { ko: "오늘", en: "Today", zh: "今天", ja: "今日" },
  tomorrow: { ko: "내일", en: "Tomorrow", zh: "明天", ja: "明日" },
  pick: { ko: "날짜 선택", en: "Pick a date", zh: "选择日期", ja: "日付を選択" },
  label: { ko: "날짜 선택", en: "Select date", zh: "选择日期", ja: "日付選択" },
  availableFrom: { ko: "선택 가능", en: "Available", zh: "可选范围", ja: "選択可能" },
  noData: {
    ko: "이 날짜에는 저장된 공식 데이터가 없습니다.",
    en: "No official data is stored for this date.",
    zh: "该日期没有已存储的官方数据。",
    ja: "この日付に保存された公式データはありません。",
  },
} as const;

function shiftDay(day: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta)).toISOString().slice(0, 10);
}

/**
 * 어제 / 오늘 / 내일 / 날짜 선택.
 *
 * The three shortcuts are computed from the server's KST day, never the
 * viewer's device clock, so a phone in another timezone still means the same
 * "today" as the data. The free picker is bounded by the days that actually
 * hold rows, so choosing a date can never land on an empty screen by accident.
 */
export function DateNavigator({
  lang, date, onChange,
}: { lang: Lang; date: string | null; onChange: (date: string | null) => void }) {
  const summary = useLiveSummary(date);
  if (!summary?.todayKst) return null;
  const today = summary.todayKst;
  const selected = summary.serviceDateKst;
  const known = [
    ...summary.dateAvailability.airportFlights,
    ...summary.dateAvailability.airportPassengerForecast,
    ...summary.dateAvailability.seoulObserved,
  ];
  const min = known.length ? known.reduce((a, b) => (a < b ? a : b)) : shiftDay(today, -1);
  const max = known.length ? known.reduce((a, b) => (a > b ? a : b)) : shiftDay(today, 1);
  const shortcuts: Array<[string, string]> = [
    [shiftDay(today, -1), dateNavText.yesterday[lang]],
    [today, dateNavText.today[lang]],
    [shiftDay(today, 1), dateNavText.tomorrow[lang]],
  ];
  return <nav className="date-nav" aria-label={dateNavText.label[lang]}>
    <div className="date-nav-shortcuts" role="group">
      {shortcuts.map(([value, label]) => <button
        key={value}
        type="button"
        className={selected === value ? "active" : ""}
        aria-current={selected === value ? "date" : undefined}
        onClick={() => onChange(value === today ? null : value)}
      >{label}</button>)}
    </div>
    <label className="date-nav-picker">
      <span>{dateNavText.pick[lang]}</span>
      <input
        type="date"
        value={selected}
        min={min}
        max={max}
        onChange={(event) => {
          const next = event.target.value;
          if (!next) return;
          onChange(next === today ? null : next);
        }}
      />
    </label>
  </nav>;
}

/** Explains, in one line, what a chosen date can and cannot show. */
export function DateScopeNote({ lang, date }: { lang: Lang; date: string | null }) {
  const summary = useLiveSummary(date);
  if (!summary) return null;
  const { dayRelation, serviceDateKst, dateAvailability } = summary;
  const hasFlights = dateAvailability.airportFlights.includes(serviceDateKst);
  const hasForecast = dateAvailability.airportPassengerForecast.includes(serviceDateKst);
  if (dayRelation === "TODAY" && hasFlights && hasForecast) return null;
  const parts: string[] = [];
  if (dayRelation === "PAST") {
    parts.push(lang === "ko" ? "지난 날짜는 기록으로만 봅니다" : lang === "en" ? "A past date is shown as a record only" : lang === "zh" ? "过去日期仅作为记录显示" : "過去の日付は記録としてのみ表示します");
  }
  if (dayRelation === "FUTURE") {
    parts.push(lang === "ko" ? "앞으로의 날짜는 공식 예측만 있습니다" : lang === "en" ? "A future date has official forecasts only" : lang === "zh" ? "未来日期仅有官方预测" : "先の日付は公式予測のみです");
  }
  if (!hasForecast) {
    parts.push(lang === "ko" ? "공식 예상 승객 없음" : lang === "en" ? "no official passenger forecast" : lang === "zh" ? "无官方预计旅客" : "公式予想旅客なし");
  }
  if (!hasFlights) {
    parts.push(lang === "ko" ? "저장된 운항 기록 없음" : lang === "en" ? "no stored flight record" : lang === "zh" ? "无已存储航班记录" : "保存された運航記録なし");
  }
  if (!parts.length) return null;
  return <p className="date-scope-note" role="status">{parts.join(" · ")}</p>;
}

export function AirportTodaySummary({ lang, terminal = "all", date = null }: { lang: Lang; terminal?: "all" | "T1" | "T2"; date?: string | null }) {
  const summary = useLiveSummary(date);
  const airport = summary?.airport;
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
  const topGateForTerminal = airport.topDepartureGateByTerminal?.[terminal];
  const topGate = isAll
    ? (airport.topDepartureGate && airport.topDepartureGateFlights !== null ? { terminal: airport.topDepartureGateTerminal, gate: airport.topDepartureGate, flights: airport.topDepartureGateFlights } : null)
    : (topGateForTerminal ? { terminal, gate: topGateForTerminal.gate, flights: topGateForTerminal.flights } : null);
  const timeline = isAll ? airport.passengerForecastTimeline : airport.passengerForecastTimelineByTerminal?.[terminal] ?? [];
  const forecastStatus = isAll ? airport.forecastCoverage?.all : airport.forecastCoverage?.byTerminal?.[terminal];
  const isForecastPartial = forecastStatus === "PARTIAL";
  const passengerRetrievedAt = isAll ? airport.passengerForecastRetrievedAt : airport.passengerForecastRetrievedAtByTerminal?.[terminal] ?? null;
  const flightsRetrievedAt = isAll ? airport.departuresTrackedTodayRetrievedAt : airport.topDepartureGateRetrievedAtByTerminal?.[terminal] ?? null;
  const gateRetrievedAt = isAll ? airport.topDepartureGateRetrievedAt : airport.topDepartureGateRetrievedAtByTerminal?.[terminal] ?? null;
  const nowIso = summary?.generatedAt ?? new Date().toISOString();
  const collectedText = (value: string | null) => value ? formatHumanFreshness(value, nowIso, lang) : null;
  const passengerCollected = collectedText(passengerRetrievedAt);
  const flightsCollected = collectedText(flightsRetrievedAt);
  const gateCollected = collectedText(gateRetrievedAt);

  const scopeLabel = airportTodayText.scope[lang][terminal];
  const gateList = isAll ? airport.busyDepartureGates ?? [] : airport.busyDepartureGatesByTerminal?.[terminal] ?? [];
  const rankedCheckpoints = rankCurrentDepartureHallCheckpoints(
    (airport.congestion ?? []).map((row) => ({ ...row, waitTimeRaw: row.waitTimeRaw ?? null })),
  ) as Record<string, LiveCongestionRow[]>;
  const checkpointTerminals = Object.keys(rankedCheckpoints).filter((key) => isAll || key === terminal);
  const maxBand = Math.max(1, ...timeline.map((row) => row.expectedPassengers));
  const waitUnit = { ko: "분", en: " min", zh: "分钟", ja: "分" }[lang];
  const waitText = (row: LiveCongestionRow) => {
    if (row.waitTimeRaw) return /분|min|分钟|分/i.test(row.waitTimeRaw) ? row.waitTimeRaw : `${row.waitTimeRaw}${waitUnit}`;
    return row.waitTimeMinutes !== null ? `${row.waitTimeMinutes}${waitUnit}` : airportTodayText.unavailable[lang];
  };
  const airportBrief = buildAirportCurrentBrief({
    scope: terminal,
    congestion: airport.congestion ?? [],
    forecastCoverage: forecastStatus ?? "UNAVAILABLE",
    peak,
    departures: flightsCount,
    topGate,
  });
  const airportBriefLines = localizeAirportBrief(airportBrief, lang, remaining);
  // Metrics can be collected at different times (expected passengers 09:34 vs
  // flights 00:03), so each cell carries its own time. When all four agree the
  // section states it once instead of repeating it.
  const distinctFreshness = [...new Set([passengerCollected, flightsCollected, gateCollected].filter((value): value is string => Boolean(value)))];
  const sharesOneFreshness = distinctFreshness.length <= 1;
  const perMetric = (value: string | null) => (sharesOneFreshness ? null : value);

  return <section className="airport-today" aria-labelledby="airport-today-title">
    <section className="current-brief airport-current-brief" aria-label={`${scopeLabel} ${areaBriefText.nowLabel[lang]}`}>
      <p className="eyebrow">{scopeLabel} · {areaBriefText.nowLabel[lang].toUpperCase()}</p>
      {airportBriefLines.map((line, index) => index === 0 ? <strong key={line}>{line}</strong> : <p key={line}>{line}</p>)}
    </section>

    <div className="section-head">
      <div><p className="eyebrow">OFFICIAL · {scopeLabel} · KST</p><h2 id="airport-today-title">{airportTodayText.title[lang]}</h2></div>
      <span className="airport-period-label">{airport.serviceDateKst ? formatKstServicePeriod(airport.serviceDateKst, lang) : airportTodayText.unavailable[lang]}</span>
    </div>

    <div className="airport-today-grid">
      <article><span>{airportTodayText.expected[lang]}</span><strong data-kind={expectedTotal === null ? "status" : "value"}>{expectedTotal === null ? (isForecastPartial ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang]) : `${Math.round(expectedTotal).toLocaleString(numberLocale)}${peopleUnit}`}</strong><small>{isForecastPartial ? airportTodayText.forecastPartialNote[lang] : airportTodayText.expectedNote[lang]}</small>{perMetric(passengerCollected) && <small className="metric-freshness">{passengerCollected}</small>}</article>
      <article><span>{airportTodayText.peak[lang]}</span><strong data-kind={peak ? "value" : "status"}>{peak ? formatKstBand(peak.targetStartAt, peak.targetEndAt) : airportTodayText.unavailable[lang]}</strong><small>{peak ? `${airportTodayText.peakNote[lang]} · ${Math.round(peak.expectedPassengers).toLocaleString(numberLocale)}${peopleUnit}` : (isForecastPartial ? airportTodayText.forecastPartialNote[lang] : airportTodayText.peakNote[lang])}</small>{perMetric(passengerCollected) && <small className="metric-freshness">{passengerCollected}</small>}</article>
      <article><span>{airportTodayText.flights[lang]}</span><strong data-kind={flightsCount === null ? "status" : "value"}>{flightsCount === null ? airportTodayText.unavailable[lang] : `${flightsCount.toLocaleString(numberLocale)}${flightUnit}`}</strong><small>{airportTodayText.flightsNote[lang]}</small>{perMetric(flightsCollected) && <small className="metric-freshness">{flightsCollected}</small>}</article>
      {remaining && <article className="airport-remaining"><span>{airportTodayText.remaining[lang]}</span><strong data-kind="value">{Math.round(remaining.expectedPassengers).toLocaleString(numberLocale)}{peopleUnit}</strong><small>{airportTodayText.remainingNote[lang]}</small>{perMetric(passengerCollected) && <small className="metric-freshness">{passengerCollected}</small>}</article>}
    </div>
    {sharesOneFreshness && distinctFreshness.length > 0 && <p className="airport-section-freshness">{airportTodayText.retrieved[lang]} · {distinctFreshness[0]}</p>}

    <section className="airport-detail-section airport-checkpoints" aria-labelledby="airport-checkpoints-title">
      <div className="airport-detail-head"><div><p className="eyebrow">CURRENT OBSERVATION · {scopeLabel}</p><h3 id="airport-checkpoints-title">{airportTodayText.current[lang]}</h3></div><p>{airportTodayText.currentNote[lang]}</p></div>
      {checkpointTerminals.length ? <div className="airport-checkpoint-groups">{checkpointTerminals.map((terminalId) => {
        const busiest = airport.currentBusiestDepartureHallByTerminal?.[terminalId];
        return <div className="airport-checkpoint-terminal" key={terminalId}>
          <h4><span>{terminalId}</span>{airportTodayText.scope[lang][terminalId as "T1" | "T2"] ?? terminalId}</h4>
          <div>{rankedCheckpoints[terminalId].map((row, index) => {
            const isBusiest = busiest?.zone === row.zone;
            return <article className={isBusiest ? "is-busiest" : ""} key={`${terminalId}-${row.zone}`}>
              <span className="checkpoint-rank">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{friendlyCheckpointName(row.zone, lang)}</strong>{isBusiest && <small>{airportTodayText.longest[lang]}</small>}</div>
              <b><i>{airportTodayText.waitLabel[lang]}</i>{waitText(row)}</b>
              <p><i>{airportTodayText.peopleLabel[lang]}</i>{row.waitingCount === null ? airportTodayText.unavailable[lang] : `${row.waitingCount.toLocaleString(numberLocale)}${airportTodayText.waiting[lang]}`}<small>{formatHumanFreshness(row.observedAt, nowIso, lang)}{row.freshness === "STALE" ? ` · ${text.stale[lang]}` : ""}</small></p>
            </article>;
          })}</div>
        </div>;
      })}</div> : <p className="airport-empty-line">{airportTodayText.unavailable[lang]}</p>}
      <p className="airport-detail-foot">{airportTodayText.nowOnly[lang]}</p>
    </section>

    <section className="airport-detail-section airport-gates" aria-labelledby="airport-gates-title">
      <div className="airport-detail-head"><div><p className="eyebrow">PHYSICAL DEPARTURES · {scopeLabel}</p><h3 id="airport-gates-title">{airportTodayText.gatesTitle[lang]}</h3></div><p>{airportTodayText.gatesNote[lang]}</p></div>
      {gateList.length ? <ol className="airport-gate-list">
        <li className="airport-gate-head" aria-hidden="true"><span>#</span><strong>{airportTodayText.gateRankHead[lang]}</strong></li>
        {gateList.map((row, index) => <li className="airport-gate-row" key={`${row.terminal ?? "unknown"}-${row.gate}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{row.terminal ? <i>{row.terminal}</i> : null}Gate {row.gate}</strong>
          <b>{row.flights.toLocaleString(numberLocale)}{flightUnit}</b>
        </li>)}
      </ol> : <p className="airport-empty-line">{airportTodayText.noGateList[lang]}</p>}
    </section>

    <section className="airport-detail-section airport-forecast" aria-labelledby="airport-forecast-title">
      <div className="airport-detail-head"><div><p className="eyebrow">OFFICIAL FORECAST · {scopeLabel}</p><h3 id="airport-forecast-title">{airportTodayText.forecastTitle[lang]}</h3></div><p>{airportTodayText.forecastOnly[lang]}</p></div>
      {forecastStatus === "COMPLETE" && timeline.length > 0
        ? <div className="airport-timeline" role="img" aria-label={`${airportTodayText.forecastTitle[lang]}. ${airportTodayText.forecastOnly[lang]}`}>
          <div className="airport-timeline-bars">{timeline.map((row) => <p key={row.targetStartAt} className={peak?.targetStartAt === row.targetStartAt ? "peak" : ""}>
            <i style={{ height: `${Math.max(4, row.expectedPassengers / maxBand * 100)}%` }} />
            <span>{formatKstClock(row.targetStartAt)}</span>
            <b>{Math.round(row.expectedPassengers).toLocaleString(numberLocale)}</b>
          </p>)}</div>
        </div>
        : <div className={`airport-forecast-state ${isForecastPartial ? "partial" : "unavailable"}`}>
          <strong>{isForecastPartial ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang]}</strong>
          <p>{isForecastPartial ? airportTodayText.partialBody[lang] : airportTodayText.unavailableBody[lang]}</p>
          {passengerCollected && <small>{passengerCollected}</small>}
        </div>}
    </section>
  </section>;
}

/** The three Seoul areas, each opening with its own official brief. */
export function HomeTodayBrief({ lang, selected, onSelect, date = null }: { lang: Lang; selected: AreaId; onSelect: (area: AreaId) => void; date?: string | null }) {
  const summary = useLiveSummary(date);
  if (!summary) return null;
  const areas = AREA_IDS.map((area) => {
    const block = summary.areas[area];
    const brief = buildAreaCurrentBrief({
      realtime: block?.realtime ?? null,
      realtimeForecast: block?.realtimeForecast ?? [],
      weather: block?.weather ?? [],
      eventCount: block?.eventCount ?? block?.events?.length ?? 0,
      nextEventTitle: block?.events?.[0]?.title ?? null,
      nowIso: summary.generatedAt,
    });
    return { area, brief, copy: localizeAreaBrief(brief, lang) };
  });
  if (!areas.some(({ brief }) => brief.evidenceTypes.length > 0)) return null;
  return <section className="home-area-briefs" aria-labelledby="home-area-briefs-title">
    <div className="home-area-briefs-head">
      <p className="eyebrow">OFFICIAL NOW · SEOUL</p>
      <h2 id="home-area-briefs-title">{areaBriefText.title[lang]}</h2>
      <p>{lang === "ko" ? "지금 상태와 공식 예측을 지역별로 함께 봅니다." : lang === "en" ? "Current conditions and the official forecast, area by area." : lang === "zh" ? "按地区查看当前状态与官方预测。" : "現在の状況と公式予測をエリアごとに確認します。"}</p>
    </div>
    <div className="home-area-brief-rows">{areas.map(({ area, copy }) => <button
      key={area}
      className={selected === area ? "selected" : ""}
      onClick={() => onSelect(area)}
      aria-current={selected === area ? "true" : undefined}
    >
      <span>{areaNames[area][lang]}</span>
      <div><strong>{copy.headline}</strong>{copy.lines.map((line) => <p key={line}>{line}</p>)}</div>
      {copy.freshness && <small>{formatHumanFreshness(copy.freshness, summary.generatedAt, lang)}</small>}
    </button>)}</div>
  </section>;
}

function formatPeopleRange(lang: Lang, min: number, max: number): string {
  const locale = airportLocale(lang);
  return `${min.toLocaleString(locale)}–${max.toLocaleString(locale)}`;
}

function formatPeopleValue(lang: Lang, value: number): string {
  const locale = airportLocale(lang);
  return value.toLocaleString(locale, { maximumFractionDigits: 1 });
}

function formatKrwCompact(lang: Lang, amount: number): string {
  const eok = amount / 100_000_000;
  if (lang === "en") {
    if (eok >= 10_000) return `₩${(eok / 10_000).toFixed(1)}T`;
    return `₩${Math.round(eok).toLocaleString("en-US")}00M`;
  }
  const unit = lang === "zh" ? "亿" : lang === "ja" ? "億" : "억";
  const jo = lang === "zh" ? "万亿" : lang === "ja" ? "兆" : "조";
  if (eok >= 10_000) return `${(eok / 10_000).toFixed(1)}${jo}`;
  return `${Math.round(eok).toLocaleString(airportLocale(lang))}${unit}`;
}

export default function LiveSignals({ lang, area, date = null }: { lang: Lang; area: AreaId; date?: string | null }) {
  const summary = useLiveSummary(date);
  if (!summary) return null;
  const block = summary.areas[area];
  const congestion = summary.airport.congestion;
  // T1 and T2 are separate official sources with separate observation times;
  // they are never combined into one unlabeled total (see docs/DATA_SOURCES.md).
  const congestionByTerminal = new Map<string, LiveCongestionRow[]>();
  for (const row of congestion) {
    const rows = congestionByTerminal.get(row.terminal) ?? [];
    rows.push(row);
    congestionByTerminal.set(row.terminal, rows);
  }
  const terminalOrder = [...congestionByTerminal.keys()].sort();
  const trackedFlights = summary.airport.departuresTrackedToday;
  const passengerForecast = summary.airport.passengerForecast ?? [];
  const hasArea = Boolean(block && (block.realtime || block.realtimeForecast?.length || block.foreignPresence || block.weather.length || block.events.length || block.sales));
  if (!hasArea && !congestion.length && !trackedFlights && !passengerForecast.length) return null;

  // The detail screen reuses the same deterministic builder as the home rows,
  // so the same data can never produce two different sentences.
  const areaBrief = buildAreaCurrentBrief({
    realtime: block?.realtime ?? null,
    realtimeForecast: block?.realtimeForecast ?? [],
    weather: block?.weather ?? [],
    eventCount: block?.eventCount ?? block?.events?.length ?? 0,
    nextEventTitle: block?.events?.[0]?.title ?? null,
    nowIso: summary.generatedAt,
  });
  const areaBriefCopy = localizeAreaBrief(areaBrief, lang);

  const rows: Array<{ key: string; label: string; value: string; note: string; state?: "LIVE" | "STALE" }> = [];

  if (block?.realtime) {
    const level = congestionLabels[block.realtime.congestionLevel]?.[lang] ?? block.realtime.congestionLabel;
    rows.push({
      key: "realtime",
      label: text.realtime[lang],
      value: `${level} · ${formatPeopleRange(lang, block.realtime.populationMin, block.realtime.populationMax)}`,
      note: `${text.sourceSeoul[lang]} · ${formatHumanFreshness(block.realtime.observedAt, summary.generatedAt, lang)}`,
      state: block.realtime.freshness,
    });
  }

  if (block?.foreignPresence) {
    const productId = block.foreignPresence.productVersion.split(":", 1)[0] || "OA-23018";
    rows.push({
      key: "foreign_presence",
      label: text.foreignPresence[lang],
      value: `${formatPeopleValue(lang, block.foreignPresence.value)} ${text.foreignPeople[lang]}`,
      note: `${text.foreignNote[lang]} · ${formatHumanFreshness(block.foreignPresence.referenceAt, summary.generatedAt, lang)} · ${productId}`,
    });
  }

  if (block?.weather.length) {
    const next12 = block.weather.slice(0, 12);
    const maxPop = Math.max(...next12.map((row) => row.precipitationProbability ?? 0));
    const firstTemp = next12.find((row) => row.temperatureTenthC !== null)?.temperatureTenthC;
    const condition = next12.find((row) => row.conditionCode)?.conditionCode;
    const parts: string[] = [];
    if (condition && conditionLabels[condition]) parts.push(conditionLabels[condition][lang]);
    if (firstTemp !== null && firstTemp !== undefined) parts.push(`${(firstTemp / 10).toFixed(0)}°C`);
    parts.push(`${text.rainChance[lang]} ${maxPop}%`);
    rows.push({ key: "weather", label: text.weather[lang], value: parts.join(" · "), note: text.sourceKma[lang] });
  }

  if (block?.events.length) {
    rows.push({
      key: "events",
      label: text.events[lang],
      value: `${block.eventCount ?? block.events.length}${lang === "en" ? " " : ""}${text.eventCount[lang]} · ${block.events[0].title}`,
      note: text.sourceKto[lang],
    });
  }

  if (block?.sales) {
    rows.push({
      key: "sales",
      label: text.sales[lang],
      value: `${formatKrwCompact(lang, block.sales.totalAmount)} · ${block.sales.quarterCode.slice(0, 4)}Q${block.sales.quarterCode.slice(4)}`,
      note: `${text.sourceSales[lang]} · ${text.salesNote[lang]}`,
    });
  }

  // One row per terminal — a T1+T2 combined figure would blur two
  // independently observed official sources into one misleading number.
  for (const terminal of terminalOrder) {
    const terminalRows = congestionByTerminal.get(terminal)!;
    const terminalWaiting = terminalRows.reduce((sum, row) => sum + (row.waitingCount ?? 0), 0);
    const latest = terminalRows.reduce((newest, row) => (row.observedAt > newest.observedAt ? row : newest), terminalRows[0]);
    rows.push({
      key: `airport_${terminal}`,
      label: text.airportTerminal[lang](terminal),
      value: `${terminalWaiting.toLocaleString(airportLocale(lang))} ${text.airportPeople[lang]}`,
      note: `${text.sourceAirport[lang]} · ${formatHumanFreshness(latest.observedAt, summary.generatedAt, lang)}`,
      state: latest.freshness,
    });
  }

  // A5 — official FORECAST/EXPECTED departure passengers, one row per terminal
  // actually returned. Semantically separate from the A4 CURRENT/OBSERVED rows
  // above: never merged into the same number, and the wording always makes
  // clear this is an official forecast, not an actual waiting count.
  for (const forecast of passengerForecast) {
    rows.push({
      key: `forecast_${forecast.terminal}`,
      label: text.passengerForecastLabel[lang](forecast.terminal),
      value: `${Math.round(forecast.expectedPassengers).toLocaleString(airportLocale(lang))}${text.passengerForecastUnit[lang]}`,
      note: `${text.passengerForecastSource[lang]} · ${text.passengerForecastNotice[lang]} · ${formatKstBand(forecast.targetStartAt, forecast.targetEndAt).replace(" KST", "")}`,
    });
  }

  if (trackedFlights) {
    rows.push({
      key: "airport_flights",
      label: text.airportFlights[lang],
      value: `${trackedFlights.toLocaleString(airportLocale(lang))}${text.flightUnit[lang]}`,
      note: { ko: "실제 운항편 수 · 승객 수 아님", en: "Actual flights · not passenger count", zh: "实际航班数 · 非旅客人数", ja: "実運航便数 · 旅客数ではありません" }[lang],
    });
  }

  if (!rows.length) return null;

  return (
    <section className="live-signals" aria-labelledby="live-signals-title">
      {areaBrief.evidenceTypes.length > 0 && (
        <section className="current-brief area-current-brief" aria-label={`${areaNames[area][lang]} ${areaBriefText.nowLabel[lang]}`}>
          <p className="eyebrow">{areaNames[area][lang]} · {areaBriefText.nowLabel[lang].toUpperCase()}</p>
          <strong>{areaBriefCopy.headline}</strong>
          {areaBriefCopy.lines.map((line) => <p key={line}>{line}</p>)}
          {areaBriefCopy.freshness && <small>{formatHumanFreshness(areaBriefCopy.freshness, summary.generatedAt, lang)}</small>}
        </section>
      )}
      <div className="section-head">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2 id="live-signals-title">{text.title[lang]}</h2>
        </div>
      </div>
      <p className="section-intro">{text.intro[lang]}</p>
      <div className="live-signal-rows">
        {rows.map((row, index) => (
          <p key={row.key}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{row.label}</strong>
            <b>{row.value}</b>
            <small>{row.note}{row.state === "STALE" ? ` · ${text.stale[lang]}` : ""}</small>
          </p>
        ))}
      </div>
    </section>
  );
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
  const [direction, setDirection] = useState<"departure" | "arrival">("departure");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<{ date: string | null; rows: LiveFlightRow[] } | null>(null);
  // Changing the date must not leave the previous day's flights on screen, so
  // the loaded date is tracked alongside the rows and compared during render
  // rather than cleared from inside the effect.
  const flights = loaded && loaded.date === date ? loaded.rows : null;
  // Loaded here rather than with the summary: the board reads far more rows
  // than the rest of the product, so it is fetched only once this tab opens.
  useEffect(() => {
    let active = true;
    const url = date ? `/api/live/flights?date=${encodeURIComponent(date)}` : "/api/live/flights";
    fetch(url, { headers: { accept: "application/json" } })
      .then(async (response) => (response.ok ? (await response.json() as { flights?: LiveFlightRow[] }).flights ?? [] : []))
      .catch(() => [])
      .then((rows) => { if (active) setLoaded({ date, rows }); });
    return () => { active = false; };
  }, [date]);
  const scoped = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return (flights ?? []).filter((flight) => {
      if (flight.direction !== direction) return false;
      if (terminal !== "all" && flight.terminal !== terminal) return false;
      if (!needle) return true;
      return `${flight.flightNumber} ${flight.airlineCode ?? ""} ${flight.airportCode ?? ""}`.toUpperCase().includes(needle);
    });
  }, [flights, direction, terminal, query]);
  if (flights === null) return null;
  const visible = scoped.slice(0, 80);
  const directionCount = flights.filter((flight) => flight.direction === direction).length;

  return <section className="flight-board" aria-labelledby="flight-board-title">
    <div className="section-head">
      <div><p className="eyebrow">OFFICIAL FLIGHT RECORD · KST</p><h2 id="flight-board-title">{flightBoardText.search[lang]}</h2></div>
    </div>
    <div className="flight-board-controls">
      <div className="flight-direction" role="group">
        {(["departure", "arrival"] as const).map((value) => <button
          key={value}
          type="button"
          className={direction === value ? "active" : ""}
          onClick={() => setDirection(value)}
          aria-pressed={direction === value}
        >{value === "departure" ? flightBoardText.departures[lang] : flightBoardText.arrivals[lang]}</button>)}
      </div>
      <label className="flight-search-field">
        <span>{flightBoardText.search[lang]}</span>
        <input type="search" value={query} placeholder={flightBoardText.hint[lang]} onChange={(event) => setQuery(event.target.value)} />
      </label>
    </div>
    {!flights.length ? <p className="airport-empty-line">{flightBoardText.empty[lang]}</p>
      : !visible.length ? <p className="airport-empty-line">{flightBoardText.none[lang]}</p>
        : <>
          <ol className="flight-rows">{visible.map((flight) => <li key={`${flight.direction}-${flight.flightNumber}-${flight.scheduledAt}`}>
            <b>{formatKstClock(flight.scheduledAt)}</b>
            <strong>{flight.flightNumber}</strong>
            <span>{flight.airportCode ?? ""}</span>
            <i>{[flight.terminal, flight.gate ? `${flightBoardText.gate[lang]} ${flight.gate}` : null, flight.checkinCounter ? `${flightBoardText.counter[lang]} ${flight.checkinCounter}` : null].filter(Boolean).join(" · ")}</i>
            <small>{flight.status}</small>
          </li>)}</ol>
          <p className="flight-board-foot">{flightBoardText.showing[lang](visible.length, directionCount)}</p>
        </>}
  </section>;
}
