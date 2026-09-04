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
import { eventPreview, eventStatusForDate, safeOfficialEventHomepage } from "../lib/event-presentation";
import { buildFacilityCopyText, type CopyableFacility } from "../lib/facility-share";
import { formatRepresentativeStations } from "../lib/subway-ridership";
import { buildTerminalBriefings, type TerminalBriefing } from "../lib/terminal-briefing";
import { buildWeatherGuide } from "../lib/weather-guide";

type AreaId = "myeongdong" | "hongdae" | "seongsu";

interface LiveRealtime {
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  observedAt: string;
  freshness: "LIVE" | "STALE";
}

export interface LiveCommercial {
  commercialLevel: string;
  paymentCount: number | null;
  paymentAmountMin: number | null;
  paymentAmountMax: number | null;
  observedAt: string;
  retrievedAt: string;
  qualityStatus: string;
  freshness: "LIVE" | "STALE";
}

interface LiveWeatherRow {
  targetAt: string;
  precipitationProbability: number | null;
  temperatureTenthC: number | null;
  conditionCode: string | null;
  /** Official KMA PTY code, so the guide reads falling precipitation rather than inferring it. */
  precipitationTypeCode?: string | null;
  humidityPercent?: number | null;
  windSpeedTenthMps?: number | null;
  dailyMinTemperatureTenthC?: number | null;
  dailyMaxTemperatureTenthC?: number | null;
  /** Only ever set when KMA gave an exact amount; a bound stays null here. */
  precipitationAmountTenthMm?: number | null;
  precipitationAmountKind?: string | null;
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
  contentId?: string | null;
  title: string;
  eventStart: string;
  eventEnd: string | null;
  distanceM: number | null;
  /** Official TourAPI fields stored by the collector; absent means the provider gave none. */
  categoryName?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  overview?: string | null;
  homepage?: string | null;
  status?: "RUNNING" | "UPCOMING";
}

interface LiveSales {
  quarterCode: string;
  tradeAreaName: string | null;
  totalAmount: number;
  industryCount: number;
}

export interface LiveStoreDynamics {
  datasetId: "OA-15577";
  quarterCode: string;
  tradeAreaCode: string;
  tradeAreaName: string;
  tradeAreaTypeCode: string;
  tradeAreaTypeName: string;
  totalStoreCount: number;
  ordinaryStoreCount: number;
  franchiseStoreCount: number;
  openingCount: number;
  closureCount: number;
  mappingVersion: string;
  retrievedAt: string;
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

interface LiveForeignPurposeMobility {
  referenceDate: string;
  retrievedAt: string;
  datasetId: "OA-22378";
  mappingVersion: string;
  shopping: number | null;
  tourism: number | null;
}

interface LiveSubwayRidership {
  referenceDate: string;
  boardingCount: number;
  alightingCount: number;
  selectedStationCount: number;
  selectedStations: string;
  retrievedAt: string;
  datasetId: "OA-22723";
  mappingVersion: string;
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
  commercial: LiveCommercial | null;
  realtimeForecast: LiveRealtimeForecast[];
  weather: LiveWeatherRow[];
  events: LiveEventRow[];
  eventCount: number;
  observedSeries: LiveObservedPoint[];
  sales: LiveSales | null;
  storeDynamics: LiveStoreDynamics | null;
  foreignPresence: LiveForeignPresence | null;
  foreignPurposeMobility: LiveForeignPurposeMobility | null;
  subwayRidership: LiveSubwayRidership | null;
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
type RankedAirlineRow = { iata: string | null; registryName: string | null; country: string | null; countryBasis: "REGISTRY" | "UNVERIFIED"; flights: number; share: number };
type CountryRollupRow = { country: string | null; flights: number; airlines: number; share: number };
type AirlineRankingScope = { totalFlights: number; airlines: RankedAirlineRow[]; countries: CountryRollupRow[]; retrievedAt: string | null };
type AirlineRankingPayload = { all: AirlineRankingScope; byTerminal: Record<string, AirlineRankingScope>; countrySource?: { provider: string; licence: string; retrievedOn: string; entries: number; suppressed?: number } };
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
    airlineRanking?: AirlineRankingPayload;
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
    arrivalForecast: {
      todayExpectedPassengersTotal: number | null;
      todayExpectedPassengersByTerminal: Record<string, number | null>;
      nextExpectedTimeBand: ForecastBand | null;
      peakExpectedTimeBand: ForecastBand | null;
      passengerForecastRetrievedAt: string | null;
      forecastCoverage: { all: ForecastCoverageStatus; byTerminal: Record<string, ForecastCoverageStatus> };
    };
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
  // The metric has to name itself. "96,000–98,000명" beside a bare "실시간 활동"
  // reads to most people as today's visitor count; it is the provider's
  // estimate of how many people are in the area right now.
  currentPopulation: { ko: "현재 추정 인구", en: "Estimated population now", zh: "当前推定人口", ja: "現在の推定人口" },
  notCumulative: { ko: "현재 시점 추정 범위 · 오늘 누적 방문객 아님", en: "estimated range at this moment, not today's cumulative visitors", zh: "当前时点推定范围 · 非今日累计访客", ja: "現時点の推定範囲 · 本日の累計来訪者ではありません" },
  commercial: { ko: "최근 10분 내국인 카드 소비", en: "Recent 10-minute domestic-card activity", zh: "最近10分钟境内消费者银行卡支付", ja: "直近10分の国内消費者カード決済" },
  // The first line of the card states the time basis and the population
  // before any number, so "결제금액 ₩1,000,000–₩1,100,000" is never read as
  // today's total or as all shoppers.
  commercialBasis: {
    ko: "신한카드 내국인 결제 추정 · 최근 10분 기준 · 오늘 누적 아님",
    en: "Shinhan Card domestic-consumer payment estimate · recent 10-minute window · not a daily total",
    zh: "新韩卡韩国境内消费者支付推算 · 最近10分钟窗口 · 非当日累计",
    ja: "新韓カード国内消費者決済の推定 · 直近10分基準 · 本日累計ではありません",
  },
  commercialDisclaimer: {
    ko: "신한카드 내국인 결제 기반 · 전수 매출 아님 · 외국인 소비 아님",
    en: "Based on Shinhan Card domestic-consumer payments · not total sales · not foreign-consumer spending",
    zh: "基于新韩卡韩国境内消费者支付 · 非全量销售额 · 非外国消费者支出",
    ja: "新韓カードの国内消費者決済に基づく · 売上全数ではありません · 外国人消費ではありません",
  },
  weather: { ko: "날씨", en: "Weather", zh: "天气", ja: "天気" },
  rainChance: { ko: "강수확률 최대", en: "max rain chance", zh: "最大降水概率", ja: "降水確率 最大" },
  humidity: { ko: "습도", en: "humidity", zh: "湿度", ja: "湿度" },
  wind: { ko: "바람", en: "wind", zh: "风速", ja: "風速" },
  rainfall: { ko: "강수량", en: "rainfall", zh: "降水量", ja: "降水量" },
  dayLow: { ko: "최저", en: "low", zh: "最低", ja: "最低" },
  dayHigh: { ko: "최고", en: "high", zh: "最高", ja: "最高" },
  events: { ko: "주변 행사", en: "Nearby events", zh: "周边活动", ja: "周辺イベント" },
  eventCount: { ko: "건 진행·예정", en: "running or upcoming", zh: "项进行或即将举行", ja: "件 開催・予定" },
  eventRepresentative: { ko: "대표 행사", en: "Representative events", zh: "代表活动", ja: "代表イベント" },
  eventDetails: { ko: "자세히 보기", en: "View details", zh: "查看详情", ja: "詳細を見る" },
  eventOfficialPage: { ko: "공식 행사 페이지", en: "Official event page", zh: "官方活动页面", ja: "公式イベントページ" },
  eventRunning: { ko: "진행 중", en: "Running", zh: "进行中", ja: "開催中" },
  eventUpcoming: { ko: "예정", en: "Upcoming", zh: "即将举行", ja: "開催予定" },
  eventDistanceBasis: { ko: "선택 지역 기준", en: "from selected area", zh: "距所选区域", ja: "選択エリア基準" },
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
  foreignPurpose: { ko: "최근 공개 외국인 이동 패턴", en: "Latest published foreign mobility pattern", zh: "最新公开外国人移动模式", ja: "最新公開の外国人移動傾向" },
  shoppingPurpose: { ko: "쇼핑 목적", en: "shopping purpose", zh: "购物目的", ja: "買い物目的" },
  tourismPurpose: { ko: "관광 목적", en: "tourism purpose", zh: "观光目的", ja: "観光目的" },
  movementUnit: { ko: "추정 이동", en: "estimated movements", zh: "推算移动", ja: "推定移動" },
  foreignPurposeNote: {
    ko: "서울시 월간 통계 추정치 · 실시간·방문객·구매·매출 아님",
    en: "Monthly Seoul statistical estimate · not real-time activity, visitors, purchases, or sales",
    zh: "首尔市月度统计推算 · 非实时活动、访客数、购买或销售额",
    ja: "ソウル市の月次統計推定 · リアルタイム・来訪者数・購入・売上ではありません",
  },
  subwayRidership: { ko: "대표 지하철역 승하차", en: "Representative station boarding and alighting", zh: "代表地铁站进出站", ja: "代表駅の乗降" },
  subwayAlighting: { ko: "하차", en: "alighting", zh: "出站", ja: "降車" },
  subwayBoarding: { ko: "승차", en: "boarding", zh: "进站", ja: "乗車" },
  subwayNote: {
    ko: "서울교통공사 일별 집계 · 실시간·고유 방문객·상권 방문객 수 아님",
    en: "Daily Seoul Metro counts · not real-time, unique people, or commercial-area visitors",
    zh: "首尔交通公社每日统计 · 非实时、独立访客或商圈访客数",
    ja: "ソウル交通公社の日次集計 · リアルタイム・ユニーク人数・商圏来訪者数ではありません",
  },
  arrivalToday: { ko: "오늘 예상 입국객", en: "Expected arrivals today", zh: "今日预计入境旅客", ja: "今日の予想入国者数" },
  arrivalNext: { ko: "다음 시간대 예상 입국객", en: "Next-band expected arrivals", zh: "下一时段预计入境旅客", ja: "次の時間帯の予想入国者数" },
  arrivalPeak: { ko: "오늘 예상 입국 피크", en: "Expected arrival peak today", zh: "今日预计入境高峰", ja: "今日の予想入国ピーク" },
  arrivalUnit: { ko: "명", en: " people", zh: "人", ja: "人" },
  arrivalSource: {
    ko: "인천공항 공식 입국 예상 · 서울 소비 수요의 선행 참고 신호 · 실제 서울 방문객 수 아님",
    en: "Official Incheon arrival forecast · leading reference signal for Seoul consumer demand · not an actual Seoul visitor count",
    zh: "仁川机场官方入境预测 · 首尔消费需求的先行参考信号 · 非首尔实际访客数",
    ja: "仁川空港公式入国予測 · ソウル消費需要の先行参考シグナル · ソウルの実来訪者数ではありません",
  },
  arrivalTerminalBreakdown: { ko: "터미널별", en: "By terminal", zh: "按航站楼", ja: "ターミナル別" },
  stale: { ko: "지연됨", en: "STALE", zh: "已延迟", ja: "遅延" },
  sourceSeoul: { ko: "서울 실시간 도시데이터", en: "Seoul real-time city data", zh: "首尔实时城市数据", ja: "ソウルリアルタイム都市データ" },
  sourceKma: { ko: "기상청 단기예보", en: "KMA short-term forecast", zh: "气象厅短期预报", ja: "気象庁短期予報" },
  sourceKto: { ko: "한국관광공사 TourAPI", en: "KTO TourAPI", zh: "韩国观光公社 TourAPI", ja: "韓国観光公社 TourAPI" },
  sourceSales: { ko: "서울시 상권분석서비스", en: "Seoul commercial-district analysis", zh: "首尔商圈分析服务", ja: "ソウル商圏分析サービス" },
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
  // Deliberately carries the summed BAND (14:00–24:00 KST), not a clock: the
  // card sits beside a retrieval stamp, and a bare time there read as if the
  // two numbers disagreed. A range cannot be mistaken for a retrieval moment.
  remainingNote: {
    ko: (band: string) => `${band} 공식 예상 승객 합계`,
    en: (band: string) => `Official expected passengers, ${band}`,
    zh: (band: string) => `${band} 官方预计旅客合计`,
    ja: (band: string) => `${band} 公式予想旅客合計`,
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
  nowMarker: { ko: "현재 시각", en: "Now", zh: "当前时间", ja: "現在時刻" },
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
  showAllCheckpoints: { ko: "전체 출국장 보기", en: "Show all checkpoints", zh: "查看全部出境检查口", ja: "すべての出国場を表示" },
  showLongestOnly: { ko: "가장 긴 대기만 보기", en: "Show longest wait only", zh: "仅显示最长等候", ja: "最も長い待ちのみ表示" },
  forecastTitle: { ko: "공식 예상 출국객 흐름", en: "Official expected passenger flow", zh: "官方预计出境客流", ja: "公式予想出国者の流れ" },
  partialBody: { ko: "공식 예상 데이터의 일부 시간대가 누락되어 하루 전체 합계와 피크는 표시하지 않습니다.", en: "Some official time bands are missing, so the full-day total and peak are not shown.", zh: "部分官方时段数据缺失，因此不显示全天合计与高峰。", ja: "公式予測の一部時間帯が欠けているため、1日全体の合計とピークは表示しません。" },
  unavailableBody: { ko: "이 날짜의 공식 예상 시간대가 없습니다. 실제 출발 운항과 현재 출국장 정보는 계속 확인할 수 있습니다.", en: "No official forecast bands exist for this date. Physical departures and current checkpoints remain available.", zh: "该日期没有官方预计时段数据，仍可查看实际出发航班和当前出境区信息。", ja: "この日付の公式予測時間帯はありません。実出発便と現在の出国場情報は引き続き確認できます。" },
  gateRankHead: { ko: "순위 · 터미널 · 게이트 · 출발편", en: "Rank · Terminal · Gate · Departures", zh: "排名 · 航站楼 · 登机口 · 出发航班", ja: "順位 · ターミナル · ゲート · 出発便" },
  // Today's rows can be absent for a whole service day when the morning A1
  // scan timed out at the provider. Say that plainly instead of the generic
  // coverage line, which would blame gate data that was never collected.
  noFlightsToday: { ko: "오늘 출발편 데이터가 아직 수집되지 않았습니다. 06:07 / 10:07 KST 수집 후 표시됩니다.", en: "Today's departures have not been collected yet. They appear after the 06:07 / 10:07 KST collection.", zh: "今日出发航班数据尚未采集，将在 06:07 / 10:07 KST 采集后显示。", ja: "本日の出発便データはまだ収集されていません。06:07 / 10:07 KST の収集後に表示されます。" },
  noFlightsForDate: { ko: "이 날짜의 출발편 데이터가 없습니다.", en: "No departure data is stored for this date.", zh: "该日期没有出发航班数据。", ja: "この日付の出発便データはありません。" },
  airlinesJump: { ko: "오늘 출발편 기준 항공사·국적 분포 보기", en: "See today's airline and country breakdown", zh: "查看今日出发航班的航空公司·国籍分布", ja: "本日の出発便の航空会社・国籍分布を見る" },
  airlinesTitle: { ko: "항공사별 운항 순위", en: "Airlines by departures", zh: "航空公司出发航班排名", ja: "航空会社別運航ランキング" },
  airlinesNote: { ko: "오늘 실제 출발편을 운항 항공사 기준으로 집계한 순위입니다. 공동운항편은 운항사 1편으로만 셉니다.", en: "Today's physical departures counted by operating airline. A codeshare counts once, for its operator.", zh: "按实际执飞航空公司统计的今日出发航班排名，共享航班仅按执飞方计 1 班。", ja: "本日の実運航出発便を運航会社ごとに集計した順位です。コードシェア便は運航会社の1便としてのみ数えます。" },
  airlineRankHead: { ko: "순위 · 항공사 · 국적 · 출발편", en: "Rank · Airline · Country · Departures", zh: "排名 · 航空公司 · 国籍 · 出发航班", ja: "順位 · 航空会社 · 国籍 · 出発便" },
  countriesTitle: { ko: "국적별 운항편", en: "Departures by airline country", zh: "按航空公司国籍的出发航班", ja: "航空会社の国籍別出発便" },
  countryRankHead: { ko: "순위 · 국적 · 항공사 수 · 출발편", en: "Rank · Country · Airlines · Departures", zh: "排名 · 国籍 · 航空公司数 · 出发航班", ja: "順位 · 国籍 · 航空会社数 · 出発便" },
  countryUnverified: { ko: "국적 미확인", en: "Country unverified", zh: "国籍未确认", ja: "国籍未確認" },
  airlinesUnit: { ko: "개 항공사", en: " airlines", zh: "家航空公司", ja: "社" },
  noAirlineList: { ko: "운항 항공사를 식별할 수 있는 출발편이 없습니다.", en: "No departures with an identifiable operating airline.", zh: "没有可识别执飞航空公司的出发航班。", ja: "運航会社を識別できる出発便がありません。" },
  airlineCountryBasis: {
    ko: (retrievedOn: string) => `국적은 OpenFlights 항공사 참조표(ODbL, ${retrievedOn} 수집) 기준이며 공식 등록 자료가 아닙니다. 참조표가 보증하지 못하는 항공사는 '국적 미확인'으로 표시합니다.`,
    en: (retrievedOn: string) => `Country from the OpenFlights airline reference table (ODbL, retrieved ${retrievedOn}), not an official register. Airlines the table cannot vouch for are shown as unverified.`,
    zh: (retrievedOn: string) => `国籍依据 OpenFlights 航空公司参考表（ODbL，${retrievedOn} 获取），并非官方登记资料。参考表无法确认的航空公司显示为“国籍未确认”。`,
    ja: (retrievedOn: string) => `国籍は OpenFlights 航空会社参照表（ODbL、${retrievedOn} 取得）に基づき、公式登録資料ではありません。参照表が保証できない航空会社は「国籍未確認」と表示します。`,
  },
  nowOnly: {
    ko: "현재 출국장 대기는 실시간 관측이라 언제나 지금 시점만 보여줍니다.",
    en: "Departure-hall waits are live observations, so they always show the present moment.",
    zh: "出境区等候为实时观测，因此始终显示当前时刻。",
    ja: "出国場の待ちはリアルタイム観測のため、常に現在時点のみを表示します。",
  },
} as const;

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
    // The metric is named before the number here too: a bare range next to a
    // congestion word is the exact ambiguity this phase set out to remove.
    const metric = lang === "ko" ? "현재 추정 인구" : lang === "en" ? "Estimated population now"
      : lang === "zh" ? "当前推定人口" : "現在の推定人口";
    const measured = `${metric} ${range}${people} · ${level}`;
    headline = brief.current.freshness === "STALE" ? `${areaBriefText.stale[lang]} · ${measured}` : measured;
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
    // Official category name first, then the title: "축제 · 명동 페스티벌".
    const nextEvent = [brief.nextEventCategory, brief.nextEventTitle].filter(Boolean).join(" · ");
    const label = nextEvent
      ? (lang === "ko" ? `인근 행사 ${brief.eventCount}건 · ${nextEvent}`
        : lang === "en" ? `${brief.eventCount} nearby event${brief.eventCount === 1 ? "" : "s"} · ${nextEvent}`
        : lang === "zh" ? `附近${brief.eventCount}项活动 · ${nextEvent}`
        : `周辺イベント${brief.eventCount}件 · ${nextEvent}`)
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
  if (!set.terminals.some((row) => row.evidenceTypes.length)) return null;
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
        const next = bandText(row.nextBand);
        if (next) cells.push({ key: "next", label: terminalBriefText.next[lang], value: next });
        const peak = bandText(row.peak);
        if (peak) cells.push({ key: "peak", label: terminalBriefText.peak[lang], value: peak });
        if (row.remaining) cells.push({ key: "remaining", label: terminalBriefText.remaining[lang], value: `${Math.round(row.remaining.expectedPassengers).toLocaleString(locale)}${peopleUnit}` });
        if (row.departures !== null) cells.push({ key: "flights", label: terminalBriefText.flights[lang], value: `${row.departures.toLocaleString(locale)}${flightUnit}` });
        if (row.topGate) cells.push({ key: "gate", label: terminalBriefText.gate[lang], value: `Gate ${row.topGate.gate} · ${row.topGate.flights.toLocaleString(locale)}${flightUnit}` });
        return <article key={row.terminal} className={`terminal-brief-card${set.attention?.terminal === row.terminal ? " is-attention" : ""}`} data-terminal={row.terminal}>
          <h4>{row.terminal}</h4>
          {cells.length
            ? <dl>{cells.map((cell) => <div key={cell.key}><dt>{cell.label}</dt><dd>{cell.value}</dd></div>)}</dl>
            : <p className="terminal-brief-empty">{terminalBriefText.unavailable[lang]}</p>}
        </article>;
      })}
    </div>
    <p className="terminal-brief-limitation">{terminalBriefText.limitation[lang]}</p>
  </section>;
}

export function AirportTodaySummary({ lang, terminal = "all", date = null }: { lang: Lang; terminal?: "all" | "T1" | "T2"; date?: string | null }) {
  // Eight full-height checkpoint rows per terminal cost more vertical space
  // than they earn: what a reader needs first is the one queue that is longest
  // right now. The rest stay one keystroke away rather than always on screen.
  const [showAllCheckpoints, setShowAllCheckpoints] = useState(false);
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
  const collectedText = (value: string | null) => value ? formatHumanFreshness(value, nowIso, lang, "collected") : null;
  const passengerCollected = collectedText(passengerRetrievedAt);
  const flightsCollected = collectedText(flightsRetrievedAt);
  const gateCollected = collectedText(gateRetrievedAt);

  const scopeLabel = airportTodayText.scope[lang][terminal];
  const gateList = isAll ? airport.busyDepartureGates ?? [] : airport.busyDepartureGatesByTerminal?.[terminal] ?? [];
  const ranking = isAll ? airport.airlineRanking?.all ?? null : airport.airlineRanking?.byTerminal?.[terminal] ?? null;
  const noFlightsText = summary?.dayRelation === "PAST" ? airportTodayText.noFlightsForDate[lang] : airportTodayText.noFlightsToday[lang];
  const rankedCheckpoints = rankCurrentDepartureHallCheckpoints(
    (airport.congestion ?? []).map((row) => ({ ...row, waitTimeRaw: row.waitTimeRaw ?? null })),
  ) as Record<string, LiveCongestionRow[]>;
  const checkpointTerminals = Object.keys(rankedCheckpoints).filter((key) => isAll || key === terminal);
  const maxBand = Math.max(1, ...timeline.map((row) => row.expectedPassengers));
  // The current-time marker exists only for TODAY. A past or future service
  // date has no "now" inside it, and drawing one would invent a moment in a
  // day the clock is not in. Bands the marker has passed stay forecasts.
  const nowBandStart = summary?.dayRelation === "TODAY"
    ? timeline.find((row) => Date.parse(row.targetStartAt) <= Date.parse(nowIso) && Date.parse(nowIso) < Date.parse(row.targetEndAt))?.targetStartAt ?? null
    : null;
  const nowLabel = `${airportTodayText.nowMarker[lang]} ${formatKstClock(nowIso)}`;
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
  // The shared line already carries the word "collected" in its own label, so
  // its stamp is the clock alone instead of saying "collected" twice.
  const plainText = (value: string | null) => value ? formatHumanFreshness(value, nowIso, lang, "plain") : null;
  const distinctSectionFreshness = [...new Set([passengerRetrievedAt, flightsRetrievedAt, gateRetrievedAt].map(plainText).filter((value): value is string => Boolean(value)))];
  const perMetric = (value: string | null) => (sharesOneFreshness ? null : value);

  return <section className="airport-today" aria-labelledby="airport-today-title">
    <section className="current-brief airport-current-brief" aria-label={`${scopeLabel} ${areaBriefText.nowLabel[lang]}`}>
      <p className="eyebrow">{scopeLabel} · {areaBriefText.nowLabel[lang].toUpperCase()}</p>
      {airportBriefLines.map((line, index) => index === 0 ? <strong key={line}>{line}</strong> : <p key={line}>{line}</p>)}
    </section>

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

    <section className="airport-detail-section airport-forecast" aria-labelledby="airport-forecast-title">
      <div className="airport-detail-head"><div><p className="eyebrow">OFFICIAL FORECAST · {scopeLabel}</p><h3 id="airport-forecast-title">{airportTodayText.forecastTitle[lang]}</h3></div><p>{airportTodayText.forecastOnly[lang]}</p></div>
      {forecastStatus === "COMPLETE" && timeline.length > 0
        ? <div className="airport-timeline" role="img" aria-label={`${airportTodayText.forecastTitle[lang]}. ${airportTodayText.forecastOnly[lang]}${nowBandStart ? `. ${nowLabel}` : ""}`}>
          <div className="airport-timeline-bars">{timeline.map((row) => <p
            key={row.targetStartAt}
            className={[peak?.targetStartAt === row.targetStartAt ? "peak" : "", nowBandStart === row.targetStartAt ? "now" : ""].filter(Boolean).join(" ")}
            data-now-label={nowBandStart === row.targetStartAt ? nowLabel : undefined}
          >
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

    <section className="airport-detail-section airport-checkpoints" aria-labelledby="airport-checkpoints-title">
      <div className="airport-detail-head"><div><p className="eyebrow">CURRENT OBSERVATION · {scopeLabel}</p><h3 id="airport-checkpoints-title">{airportTodayText.current[lang]}</h3></div><p>{airportTodayText.currentNote[lang]}</p></div>
      {checkpointTerminals.length ? <div className="airport-checkpoint-groups">{checkpointTerminals.map((terminalId) => {
        const busiest = airport.currentBusiestDepartureHallByTerminal?.[terminalId];
        return <div className="airport-checkpoint-terminal" key={terminalId}>
          <h4><span>{terminalId}</span>{airportTodayText.scope[lang][terminalId as "T1" | "T2"] ?? terminalId}</h4>
          <div>{(showAllCheckpoints
            ? rankedCheckpoints[terminalId]
            : rankedCheckpoints[terminalId].filter((row) => (busiest ? busiest.zone === row.zone : false))
                .concat(busiest ? [] : rankedCheckpoints[terminalId].slice(0, 1))
          ).map((row) => {
            const index = rankedCheckpoints[terminalId].indexOf(row);
            const isBusiest = busiest?.zone === row.zone;
            return <article className={isBusiest ? "is-busiest" : ""} key={`${terminalId}-${row.zone}`}>
              <span className="checkpoint-rank">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{friendlyCheckpointName(row.zone, lang)}</strong>{isBusiest && <small>{airportTodayText.longest[lang]}</small>}</div>
              <b><i>{airportTodayText.waitLabel[lang]}</i>{waitText(row)}</b>
              <p><i>{airportTodayText.peopleLabel[lang]}</i>{row.waitingCount === null ? airportTodayText.unavailable[lang] : `${row.waitingCount.toLocaleString(numberLocale)}${airportTodayText.waiting[lang]}`}<small>{formatHumanFreshness(row.observedAt, nowIso, lang, "observed")}{row.freshness === "STALE" ? ` · ${text.stale[lang]}` : ""}</small></p>
            </article>;
          })}</div>
        </div>;
      })}</div> : <p className="airport-empty-line">{airportTodayText.unavailable[lang]}</p>}
      {checkpointTerminals.length > 0 && <button
        type="button"
        className="airport-checkpoint-toggle"
        aria-expanded={showAllCheckpoints}
        aria-controls="airport-checkpoints-title"
        onClick={() => setShowAllCheckpoints((open) => !open)}
      >{showAllCheckpoints ? airportTodayText.showLongestOnly[lang] : airportTodayText.showAllCheckpoints[lang]}</button>}
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
      </ol> : <p className="airport-empty-line">{flightsCount === null ? noFlightsText : airportTodayText.noGateList[lang]}</p>}
      <p className="airport-detail-foot"><a className="airport-jump-link" href="#airport-airlines-title">{airportTodayText.airlinesJump[lang]} ↓</a></p>
    </section>

    <section className="airport-detail-section airport-airlines" aria-labelledby="airport-airlines-title">
      <div className="airport-detail-head"><div><p className="eyebrow">OPERATING AIRLINES · {scopeLabel}</p><h3 id="airport-airlines-title">{airportTodayText.airlinesTitle[lang]}</h3></div><p>{airportTodayText.airlinesNote[lang]}</p></div>
      {ranking && ranking.airlines.length ? <>
        <ol className="airport-gate-list airport-airline-list">
          <li className="airport-gate-head" aria-hidden="true"><span>#</span><strong>{airportTodayText.airlineRankHead[lang]}</strong></li>
          {ranking.airlines.map((row, index) => <li className="airport-rank-row airport-airline-row" key={row.iata ?? `label-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{row.iata ? <i>{row.iata}</i> : null}{airlineDisplayName(row, lang)}<em>{row.country ? regionName(row.country, lang) : airportTodayText.countryUnverified[lang]}</em></strong>
            <b>{row.flights.toLocaleString(numberLocale)}{flightUnit}<small>{formatShare(row.share)}</small></b>
          </li>)}
        </ol>
        <h4 className="airport-subhead">{airportTodayText.countriesTitle[lang]}</h4>
        <ol className="airport-gate-list airport-country-list">
          <li className="airport-gate-head" aria-hidden="true"><span>#</span><strong>{airportTodayText.countryRankHead[lang]}</strong></li>
          {ranking.countries.map((row, index) => <li className="airport-rank-row airport-country-row" key={row.country ?? "unverified"}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{row.country ? <i>{row.country}</i> : null}{row.country ? regionName(row.country, lang) : airportTodayText.countryUnverified[lang]}<em>{row.airlines.toLocaleString(numberLocale)}{airportTodayText.airlinesUnit[lang]}</em></strong>
            <b>{row.flights.toLocaleString(numberLocale)}{flightUnit}<small>{formatShare(row.share)}</small></b>
          </li>)}
        </ol>
        <p className="airport-detail-foot">{airportTodayText.airlineCountryBasis[lang](airport.airlineRanking?.countrySource?.retrievedOn ?? "—")}</p>
      </> : <p className="airport-empty-line">{flightsCount === null ? noFlightsText : airportTodayText.noAirlineList[lang]}</p>}
    </section>
  </section>;
}

/** Locale region name for an ISO 3166-1 alpha-2 code; the code itself when the runtime has no display names. */
function regionName(code: string, lang: Lang): string {
  try {
    return new Intl.DisplayNames([airportLocale(lang)], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function airlineDisplayName(row: RankedAirlineRow, lang: Lang): string {
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
  intro: {
    ko: "인천국제공항공사가 공개한 여객터미널 시설 정보입니다. 공식 등록 정보이며, 지금 문을 열었는지를 실시간으로 확인한 것은 아닙니다.",
    en: "The passenger-terminal facility directory published by Incheon International Airport Corporation. Official registered information — not a real-time check of whether a store is open right now.",
    zh: "仁川国际机场公社公开的旅客航站楼设施信息。为官方登记信息，并非实时确认当前是否营业。",
    ja: "仁川国際空港公社が公開した旅客ターミナル施設情報です。公式登録情報であり、今営業中かをリアルタイムで確認したものではありません。",
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
  more: { ko: "더 보기", en: "Show more", zh: "查看更多", ja: "もっと見る" },
  count: { ko: (n: number) => `${n}곳 표시`, en: (n: number) => `${n} shown`, zh: (n: number) => `显示 ${n} 处`, ja: (n: number) => `${n}件を表示` },
  unknown: { ko: "확인 불가", en: "Unavailable", zh: "暂无法确认", ja: "確認不可" },
  /**
   * The directory is a registration record, not a live tenancy feed. A shop
   * that has already left can remain listed until the operator republishes —
   * confirmed by the owner for a cosmetics counter that left Shilla Duty Free
   * on 2026-04-16 and was still being served. Saying so is cheaper than a
   * reader trusting a store that is not there.
   */
  staleness: {
    ko: "공식 자료가 갱신되기 전이면 이미 퇴점한 매장이 남아 있을 수 있습니다",
    en: "Until the operator republishes, a store that has already left may still be listed",
    zh: "官方资料更新前，已撤店的店铺可能仍会显示",
    ja: "公式資料が更新されるまで、すでに退店した店舗が残っている場合があります",
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

function facilityName(row: FacilityRow, lang: Lang): string {
  const preferred = lang === "en" ? [row.nameEn, row.nameKo]
    : lang === "ja" ? [row.nameJa, row.nameKo]
      : lang === "zh" ? [row.nameZh, row.nameKo]
        : [row.nameKo, row.nameEn];
  return preferred.find((value): value is string => Boolean(value)) ?? facilityText.unknown[lang];
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
  const [loaded, setLoaded] = useState<{ key: string; rows: FacilityRow[]; hasMore: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/airport/facilities?${requestKey}`, { headers: { accept: "application/json" } })
      .then(async (response) => (response.ok ? await response.json() as { facilities?: FacilityRow[]; hasMore?: boolean } : { facilities: [], hasMore: false }))
      .catch(() => ({ facilities: [] as FacilityRow[], hasMore: false }))
      .then((payload) => { if (active) setLoaded({ key: requestKey, rows: payload.facilities ?? [], hasMore: Boolean(payload.hasMore) }); });
    return () => { active = false; };
  }, [requestKey]);

  const state = loaded && loaded.key === requestKey ? loaded : null;
  const rows = state?.rows ?? [];
  return <section className="airport-facilities" aria-labelledby="airport-facilities-title">
    <div className="section-head">
      <div><p className="eyebrow">OFFICIAL FACILITY DIRECTORY · 인천국제공항공사</p><h2 id="airport-facilities-title">{facilityText.title[lang]}</h2></div>
      {state && <span className="official-label">{facilityText.count[lang](rows.length)}</span>}
    </div>
    <p className="section-intro">{facilityText.intro[lang]}</p>
    <p className="facility-staleness">{facilityText.staleness[lang]}</p>

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
      : rows.length === 0 ? <p className="airport-empty-line">{facilityText.empty[lang]}</p>
        : <ul className="facility-list">
          {rows.map((row) => <li key={row.facilityId} className="facility-card">
            <div className="facility-card-head">
              <h3>{facilityName(row, lang)}</h3>
              <p className="facility-badges">
                <span>{row.terminal ? facilityText.terminals[row.terminal]?.[lang] ?? row.terminal : facilityText.unknown[lang]}</span>
                {row.floor && <span>{row.floor}</span>}
                {row.dutyArea && <span>{row.dutyArea === "DUTY_FREE" ? facilityText.dutyFree[lang] : facilityText.general[lang]}</span>}
                {row.arrivalDeparture && <span>{row.arrivalDeparture === "ARRIVAL" ? facilityText.arrival[lang] : facilityText.departure[lang]}</span>}
              </p>
            </div>
            <dl className="facility-details">
              <div><dt>{facilityText.location[lang]}</dt><dd>{(lang === "en" ? row.locationEn ?? row.locationRaw : row.locationRaw) ?? facilityText.unknown[lang]}</dd></div>
              <div><dt>{facilityText.hours[lang]}</dt><dd>{row.businessHoursRaw ?? facilityText.unknown[lang]}</dd></div>
              {row.goodsBrands && <div><dt>{facilityText.brands[lang]}</dt><dd>{row.goodsBrands}</dd></div>}
              {row.phone && <div><dt>{facilityText.phone[lang]}</dt><dd>{row.phone}</dd></div>}
            </dl>
            <FacilityLocationStatus row={row} lang={lang} />
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
    PASSENGER_FORECAST: { ko: "공식 예상 출국객", en: "Official expected passengers", zh: "官方预计出境旅客", ja: "公式予想出国者" },
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
  const [results, setResults] = useState<FacilityRow[] | null>(null);
  const [operations, setOperations] = useState<OperationsResponse | null>(null);

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
        .then(async (response) => (response.ok ? await response.json() as { facilities?: FacilityRow[] } : { facilities: [] }))
        .catch(() => ({ facilities: [] as FacilityRow[] }))
        .then((payload) => { if (active) setResults(payload.facilities ?? []); });
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
        .then(async (response) => await response.json() as OperationsResponse)
        .catch(() => null)
        .then((payload) => { if (active && payload) setOperations(payload); });
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
      {results !== null && (results.length === 0
        ? <p className="airport-empty-line">{myStoreText.empty[lang]}</p>
        : <ul className="my-store-results">
          {results.map((row) => <li key={row.facilityId}>
            <button type="button" onClick={() => setFacilityId(row.facilityId)}>
              <strong>{facilityName(row, lang)}</strong>
              <span>{[
                row.terminal ? facilityText.terminals[row.terminal]?.[lang] ?? row.terminal : facilityText.unknown[lang],
                row.floor,
                row.facilityItem,
              ].filter(Boolean).join(" · ")}</span>
            </button>
          </li>)}
        </ul>)}
    </>}

    {facilityId && <MyStoreSnapshot lang={lang} operations={operations} />}
  </section>;
}

/** The snapshot itself: official header first, then only evidence-backed context. */
function MyStoreSnapshot({ lang, operations }: { lang: Lang; operations: OperationsResponse | null }) {
  if (!operations) return <p className="airport-empty-line">{myStoreText.loading[lang]}</p>;
  const { facility, brief } = operations;
  if (!facility) return <p className="airport-empty-line">{facilityText.empty[lang]}</p>;
  const locale = airportLocale(lang);
  const count = (value: number) => value.toLocaleString(locale);

  return <article className="my-store-brief">
    <header>
      <h3>{facilityName(facility, lang)}</h3>
      <p className="facility-badges">
        {facility.facilityItem && <span>{facility.facilityItem}</span>}
        <span>{facility.terminal ? facilityText.terminals[facility.terminal]?.[lang] ?? facility.terminal : facilityText.unknown[lang]}</span>
        {facility.floor && <span>{facility.floor}</span>}
        {facility.dutyArea && <span>{facility.dutyArea === "DUTY_FREE" ? facilityText.dutyFree[lang] : facilityText.general[lang]}</span>}
        {facility.arrivalDeparture && <span>{facility.arrivalDeparture === "ARRIVAL" ? facilityText.arrival[lang] : facilityText.departure[lang]}</span>}
      </p>
      <dl className="facility-details">
        <div><dt>{facilityText.location[lang]}</dt><dd>{(lang === "en" ? facility.locationEn ?? facility.locationRaw : facility.locationRaw) ?? facilityText.unknown[lang]}</dd></div>
        <div><dt>{facilityText.hours[lang]}</dt><dd>{facility.businessHoursRaw ?? facilityText.unknown[lang]}</dd></div>
        {facility.phone && <div><dt>{facilityText.phone[lang]}</dt><dd>{facility.phone}</dd></div>}
      </dl>
      <FacilityLocationStatus row={facility} lang={lang} />
      <p className="facility-staleness">{facilityText.staleness[lang]}</p>
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
      nextEventCategory: block?.events?.[0]?.categoryName ?? null,
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
      {copy.freshness && <small>{formatHumanFreshness(copy.freshness, summary.generatedAt, lang, "observed")}</small>}
    </button>)}</div>
  </section>;
}

/** `9/1–9/30` from the official start and end dates; start alone when there is no end. */
function formatEventPeriod(event: { eventStart: string; eventEnd: string | null }): string {
  const short = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? `${Number(match[2])}/${Number(match[3])}` : "";
  };
  const start = short(event.eventStart);
  if (!start) return "";
  const end = event.eventEnd ? short(event.eventEnd) : "";
  return end && end !== start ? `${start}\u2013${end}` : start;
}

/**
 * The official address as the place line. The city prefix says nothing on a
 * page that is only about Seoul, so it is dropped; nothing else is altered.
 */
function formatEventPlace(event: { address?: string | null }): string {
  const address = event.address?.trim() ?? "";
  return address.replace(/^서울특별시\s*|^서울시\s*|^서울\s+/, "").trim();
}

/** Official distance from the area centre, rounded to a unit a reader can use. */
function formatEventDistance(lang: Lang, event: { distanceM: number | null }): string {
  if (event.distanceM === null || !Number.isFinite(event.distanceM)) return "";
  const metres = Math.round(event.distanceM);
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)}km`;
  return `${metres}m`;
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

export interface CommercialSignalRow {
  key: "commercial";
  label: string;
  statusLabel: string;
  statusValue: string;
  amountLabel: string;
  amountValue: string | null;
  countLabel: string;
  countValue: string | null;
  referenceLabel: string;
  referenceValue: string;
  retrievalLabel: string;
  retrievalValue: string;
  attribution: string;
  privacyMessage: string | null;
  staleAge: string | null;
  /** Kept until the structured card consumes this builder directly. */
  value: string;
  note: string;
  state: "LIVE" | "STALE";
}

const commercialFieldText = {
  status: { ko: "상태", en: "Status", zh: "状态", ja: "状態" },
  amount: { ko: "결제금액", en: "Payment amount", zh: "支付金额", ja: "決済金額" },
  count: { ko: "결제 건수", en: "Payment count", zh: "支付笔数", ja: "決済件数" },
  reference: { ko: "관측 기준", en: "Reference window", zh: "基准时间", ja: "観測基準" },
  retrieval: { ko: "KORETAIL 수집", en: "KORETAIL retrieval", zh: "KORETAIL采集", ja: "KORETAIL取得" },
  privacy: {
    ko: "표본 보호로 금액 비공개",
    en: "Amount withheld for sample privacy",
    zh: "为保护样本隐私，金额未公开",
    ja: "サンプル保護のため金額非公開",
  },
} as const;

function formatCommercialReference(lang: Lang, observedAt: string): string {
  const clock = formatKstClock(observedAt);
  if (!clock) return lang === "ko" ? "최근 10분" : lang === "en" ? "Recent 10 minutes" : lang === "zh" ? "最近10分钟" : "直近10分";
  return lang === "ko" ? `${clock} 기준 최근 10분`
    : lang === "en" ? `Recent 10 minutes as of ${clock} KST`
      : lang === "zh" ? `截至${clock} KST的最近10分钟`
        : `${clock} KST時点の直近10分`;
}

function formatCommercialRetrieval(lang: Lang, retrievedAt: string): string {
  const clock = formatKstClock(retrievedAt);
  if (!clock) return "";
  return lang === "ko" ? `${clock} 수집`
    : lang === "en" ? `Collected ${clock} KST`
      : lang === "zh" ? `${clock} KST采集`
        : `${clock} KST取得`;
}

function formatCommercialAge(lang: Lang, observedAt: string, generatedAt: string): string | null {
  const ageMinutes = Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(observedAt)) / 60_000));
  if (!Number.isFinite(ageMinutes)) return null;
  if (ageMinutes < 60) return lang === "ko" ? `${ageMinutes}분 전` : lang === "en" ? `${ageMinutes} min old` : lang === "zh" ? `${ageMinutes}分钟前` : `${ageMinutes}分前`;
  const hours = Math.floor(ageMinutes / 60);
  return lang === "ko" ? `${hours}시간 전` : lang === "en" ? `${hours} hr old` : lang === "zh" ? `${hours}小时前` : `${hours}時間前`;
}

/** Truthful OA-21285 row; suppressed amounts are omitted, never zero-filled. */
export function buildCommercialSignalRow(
  lang: Lang,
  commercial: LiveCommercial | null | undefined,
  generatedAt: string,
): CommercialSignalRow | null {
  if (!commercial?.commercialLevel.trim()) return null;
  const hasRange = commercial.paymentAmountMin !== null
    && commercial.paymentAmountMax !== null
    && Number.isFinite(commercial.paymentAmountMin)
    && Number.isFinite(commercial.paymentAmountMax)
    && commercial.paymentAmountMin >= 0
    && commercial.paymentAmountMax >= 0;
  const hasCount = commercial.paymentCount !== null && Number.isFinite(commercial.paymentCount) && commercial.paymentCount >= 0;
  const amountValue = hasRange
    // "min ~ max" with spaces: the bare en dash read as a strike-through on
    // small screens, and the spaces give the line a place to wrap that is
    // not inside a number.
    ? `₩${commercial.paymentAmountMin!.toLocaleString(airportLocale(lang))} ~ ₩${commercial.paymentAmountMax!.toLocaleString(airportLocale(lang))}`
    : null;
  const countValue = hasCount
    ? `${commercial.paymentCount!.toLocaleString(airportLocale(lang))}${lang === "ko" ? "건" : lang === "en" ? " payments" : lang === "zh" ? "笔" : "件"}`
    : null;
  const referenceValue = formatCommercialReference(lang, commercial.observedAt);
  const retrievalValue = formatCommercialRetrieval(lang, commercial.retrievedAt);
  const staleAge = commercial.freshness === "STALE" ? formatCommercialAge(lang, commercial.observedAt, generatedAt) : null;
  return {
    key: "commercial",
    label: text.commercial[lang],
    statusLabel: commercialFieldText.status[lang],
    statusValue: commercial.commercialLevel.trim(),
    amountLabel: commercialFieldText.amount[lang],
    amountValue,
    countLabel: commercialFieldText.count[lang],
    countValue,
    referenceLabel: commercialFieldText.reference[lang],
    referenceValue,
    retrievalLabel: commercialFieldText.retrieval[lang],
    retrievalValue,
    attribution: text.commercialDisclaimer[lang],
    privacyMessage: hasRange ? null : commercialFieldText.privacy[lang],
    staleAge,
    value: commercial.commercialLevel.trim(),
    note: [referenceValue, retrievalValue, text.commercialDisclaimer[lang], staleAge].filter(Boolean).join(" · "),
    state: commercial.freshness,
  };
}

const storeDynamicsText = {
  title: { ko: "점포 현황", en: "Store openings and closures", zh: "店铺开业与歇业", ja: "店舗の開業・廃業" },
  total: { ko: "총 점포", en: "Total stores", zh: "店铺总数", ja: "総店舗数" },
  ordinary: { ko: "일반 점포", en: "Non-franchise stores", zh: "非加盟店", ja: "非フランチャイズ店舗" },
  franchise: { ko: "프랜차이즈", en: "Franchise stores", zh: "加盟店", ja: "フランチャイズ店舗" },
  opening: { ko: "개업", en: "Opened", zh: "开业", ja: "開業" },
  closure: { ko: "폐업", en: "Closed", zh: "歇业", ja: "廃業" },
  changeTitle: { ko: "이번 분기 변화", en: "Change this quarter", zh: "本季度变化", ja: "今四半期の変化" },
  basis: { ko: "공식 과거자료", en: "official historical record", zh: "官方历史资料", ja: "公式過去資料" },
  retrieval: { ko: "KORETAIL 수집", en: "KORETAIL retrieval", zh: "KORETAIL采集", ja: "KORETAIL取得" },
  source: {
    ko: "서울시 상권분석서비스 OA-15577",
    en: "Seoul Commercial District Analysis Service OA-15577",
    zh: "首尔市商圈分析服务 OA-15577",
    ja: "ソウル市商圏分析サービス OA-15577",
  },
  limitation: {
    ko: "분기 기준 공식 과거 자료이며, 현재 영업 중인 점포의 실시간 수가 아닙니다.",
    en: "Official quarterly historical data, not a real-time count of stores currently operating.",
    zh: "官方季度历史资料，并非当前营业店铺的实时数量。",
    ja: "四半期基準の公式過去資料であり、現在営業中の店舗のリアルタイム件数ではありません。",
  },
} as const;

/**
 * Store Dynamics, shaped as a short piece of writing rather than a table.
 *
 * The previous layout put every field in its own bordered cell, which made a
 * spreadsheet out of five numbers and gave the incidental ones the same weight
 * as the headline. This shape says the same facts in reading order: what
 * period and area they describe, the one number that matters, what it is made
 * of, then what changed — with the provenance underneath where it belongs.
 */
export interface StoreDynamicsPresentation {
  title: string;
  timeState: string;
  /** Quarter and official trade area: the scope every number below inherits. */
  periodValue: string;
  areaValue: string;
  totalLabel: string;
  totalValue: string;
  /** 일반 / 프랜차이즈 — a breakdown of the total, never peers of it. */
  composition: string[];
  changeTitle: string;
  change: string[];
  /** Source, basis, limitation and retrieval time, in that reading order. */
  meta: string[];
}

function formatStoreDynamicsQuarter(lang: Lang, quarterCode: string): string | null {
  const match = /^(\d{4})([1-4])$/.exec(quarterCode);
  if (!match) return null;
  const [, year, quarter] = match;
  return lang === "ko" ? `${year}년 ${quarter}분기`
    : lang === "en" ? `Q${quarter} ${year}`
      : lang === "zh" ? `${year}年第${quarter}季度`
        : `${year}年第${quarter}四半期`;
}

function formatStoreDynamicsRetrieval(value: string): string | null {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} KST`;
}

/**
 * UI projection of one already validated compact OA-15577 area aggregate.
 *
 * Counts only. No area-wide 개업률/폐업률 is shown: the provider publishes
 * those rates per industry row and they cannot be reconstructed from the
 * row fields for every real row, so any area-level percentage KORETAIL
 * computed would be an invented figure dressed as an official one. A
 * deliberately omitted ambiguous percentage beats a fabricated one.
 */
export function buildStoreDynamicsPresentation(
  lang: Lang,
  row: LiveStoreDynamics | null | undefined,
): StoreDynamicsPresentation | null {
  if (!row || row.datasetId !== "OA-15577") return null;
  const counts = [row.totalStoreCount, row.ordinaryStoreCount, row.franchiseStoreCount, row.openingCount, row.closureCount];
  if (counts.some((value) => !Number.isSafeInteger(value) || value < 0)
    || row.totalStoreCount !== row.ordinaryStoreCount + row.franchiseStoreCount
    || row.totalStoreCount === 0
    || !row.tradeAreaName.trim() || !row.tradeAreaTypeName.trim()) return null;
  const referenceValue = formatStoreDynamicsQuarter(lang, row.quarterCode);
  const retrievalValue = formatStoreDynamicsRetrieval(row.retrievedAt);
  if (!referenceValue || !retrievalValue) return null;
  const locale = airportLocale(lang);
  const countValue = (value: number) => `${value.toLocaleString(locale)}${lang === "ko" ? "개" : lang === "en" ? " stores" : lang === "zh" ? "家" : "店"}`;
  const labelled = (label: string, value: number) => `${label} ${countValue(value)}`;
  return {
    title: storeDynamicsText.title[lang],
    timeState: signalStructureText.timeState.historical[lang],
    periodValue: referenceValue,
    areaValue: row.tradeAreaName.endsWith(row.tradeAreaTypeName)
      ? row.tradeAreaName
      : `${row.tradeAreaName} · ${row.tradeAreaTypeName}`,
    totalLabel: storeDynamicsText.total[lang],
    totalValue: countValue(row.totalStoreCount),
    composition: [
      labelled(storeDynamicsText.ordinary[lang], row.ordinaryStoreCount),
      labelled(storeDynamicsText.franchise[lang], row.franchiseStoreCount),
    ],
    changeTitle: storeDynamicsText.changeTitle[lang],
    change: [
      labelled(storeDynamicsText.opening[lang], row.openingCount),
      labelled(storeDynamicsText.closure[lang], row.closureCount),
    ],
    // Provenance in reading order: where it came from, what kind of record it
    // is, what it is not, and when KORETAIL fetched it. The limitation keeps
    // its full sentence — a disclaimer is the one line not to trim.
    meta: [
      storeDynamicsText.source[lang],
      `${referenceValue} ${storeDynamicsText.basis[lang]}`,
      storeDynamicsText.limitation[lang],
      `${storeDynamicsText.retrieval[lang]} ${retrievalValue}`,
    ],
  };
}

type SignalGroupId = "now" | "movement" | "today-next" | "past";

interface SignalRow {
  key: string;
  group: SignalGroupId;
  timeState: string;
  label: string;
  value: string;
  note: string;
  detail?: string;
  state?: "LIVE" | "STALE";
}

const signalStructureText = {
  groups: {
    now: {
      title: { ko: "지금", en: "Now", zh: "现在", ja: "現在" },
      state: { ko: "실시간/최근", en: "Live / recent", zh: "实时/近期", ja: "リアルタイム/直近" },
    },
    movement: {
      title: { ko: "이동과 외국인 흐름", en: "Movement and foreign flow", zh: "移动与外国人流动", ja: "移動と外国人動向" },
      state: { ko: "최근·지연 공개", en: "Recent / delayed release", zh: "近期/延迟发布", ja: "直近/遅延公開" },
    },
    "today-next": {
      title: { ko: "오늘과 다음", en: "Today and next", zh: "今天与接下来", ja: "今日と次" },
      state: { ko: "공식 일정·예상", en: "Official schedule / forecast", zh: "官方日程/预测", ja: "公式日程/予想" },
    },
    past: {
      title: { ko: "과거 상권 정보", en: "Past commercial-area information", zh: "历史商圈信息", ja: "過去の商圏情報" },
      state: { ko: "과거 자료", en: "Historical", zh: "历史资料", ja: "過去資料" },
    },
  },
  timeState: {
    recent: { ko: "실시간/최근", en: "Live / recent", zh: "实时/近期", ja: "リアルタイム/直近" },
    forecast: { ko: "공식 예상", en: "Official forecast", zh: "官方预测", ja: "公式予想" },
    delayed: { ko: "지연 공개", en: "Delayed release", zh: "延迟发布", ja: "遅延公開" },
    historical: { ko: "과거 자료", en: "Historical", zh: "历史资料", ja: "過去資料" },
    schedule: { ko: "공식 일정", en: "Official schedule", zh: "官方日程", ja: "公式日程" },
  },
  eventAll: {
    ko: (count: number) => `전체 ${count.toLocaleString("ko-KR")}건 보기`,
    en: (count: number) => `View all ${count.toLocaleString("en-GB")} events`,
    zh: (count: number) => `查看全部${count.toLocaleString("zh-CN")}项活动`,
    ja: (count: number) => `全${count.toLocaleString("ja-JP")}件を見る`,
  },
  eventRepresentativesOnly: {
    ko: "대표 행사만 보기", en: "Show representative events", zh: "仅显示代表活动", ja: "代表イベントのみ表示",
  },
} as const;

function SignalRowCard({ row, lang }: { row: SignalRow; lang: Lang }) {
  return <article className="signal-row" data-signal-key={row.key}>
    <div className="signal-row-label">
      <span className="signal-time-state">{row.timeState}</span>
      <h4>{row.label}</h4>
    </div>
    <div className="signal-row-content">
      <b className="signal-row-value">{row.value}</b>
      {row.detail && <p className="signal-row-detail">{row.detail}</p>}
      <small className="signal-row-source">{row.note}{row.state === "STALE" ? ` · ${text.stale[lang]}` : ""}</small>
    </div>
  </article>;
}

function CommercialSignalCard({ signal, lang }: { signal: CommercialSignalRow; lang: Lang }) {
  const metrics = [
    { label: signal.statusLabel, value: signal.statusValue },
    { label: signal.amountLabel, value: signal.amountValue ?? signal.privacyMessage },
    ...(signal.countValue ? [{ label: signal.countLabel, value: signal.countValue }] : []),
  ];
  return <article className="commercial-signal-card">
    <div className="commercial-signal-label">
      <span className="signal-time-state">{signalStructureText.timeState.recent[lang]}</span>
      <h4>{signal.label}</h4>
      {signal.state === "STALE" && <small className="signal-stale">{text.stale[lang]}{signal.staleAge ? ` · ${signal.staleAge}` : ""}</small>}
    </div>
    <div className="commercial-signal-content">
      <p className="commercial-basis">{text.commercialBasis[lang]}</p>
      <dl className="commercial-metrics">
        {metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
      </dl>
      <dl className="commercial-times">
        <div><dt>{signal.referenceLabel}</dt><dd>{signal.referenceValue}</dd></div>
        <div><dt>{signal.retrievalLabel}</dt><dd>{signal.retrievalValue}</dd></div>
      </dl>
      <p className="commercial-attribution">{text.sourceSeoul[lang]} · {signal.attribution}</p>
    </div>
  </article>;
}

function StoreDynamicsCard({ presentation }: { presentation: StoreDynamicsPresentation }) {
  return <article className="store-dynamics-card" data-signal-key="store-dynamics">
    <div className="store-dynamics-label">
      <span className="signal-time-state">{presentation.timeState}</span>
      <h4>{presentation.title}</h4>
    </div>
    <div className="store-dynamics-content">
      <p className="store-dynamics-scope">
        <span>{presentation.periodValue}</span>
        <span lang="ko">{presentation.areaValue}</span>
      </p>
      <p className="store-dynamics-total">
        <span>{presentation.totalLabel}</span>
        <strong>{presentation.totalValue}</strong>
      </p>
      <p className="store-dynamics-composition">
        {presentation.composition.map((part) => <span key={part}>{part}</span>)}
      </p>
      <p className="store-dynamics-change">
        <span className="store-dynamics-change-title">{presentation.changeTitle}</span>
        {presentation.change.map((part) => <span key={part}>{part}</span>)}
      </p>
      <p className="store-dynamics-meta">
        {presentation.meta.map((line) => <span key={line}>{line}</span>)}
      </p>
    </div>
  </article>;
}

function EventCard({ event, lang, serviceDate }: { event: LiveEventRow; lang: Lang; serviceDate: string }) {
  const status = event.status ?? eventStatusForDate(event, serviceDate);
  const preview = eventPreview(event.overview);
  const homepage = safeOfficialEventHomepage(event.homepage);
  const place = [formatEventPlace(event), event.addressDetail?.trim()].filter(Boolean).join(" · ");
  const distance = formatEventDistance(lang, event);
  return <li className="event-card">
    <article>
      <header>
        <span className={`event-status ${status.toLowerCase()}`}>{status === "RUNNING" ? text.eventRunning[lang] : text.eventUpcoming[lang]}</span>
        <h4>{[event.categoryName, event.title].filter(Boolean).join(" · ")}</h4>
      </header>
      <p className="event-meta">{[formatEventPeriod(event), place].filter(Boolean).join(" · ")}</p>
      {distance && <p className="event-distance">{text.eventDistanceBasis[lang]} {distance}</p>}
      {preview && <p className="event-preview">{preview}</p>}
      <div className="event-actions">
        {event.overview && <details>
          <summary>{text.eventDetails[lang]}</summary>
          <p className="event-overview">{event.overview}</p>
        </details>}
        {homepage && <a href={homepage} target="_blank" rel="noopener noreferrer">{text.eventOfficialPage[lang]} <span aria-hidden="true">↗</span></a>}
      </div>
    </article>
  </li>;
}

function EventSignalPanel({ lang, events, eventCount, serviceDate }: { lang: Lang; events: LiveEventRow[]; eventCount: number; serviceDate: string }) {
  const [showAll, setShowAll] = useState(false);
  const visibleEvents = showAll ? events : events.slice(0, 3);
  const listId = `event-list-${serviceDate}`;
  if (!events.length) return null;
  return <section className="event-signal-panel" aria-labelledby={`${listId}-title`}>
    <header className="event-panel-head">
      <div>
        <span className="signal-time-state">{signalStructureText.timeState.schedule[lang]}</span>
        <h4 id={`${listId}-title`}>{text.events[lang]}</h4>
      </div>
      <p><strong>{eventCount.toLocaleString(airportLocale(lang))}</strong>{lang === "en" ? " " : ""}{text.eventCount[lang]} · {text.eventRepresentative[lang]} {Math.min(3, events.length)}</p>
    </header>
    <ol className="event-card-list" id={listId}>
      {visibleEvents.map((event, index) => <EventCard
        key={event.contentId ?? `${event.title}-${event.eventStart}-${index}`}
        event={event}
        lang={lang}
        serviceDate={serviceDate}
      />)}
    </ol>
    {events.length > 3 && <button
      type="button"
      className="event-list-toggle"
      aria-expanded={showAll}
      aria-controls={listId}
      onClick={() => setShowAll((value) => !value)}
    >{showAll ? signalStructureText.eventRepresentativesOnly[lang] : signalStructureText.eventAll[lang](events.length)}</button>}
  </section>;
}

/**
 * One area's short current brief on its own, for screens that need the
 * "where · now · next peak" sentence without the full signal page (the store
 * screen). Same deterministic builder as the home rows and the area page.
 */
export function AreaCurrentBrief({ lang, area, date = null, linkHref, linkLabel }: {
  lang: Lang; area: AreaId; date?: string | null; linkHref?: string; linkLabel?: string;
}) {
  const summary = useLiveSummary(date);
  if (!summary) return null;
  const block = summary.areas[area];
  const brief = buildAreaCurrentBrief({
    realtime: block?.realtime ?? null,
    realtimeForecast: block?.realtimeForecast ?? [],
    weather: block?.weather ?? [],
    eventCount: block?.eventCount ?? block?.events?.length ?? 0,
    nextEventTitle: block?.events?.[0]?.title ?? null,
    nextEventCategory: block?.events?.[0]?.categoryName ?? null,
    nowIso: summary.generatedAt,
  });
  if (!brief.evidenceTypes.length) return null;
  const copy = localizeAreaBrief(brief, lang);
  return <section className="current-brief area-current-brief" aria-label={`${areaNames[area][lang]} ${areaBriefText.nowLabel[lang]}`}>
    <p className="eyebrow">{areaNames[area][lang]} · {areaBriefText.nowLabel[lang].toUpperCase()}</p>
    <strong>{copy.headline}</strong>
    {copy.lines.map((line) => <p key={line}>{line}</p>)}
    {copy.freshness && <small>{formatHumanFreshness(copy.freshness, summary.generatedAt, lang, "observed")}</small>}
    {linkHref && linkLabel && <a className="current-brief-link" href={linkHref}>{linkLabel} ↗</a>}
  </section>;
}

export default function LiveSignals({ lang, area, date = null }: { lang: Lang; area: AreaId; date?: string | null }) {
  const summary = useLiveSummary(date);
  if (!summary) return null;
  const block = summary.areas[area];
  const arrival = summary.airport.arrivalForecast ?? {
    todayExpectedPassengersTotal: null,
    todayExpectedPassengersByTerminal: {},
    nextExpectedTimeBand: null,
    peakExpectedTimeBand: null,
    passengerForecastRetrievedAt: null,
    forecastCoverage: { all: "UNAVAILABLE" as const, byTerminal: {} },
  };
  const hasArea = Boolean(block && (block.realtime || block.commercial || block.realtimeForecast?.length || block.subwayRidership || block.foreignPresence || block.foreignPurposeMobility || block.weather.length || block.events.length || block.sales || block.storeDynamics));
  const hasArrival = arrival.todayExpectedPassengersTotal !== null
    || arrival.nextExpectedTimeBand !== null
    || arrival.peakExpectedTimeBand !== null;
  if (!hasArea && !hasArrival) return null;

  // The detail screen reuses the same deterministic builder as the home rows,
  // so the same data can never produce two different sentences.
  const areaBrief = buildAreaCurrentBrief({
    realtime: block?.realtime ?? null,
    realtimeForecast: block?.realtimeForecast ?? [],
    weather: block?.weather ?? [],
    eventCount: block?.eventCount ?? block?.events?.length ?? 0,
    nextEventTitle: block?.events?.[0]?.title ?? null,
    nextEventCategory: block?.events?.[0]?.categoryName ?? null,
    nowIso: summary.generatedAt,
  });
  const areaBriefCopy = localizeAreaBrief(areaBrief, lang);

  const rows: SignalRow[] = [];

  if (block?.realtime) {
    const level = congestionLabels[block.realtime.congestionLevel]?.[lang] ?? block.realtime.congestionLabel;
    rows.push({
      key: "realtime",
      group: "now",
      timeState: signalStructureText.timeState.recent[lang],
      label: text.currentPopulation[lang],
      value: `${formatPeopleRange(lang, block.realtime.populationMin, block.realtime.populationMax)}${text.foreignPeople[lang]} · ${level}`,
      note: `${text.sourceSeoul[lang]} · ${formatHumanFreshness(block.realtime.observedAt, summary.generatedAt, lang, "observed")} · ${text.notCumulative[lang]}`,
      state: block.realtime.freshness,
    });
  }

  const commercialRow = buildCommercialSignalRow(lang, block?.commercial, summary.generatedAt);
  const storeDynamicsPresentation = buildStoreDynamicsPresentation(lang, block?.storeDynamics);

  if (block?.subwayRidership) {
    const subway = block.subwayRidership;
    // The station says its own name. "선정 역" was internal vocabulary that
    // told a visitor nothing about which station the number came from.
    const station = formatRepresentativeStations(subway.selectedStations);
    const withStation = (action: string, count: number) =>
      `${station ? `${station} ` : ""}${action} ${formatPeopleValue(lang, count)}${text.foreignPeople[lang]}`;
    rows.push({
      key: "subway_ridership",
      group: "movement",
      timeState: signalStructureText.timeState.recent[lang],
      label: text.subwayRidership[lang],
      value: withStation(text.subwayAlighting[lang], subway.alightingCount),
      detail: withStation(text.subwayBoarding[lang], subway.boardingCount),
      // The limitation stays: a daily station count is not unique people and
      // not visitors to the commercial area around it.
      note: `${subway.referenceDate} · ${text.subwayNote[lang]} · ${subway.datasetId}`,
    });
  }

  if (block?.foreignPresence) {
    const productId = block.foreignPresence.productVersion.split(":", 1)[0] || "OA-23018";
    rows.push({
      key: "foreign_presence",
      group: "movement",
      timeState: signalStructureText.timeState.delayed[lang],
      label: text.foreignPresence[lang],
      value: `${formatPeopleValue(lang, block.foreignPresence.value)} ${text.foreignPeople[lang]}`,
      note: `${text.foreignNote[lang]} · ${formatHumanFreshness(block.foreignPresence.referenceAt, summary.generatedAt, lang)} · ${productId}`,
    });
  }

  if (block?.foreignPurposeMobility) {
    const mobility = block.foreignPurposeMobility;
    const parts: string[] = [];
    if (mobility.shopping !== null) parts.push(`${text.shoppingPurpose[lang]} ${formatPeopleValue(lang, mobility.shopping)}`);
    if (mobility.tourism !== null) parts.push(`${text.tourismPurpose[lang]} ${formatPeopleValue(lang, mobility.tourism)}`);
    if (parts.length) rows.push({
      key: "foreign_purpose_mobility",
      group: "movement",
      timeState: signalStructureText.timeState.delayed[lang],
      label: text.foreignPurpose[lang],
      value: `${parts.join(" · ")} ${text.movementUnit[lang]}`,
      note: `${mobility.referenceDate} · ${text.foreignPurposeNote[lang]} · ${mobility.datasetId}`,
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

    // Richer categories from the same KMA response. Each is shown only where
    // the provider actually published it: a missing category is left out
    // rather than rendered as a zero, and an amount appears only when KMA gave
    // an exact one — "1.0mm 미만" is a bound, so it stays out of the reader's
    // numbers and remains in D1 as the raw official record.
    const firstOf = (pick: (row: LiveWeatherRow) => number | null | undefined) =>
      next12.map(pick).find((value) => value !== null && value !== undefined);
    const humidity = firstOf((row) => row.humidityPercent);
    const wind = firstOf((row) => row.windSpeedTenthMps);
    const rainfall = next12.find((row) => row.precipitationAmountKind === "EXACT"
      && row.precipitationAmountTenthMm !== null && row.precipitationAmountTenthMm !== undefined);
    const dayLow = firstOf((row) => row.dailyMinTemperatureTenthC);
    const dayHigh = firstOf((row) => row.dailyMaxTemperatureTenthC);

    if (humidity !== undefined) parts.push(`${text.humidity[lang]} ${humidity}%`);
    if (wind !== undefined) parts.push(`${text.wind[lang]} ${(wind / 10).toFixed(1)}m/s`);
    if (rainfall) parts.push(`${text.rainfall[lang]} ${(rainfall.precipitationAmountTenthMm! / 10).toFixed(1)}mm`);
    if (dayLow !== undefined) parts.push(`${text.dayLow[lang]} ${(dayLow / 10).toFixed(0)}°C`);
    if (dayHigh !== undefined) parts.push(`${text.dayHigh[lang]} ${(dayHigh / 10).toFixed(0)}°C`);

    // One practical line under the numbers. 맑음 · 24°C · 강수확률 is correct
    // and useless to someone deciding whether to take a jacket; this says what
    // to do about it, from the same official fields, by fixed rules.
    const guide = buildWeatherGuide({
      temperatureTenthC: firstTemp ?? null,
      dailyMinTemperatureTenthC: dayLow ?? null,
      dailyMaxTemperatureTenthC: dayHigh ?? null,
      precipitationProbability: next12.some((row) => row.precipitationProbability !== null) ? maxPop : null,
      precipitationTypeCode: next12.find((row) => row.precipitationTypeCode)?.precipitationTypeCode ?? null,
      humidityPercent: humidity ?? null,
      windSpeedTenthMps: wind ?? null,
    }, lang);

    rows.push({
      key: "weather",
      group: "now",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.weather[lang],
      value: parts.join(" · "),
      detail: guide ?? undefined,
      note: text.sourceKma[lang],
    });
  }

  if (block?.sales) {
    rows.push({
      key: "sales",
      group: "past",
      timeState: signalStructureText.timeState.historical[lang],
      label: text.sales[lang],
      value: `${formatKrwCompact(lang, block.sales.totalAmount)} · ${block.sales.quarterCode.slice(0, 4)}Q${block.sales.quarterCode.slice(4)}`,
      note: `${text.sourceSales[lang]} · ${text.salesNote[lang]}`,
    });
  }

  // A5 ARRIVAL is a forecast and only a leading reference for Seoul demand.
  // It is never presented as observed airport arrivals or as Seoul visitors.
  // Whole-day total and peak stay hidden unless all aggregate T1/T2 bands prove
  // COMPLETE coverage; the next band is independently safe only when both
  // terminals have the exact same active interval.
  const arrivalNote = [
    text.arrivalSource[lang],
    arrival.passengerForecastRetrievedAt
      ? formatHumanFreshness(arrival.passengerForecastRetrievedAt, summary.generatedAt, lang, "collected")
      : null,
  ].filter(Boolean).join(" · ");
  if (arrival.forecastCoverage.all === "COMPLETE" && arrival.todayExpectedPassengersTotal !== null) {
    const terminalBreakdown = Object.entries(arrival.todayExpectedPassengersByTerminal)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([terminal, value]) => `${terminal} ${Math.round(value).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]}`)
      .join(" · ");
    rows.push({
      key: "arrival_today",
      group: "today-next",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.arrivalToday[lang],
      value: `${Math.round(arrival.todayExpectedPassengersTotal).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]}`,
      note: [
        arrivalNote,
        terminalBreakdown ? `${text.arrivalTerminalBreakdown[lang]} · ${terminalBreakdown}` : null,
      ].filter(Boolean).join(" · "),
    });
  }

  if (arrival.nextExpectedTimeBand) {
    const band = arrival.nextExpectedTimeBand;
    rows.push({
      key: "arrival_next",
      group: "today-next",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.arrivalNext[lang],
      value: `${Math.round(band.expectedPassengers).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]} · ${formatKstBand(band.targetStartAt, band.targetEndAt).replace(" KST", "")}`,
      note: arrivalNote,
    });
  }

  if (arrival.forecastCoverage.all === "COMPLETE" && arrival.peakExpectedTimeBand) {
    const band = arrival.peakExpectedTimeBand;
    rows.push({
      key: "arrival_peak",
      group: "today-next",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.arrivalPeak[lang],
      value: `${formatKstBand(band.targetStartAt, band.targetEndAt).replace(" KST", "")} · ${Math.round(band.expectedPassengers).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]}`,
      note: arrivalNote,
    });
  }

  const events = block?.events ?? [];
  if (!rows.length && !commercialRow && !storeDynamicsPresentation && !events.length) return null;
  const groupIds: SignalGroupId[] = ["now", "movement", "today-next", "past"];

  return (
    <section className="live-signals" aria-labelledby="live-signals-title">
      {areaBrief.evidenceTypes.length > 0 && (
        <section className="current-brief area-current-brief" aria-label={`${areaNames[area][lang]} ${areaBriefText.nowLabel[lang]}`}>
          <p className="eyebrow">{areaNames[area][lang]} · {areaBriefText.nowLabel[lang].toUpperCase()}</p>
          <strong>{areaBriefCopy.headline}</strong>
          {areaBriefCopy.lines.map((line) => <p key={line}>{line}</p>)}
          {areaBriefCopy.freshness && <small>{formatHumanFreshness(areaBriefCopy.freshness, summary.generatedAt, lang, "observed")}</small>}
        </section>
      )}
      <div className="section-head">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2 id="live-signals-title">{text.title[lang]}</h2>
        </div>
      </div>
      <p className="section-intro">{text.intro[lang]}</p>
      <div className="signal-groups">
        {groupIds.map((groupId) => {
          const groupRows = rows.filter((row) => row.group === groupId);
          const hasSpecial = (groupId === "now" && commercialRow)
            || (groupId === "today-next" && events.length)
            || (groupId === "past" && storeDynamicsPresentation);
          if (!groupRows.length && !hasSpecial) return null;
          const groupCopy = signalStructureText.groups[groupId];
          const firstNow = groupId === "now" ? groupRows.filter((row) => row.key === "realtime") : [];
          const remainingNow = groupId === "now" ? groupRows.filter((row) => row.key !== "realtime") : [];
          return <section className={`signal-group signal-group-${groupId}`} key={groupId}>
            <header className="signal-group-head">
              <h3 className="signal-group-title">{groupCopy.title[lang]}</h3>
              <span>{groupCopy.state[lang]}</span>
            </header>
            <div className="signal-group-body">
              {groupId === "now" ? <>
                {firstNow.map((row) => <SignalRowCard key={row.key} row={row} lang={lang} />)}
                {commercialRow && <CommercialSignalCard signal={commercialRow} lang={lang} />}
                {remainingNow.map((row) => <SignalRowCard key={row.key} row={row} lang={lang} />)}
              </> : null}
              {groupId === "today-next" && events.length > 0 && <EventSignalPanel
                lang={lang}
                events={events}
                eventCount={block?.eventCount ?? events.length}
                serviceDate={summary.serviceDateKst}
              />}
              {groupId !== "now" && groupRows.map((row) => <SignalRowCard key={row.key} row={row} lang={lang} />)}
              {groupId === "past" && storeDynamicsPresentation && <StoreDynamicsCard presentation={storeDynamicsPresentation} />}
            </div>
          </section>;
        })}
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
