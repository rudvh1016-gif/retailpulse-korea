"use client";

import { useEffect, useState } from "react";
import type { Lang } from "./retailpulse-data";
import { friendlyCheckpointName, rankCurrentDepartureHallCheckpoints } from "../lib/airport-today-summary";
import {
  buildAirportCurrentBrief,
  buildAreaCurrentBrief,
  formatHumanFreshness,
  type AreaCurrentBrief,
  type AirportCurrentBrief,
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

interface LiveAreaBlock {
  realtime: LiveRealtime | null;
  realtimeForecast: LiveRealtimeForecast[];
  weather: LiveWeatherRow[];
  events: LiveEventRow[];
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

export interface LiveSummary {
  mode: string;
  generatedAt: string;
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

let cachedSummary: LiveSummary | null | undefined;
let pendingSummary: Promise<LiveSummary | null> | null = null;

async function loadSummary(): Promise<LiveSummary | null> {
  if (cachedSummary !== undefined) return cachedSummary;
  pendingSummary ??= fetch("/api/live/summary", { headers: { accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as LiveSummary;
      return payload.mode === "live-summary" ? payload : null;
    })
    .catch(() => null)
    .then((value) => {
      cachedSummary = value;
      return value;
    });
  return pendingSummary;
}

export function useLiveSummary(): LiveSummary | null {
  const [summary, setSummary] = useState<LiveSummary | null>(cachedSummary ?? null);
  useEffect(() => {
    let active = true;
    loadSummary().then((value) => { if (active && value) setSummary(value); });
    return () => { active = false; };
  }, []);
  return summary;
}

const text = {
  eyebrow: "OFFICIAL DATA SIGNALS · KST",
  title: { ko: "오늘 수요를 움직이는 신호", en: "Signals moving demand today", zh: "今日影响需求的信号", ja: "今日の需要を動かすシグナル" },
  intro: {
    ko: "공식 데이터로 확인된 참고 신호입니다. 현재 예시 수요지수 계산에는 포함되지 않으며, 신호는 매출이나 방문자 수가 아닙니다.",
    en: "Official reference signals only. They do not yet calculate the Demo Demand Index, and a signal is not sales or visitor counts.",
    zh: "仅显示官方参考信号，目前不参与演示需求指数计算；信号不等于销售额或访客数。",
    ja: "公式データによる参考シグナルです。現在のデモ需要指数の計算には含まれず、売上や来訪者数でもありません。",
  },
  realtime: { ko: "실시간 활동", en: "Live activity", zh: "实时活动", ja: "リアルタイム活動" },
  realtimePeople: { ko: "실시간 인구", en: "people now", zh: "实时人口", ja: "現在人口" },
  weather: { ko: "날씨", en: "Weather", zh: "天气", ja: "天気" },
  rainChance: { ko: "강수확률 최대", en: "max rain chance", zh: "最大降水概率", ja: "降水確率 最大" },
  events: { ko: "주변 행사", en: "Nearby events", zh: "周边活动", ja: "周辺イベント" },
  eventCount: { ko: "건 진행·예정", en: "running or upcoming", zh: "项进行或即将举行", ja: "件 開催・予定" },
  noEvents: { ko: "확인된 행사 없음", en: "No events found", zh: "暂无确认活动", ja: "確認済みイベントなし" },
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
  airportFlights: { ko: "오늘 출발 운항", en: "departures today", zh: "今日出发航班", ja: "本日の出発便" },
  airportScheduled: { ko: "정기운항 편성", en: "scheduled service", zh: "定期航班", ja: "定期運航" },
  flightUnit: { ko: "편", en: " flights", zh: "班", ja: "便" },
  basis: { ko: "기준", en: "as of", zh: "截至", ja: "基準" },
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

function airportLocale(lang: Lang): string {
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

const airportTodayText = {
  title: { ko: "오늘 한눈에", en: "Today at a glance", zh: "今日概览", ja: "今日の概要" },
  period: { ko: "기준기간", en: "Period", zh: "统计期间", ja: "対象期間" },
  // Means "the latest retrieval AMONG airport datasets" — never that every
  // metric below shares this freshness (see per-metric `collected` lines).
  retrieved: { ko: "공항 데이터 중 최근 수집", en: "Latest collected, among airport datasets", zh: "机场数据中最近一次采集", ja: "空港データの中で最終取得" },
  collected: { ko: "수집", en: "Collected", zh: "采集", ja: "取得" },
  expected: { ko: "오늘 공식 예상 출국객", en: "Official expected departures today", zh: "今日官方预计出境人数", ja: "本日の公式予想出国者数" },
  expectedNote: { ko: "인천공항 공식 예상 · 실제 출국객 집계 아님", en: "Official Incheon forecast · not an actual passenger count", zh: "仁川机场官方预测 · 非实际出境人数", ja: "仁川空港公式予測 · 実際の出国者集計ではありません" },
  flights: { ko: "오늘 출발 운항", en: "Departing flights today", zh: "今日出发航班", ja: "本日の出発便" },
  flightsNote: { ko: "실제 운항편 기준 · 승객 수 아님", en: "Physical flights · not passengers", zh: "实际航班口径 · 非旅客人数", ja: "実運航便基準 · 旅客数ではありません" },
  peak: { ko: "예상 피크", en: "Expected peak", zh: "预计高峰", ja: "予想ピーク" },
  peakNote: { ko: "공식 예상 출국객 시간대", en: "Official expected departure band", zh: "官方预计出境时段", ja: "公式予想出国時間帯" },
  gate: { ko: "운항 집중 게이트", en: "Flight concentration gate", zh: "航班集中登机口", ja: "運航集中ゲート" },
  gateNote: { ko: "오늘 출발편 수 기준 · 승객 혼잡 아님", en: "By departing flights · not passenger congestion", zh: "按今日出发航班 · 非旅客拥堵", ja: "本日の出発便数基準 · 旅客混雑ではありません" },
  unavailable: { ko: "확인 불가", en: "Unavailable", zh: "暂无法确认", ja: "確認不可" },
  // A5 daily total/peak honesty gate (Fix 2): shown only in place of a
  // number when the day's official aggregate bands do not prove full-day
  // coverage — never a fabricated zero or a silently partial sum.
  forecastPartial: { ko: "오늘 전체 시간대 확인 불가", en: "Full-day coverage unavailable", zh: "无法确认全天时段", ja: "本日全時間帯を確認できません" },
  forecastPartialNote: { ko: "공식 예상 데이터 일부 누락", en: "Some official forecast data missing", zh: "部分官方预计数据缺失", ja: "公式予測データの一部が欠落" },
  current: { ko: "현재 출국장", en: "Current departure halls", zh: "当前出境区", ja: "現在の出国場" },
  currentNote: { ko: "출국장 체크포인트 관측 · 탑승 게이트 아님", en: "Observed checkpoints · not boarding gates", zh: "出境检查点观测 · 非登机口", ja: "出国場チェックポイント観測 · 搭乗ゲートではありません" },
  waiting: { ko: "명 대기", en: " waiting", zh: "人等候", ja: "人待機" },
  timeline: { ko: "오늘 예상 출국객 시간대", en: "Today's expected passenger bands", zh: "今日预计出境时段", ja: "本日の予想出国者時間帯" },
  forecastOnly: { ko: "공식 예상 승객 · 실제 대기인원 아님", en: "Official expected passengers · not actual waiting", zh: "官方预计旅客 · 非实际等候人数", ja: "公式予想旅客 · 実際の待機人数ではありません" },
  timelinePartial: { ko: "일부 시간대만 확인되어 시간대 그래프를 표시하지 않습니다", en: "Only partial bands are confirmed, so the full-day chart is hidden", zh: "仅确认部分时段，故不显示全天图表", ja: "一部の時間帯のみ確認できたため、全日グラフは表示しません" },
  scope: {
    ko: { all: "전체 공항", T1: "제1터미널", T2: "제2터미널" },
    en: { all: "All terminals", T1: "Terminal 1", T2: "Terminal 2" },
    zh: { all: "全部航站楼", T1: "1号航站楼", T2: "2号航站楼" },
    ja: { all: "全ターミナル", T1: "第1ターミナル", T2: "第2ターミナル" },
  },
  gatesTitle: { ko: "오늘 운항 집중 게이트", en: "Today's busiest departure gates", zh: "今日航班集中登机口", ja: "本日の運航集中ゲート" },
  gatesNote: { ko: "오늘 출발편이 많이 배정된 게이트입니다. 출국장 대기시간과는 다른 정보입니다.", en: "Gates with the most tracked departures today. This is separate from checkpoint waiting time.", zh: "今日出发航班分配较多的登机口，与出境区等候时间不同。", ja: "本日の出発便が多く割り当てられたゲートです。出国場の待ち時間とは別の情報です。" },
  noGateList: { ko: "게이트 정보 범위가 충분하지 않아 순위를 표시하지 않습니다.", en: "Gate coverage is insufficient to show a reliable ranking.", zh: "登机口数据覆盖不足，暂不显示排名。", ja: "ゲート情報の範囲が十分でないため、順位を表示しません。" },
  longest: { ko: "현재 가장 긴 대기", en: "Longest current wait", zh: "当前最长等候", ja: "現在最も長い待ち" },
  observed: { ko: "관측", en: "Observed", zh: "观测", ja: "観測" },
  forecastTitle: { ko: "공식 예상 출국객 흐름", en: "Official expected passenger flow", zh: "官方预计出境客流", ja: "公式予想出国者の流れ" },
  partialBody: { ko: "공식 예상 데이터의 일부 시간대가 누락되어 하루 전체 합계와 피크는 표시하지 않습니다.", en: "Some official time bands are missing, so the full-day total and peak are not shown.", zh: "部分官方时段数据缺失，因此不显示全天合计与高峰。", ja: "公式予測の一部時間帯が欠けているため、1日全体の合計とピークは表示しません。" },
  unavailableBody: { ko: "현재 확인된 공식 예상 시간대가 없습니다. 실제 출발 운항과 현재 출국장 정보는 계속 확인할 수 있습니다.", en: "No official forecast bands are currently available. Physical departures and current checkpoints remain available.", zh: "目前没有可确认的官方预计时段，仍可查看实际出发航班和当前出境区信息。", ja: "現在確認できる公式予測時間帯はありません。実出発便と現在の出国場情報は引き続き確認できます。" },
  guidanceTitle: { ko: "이 정보는 이렇게 보세요", en: "How to use this information", zh: "如何查看这些信息", ja: "この情報の見方" },
  guidanceForecast: { ko: "예상 승객 데이터가 일부 누락되면 현재 출국장 관측을 우선 참고하세요.", en: "When forecast bands are incomplete, refer first to current checkpoint observations.", zh: "预计旅客数据不完整时，请优先参考当前出境区观测。", ja: "予想旅客データが一部欠ける場合は、現在の出国場観測を先に確認してください。" },
  guidanceGate: { ko: "운항 집중 게이트는 출발편 배정 현황이며, 출국장 대기시간과는 별개의 지표입니다.", en: "Busy gates describe flight assignment, not departure-checkpoint waiting time.", zh: "航班集中登机口反映航班分配，与出境区等候时间是不同指标。", ja: "運航集中ゲートは出発便の割り当て状況で、出国場の待ち時間とは別の指標です。" },
} as const;

const areaBriefText = {
  title: { ko: "서울 오늘 브리핑", en: "Seoul today", zh: "首尔今日简报", ja: "ソウル今日のブリーフ" },
  unavailableNow: { ko: "현재 공식 활동 상태를 확인할 수 없습니다", en: "Current official activity is unavailable", zh: "当前官方活动状态暂不可用", ja: "現在の公式活動状況を確認できません" },
  noForecast: { ko: "오늘 남은 시간 혼잡 예측은 현재 확인할 수 없습니다", en: "No official crowd forecast is available for the rest of today", zh: "目前无法确认今天剩余时段的拥挤预测", ja: "本日これからの混雑予測は現在確認できません" },
  stale: { ko: "최근 관측 지연", en: "Latest observation delayed", zh: "最新观测延迟", ja: "最新観測に遅れ" },
  nowLabel: { ko: "지금", en: "now", zh: "当前", ja: "現在" },
  event: { ko: (count: number) => `오늘 인근 행사 ${count}건 예정`, en: (count: number) => `${count} nearby event${count === 1 ? "" : "s"} today`, zh: (count: number) => `今日附近有${count}项活动`, ja: (count: number) => `本日周辺イベント${count}件` },
} as const;

const areaNames: Record<AreaId, Record<Lang, string>> = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
};

function formatForecastHour(value: string): string {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 3_600_000);
  const clock = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${clock(start)}–${clock(end)}`;
}

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
    lines.push(lang === "ko" ? `서울시 공식 예측상 ${band}가 오늘 남은 시간 중 가장 붐빌 전망`
      : lang === "en" ? `Seoul's official forecast shows ${band} as the busiest remaining hour today`
      : lang === "zh" ? `首尔市官方预测显示，${band}是今天剩余时段中最拥挤的时段`
      : `ソウル市公式予測では、${band}が本日これから最も混雑する見込み`);
  } else lines.push(areaBriefText.noForecast[lang]);
  if (brief.weatherAdvice) {
    const advice = brief.weatherAdvice;
    if (advice.kind === "UMBRELLA") lines.push(lang === "ko" ? `비 가능성 ${advice.probability}% · 우산을 챙겨두세요` : lang === "en" ? `${advice.probability}% chance of rain · bring an umbrella` : lang === "zh" ? `降雨概率${advice.probability}% · 请带伞` : `降水確率${advice.probability}% · 傘を用意してください`);
    else if (advice.kind === "CHECK_RAIN") lines.push(lang === "ko" ? `비 가능성 ${advice.probability}% · 이동 전 날씨를 확인하세요` : lang === "en" ? `${advice.probability}% chance of rain · check before heading out` : lang === "zh" ? `降雨概率${advice.probability}% · 出发前请确认天气` : `降水確率${advice.probability}% · 移動前に天気を確認してください`);
    else if (advice.kind === "HOT") lines.push(lang === "ko" ? `최고 ${advice.temperatureC.toFixed(0)}°C · 가벼운 복장과 물을 준비하세요` : lang === "en" ? `Up to ${advice.temperatureC.toFixed(0)}°C · dress lightly and carry water` : lang === "zh" ? `最高${advice.temperatureC.toFixed(0)}°C · 建议轻装并备水` : `最高${advice.temperatureC.toFixed(0)}°C · 軽い服装と水を用意してください`);
    else lines.push(lang === "ko" ? `최저 ${advice.temperatureC.toFixed(0)}°C · 겉옷을 챙기는 편이 좋습니다` : lang === "en" ? `Down to ${advice.temperatureC.toFixed(0)}°C · bring an outer layer` : lang === "zh" ? `最低${advice.temperatureC.toFixed(0)}°C · 建议携带外套` : `最低${advice.temperatureC.toFixed(0)}°C · 上着を用意してください`);
  } else if (brief.eventCount > 0) lines.push(areaBriefText.event[lang](brief.eventCount));
  return { headline, lines: lines.slice(0, 2), freshness };
}

function localizeAirportBrief(brief: AirportCurrentBrief, lang: Lang): string[] {
  const locale = airportLocale(lang);
  const lines: string[] = [];
  const scopeName = airportTodayText.scope[lang][brief.scope];
  if (brief.checkpoint) {
    const checkpoint = friendlyCheckpointName(brief.checkpoint.zone, lang);
    if (brief.checkpointBasis === "WAIT_TIME") {
      const raw = brief.checkpoint.waitTimeRaw ?? (brief.checkpoint.waitTimeMinutes === null ? null : String(brief.checkpoint.waitTimeMinutes));
      const unit = { ko: "분", en: " min", zh: "分钟", ja: "分" }[lang];
      const wait = raw ? (/분|min|分钟|分/i.test(raw) ? raw : `${raw}${unit}`) : "";
      lines.push(lang === "ko" ? `현재 ${scopeName}에서는 ${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint}의 대기가 ${wait}으로 가장 깁니다`
        : lang === "en" ? `${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint} currently has the longest ${scopeName} wait at ${wait}`
        : lang === "zh" ? `当前${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint}以${wait}成为${scopeName}最长等候`
        : `現在、${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint}が${wait}で${scopeName}最長の待ち時間`);
    } else if (brief.checkpoint.waitingCount !== null) {
      lines.push(lang === "ko" ? `현재 ${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint}에 ${brief.checkpoint.waitingCount.toLocaleString(locale)}명이 대기 중`
        : lang === "en" ? `${brief.checkpoint.waitingCount.toLocaleString(locale)} people are currently waiting at ${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint}`
        : lang === "zh" ? `当前${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint}有${brief.checkpoint.waitingCount.toLocaleString(locale)}人等候`
        : `現在、${brief.scope === "all" ? `${brief.checkpoint.terminal} ` : ""}${checkpoint}で${brief.checkpoint.waitingCount.toLocaleString(locale)}人が待機中`);
    }
  }
  if (brief.forecastCoverage === "COMPLETE" && brief.peak) {
    const band = formatKstBand(brief.peak.targetStartAt, brief.peak.targetEndAt).replace(" KST", "");
    lines.push(lang === "ko" ? `공식 예상 승객 기준 ${band}가 오늘 가장 붐빌 전망` : lang === "en" ? `Official expected passengers peak at ${band} today` : lang === "zh" ? `按官方预计旅客数据，今日${band}最繁忙` : `公式予想旅客では、本日${band}がピークの見込み`);
  } else if (brief.forecastCoverage === "PARTIAL") {
    lines.push(lang === "ko" ? "공식 예상 승객 데이터가 일부 누락되어 오늘 피크는 판단하지 않습니다" : lang === "en" ? "Some official passenger forecast bands are missing, so no daily peak is inferred" : lang === "zh" ? "部分官方预计旅客时段缺失，因此不判断今日高峰" : "公式予想旅客データの一部が欠けているため、本日のピークは判断しません");
  } else {
    lines.push(lang === "ko" ? "오늘 공식 예상 승객 데이터는 아직 확인되지 않습니다" : lang === "en" ? "Today's official passenger forecast is not yet available" : lang === "zh" ? "今日官方预计旅客数据尚未确认" : "本日の公式予想旅客データはまだ確認できません");
  }
  if (brief.departures !== null || brief.topGate) {
    const departure = brief.departures === null ? null : (lang === "ko" ? `오늘 ${brief.departures.toLocaleString(locale)}편 출발` : lang === "en" ? `${brief.departures.toLocaleString(locale)} departing flights today` : lang === "zh" ? `今日${brief.departures.toLocaleString(locale)}班出发` : `本日${brief.departures.toLocaleString(locale)}便出発`);
    const gate = brief.topGate ? (lang === "ko" ? `Gate ${brief.topGate.gate}에 ${brief.topGate.flights.toLocaleString(locale)}편이 가장 많이 배정` : lang === "en" ? `Gate ${brief.topGate.gate} has the most assignments at ${brief.topGate.flights.toLocaleString(locale)} flights` : lang === "zh" ? `Gate ${brief.topGate.gate}分配最多，为${brief.topGate.flights.toLocaleString(locale)}班` : `Gate ${brief.topGate.gate}に最多の${brief.topGate.flights.toLocaleString(locale)}便を割り当て`) : null;
    lines.push([departure, gate].filter(Boolean).join(" · "));
  }
  return lines.slice(0, 3);
}

export function AirportTodaySummary({ lang, terminal = "all" }: { lang: Lang; terminal?: "all" | "T1" | "T2" }) {
  const summary = useLiveSummary();
  const airport = summary?.airport;
  if (!airport) return <div className="airport-unavailable" role="status"><strong>{airportTodayText.unavailable[lang]}</strong></div>;
  const numberLocale = airportLocale(lang);
  const peopleUnit = { ko: "명", en: " people", zh: "人", ja: "人" }[lang];
  const flightUnit = { ko: "편", en: " flights", zh: "班", ja: "便" }[lang];

  // Fix 1: every metric below reads from the SELECTED terminal's own field —
  // never the all-airport total — so choosing T1 cannot still show T1+T2.
  // Per-terminal fields are read defensively (optional chaining) so an older
  // or degraded payload that predates these fields never crashes the page.
  const isAll = terminal === "all";
  const expectedTotal = isAll ? airport.todayExpectedPassengersTotal : airport.todayExpectedPassengersByTerminal?.[terminal] ?? null;
  const flightsCount = isAll ? airport.departuresTrackedToday : airport.departuresTrackedTodayByTerminal?.[terminal] ?? null;
  const peak = isAll ? airport.peakExpectedTimeBand : airport.peakExpectedTimeBandByTerminal?.[terminal] ?? null;
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
  const airportBriefLines = localizeAirportBrief(airportBrief, lang);
  const distinctFreshness = [...new Set([passengerCollected, flightsCollected, gateCollected].filter((value): value is string => Boolean(value)))];
  return <section className="airport-today" aria-labelledby="airport-today-title">
    <section className="current-brief airport-current-brief" aria-label={`${scopeLabel} current brief`}><p className="eyebrow">{scopeLabel} · NOW</p>{airportBriefLines.map((line, index) => index === 0 ? <strong key={line}>{line}</strong> : <p key={line}>{line}</p>)}</section>
    <div className="airport-period"><p><span>{scopeLabel}</span><strong>{airport.serviceDateKst ? formatKstServicePeriod(airport.serviceDateKst, lang) : airportTodayText.unavailable[lang]}</strong></p><p><span>{airportTodayText.retrieved[lang]}</span><strong>{airport.latestRetrievedAt ? formatHumanFreshness(airport.latestRetrievedAt, nowIso, lang) : airportTodayText.unavailable[lang]}</strong></p></div>
    <div className="section-head"><div><p className="eyebrow">OFFICIAL TODAY · {scopeLabel} · KST</p><h2 id="airport-today-title">{airportTodayText.title[lang]}</h2></div><span className="airport-scope-label">{scopeLabel}</span></div>
    <div className="airport-today-grid">
      <article><span>{airportTodayText.expected[lang]}</span><strong>{expectedTotal === null ? (isForecastPartial ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang]) : `${Math.round(expectedTotal).toLocaleString(numberLocale)}${peopleUnit}`}</strong><small>{isForecastPartial ? airportTodayText.forecastPartialNote[lang] : airportTodayText.expectedNote[lang]}</small></article>
      <article><span>{airportTodayText.flights[lang]}</span><strong>{flightsCount === null ? airportTodayText.unavailable[lang] : `${flightsCount.toLocaleString(numberLocale)}${flightUnit}`}</strong><small>{airportTodayText.flightsNote[lang]}</small></article>
      <article><span>{airportTodayText.peak[lang]}</span><strong>{peak ? formatKstBand(peak.targetStartAt, peak.targetEndAt) : airportTodayText.unavailable[lang]}</strong><small>{peak ? `${airportTodayText.peakNote[lang]} · ${Math.round(peak.expectedPassengers).toLocaleString(numberLocale)}${peopleUnit}` : (isForecastPartial ? airportTodayText.forecastPartialNote[lang] : airportTodayText.peakNote[lang])}</small></article>
      <article><span>{airportTodayText.gate[lang]}</span><strong>{topGate ? `${topGate.terminal ? `${topGate.terminal} · ` : ""}Gate ${topGate.gate} · ${topGate.flights.toLocaleString(numberLocale)}${flightUnit}` : airportTodayText.unavailable[lang]}</strong><small>{airportTodayText.gateNote[lang]}</small></article>
    </div>
    {distinctFreshness.length > 0 && <p className="airport-section-freshness">{distinctFreshness.join(" · ")}</p>}
    <section className="airport-detail-section airport-checkpoints" aria-labelledby="airport-checkpoints-title">
      <div className="airport-detail-head"><div><p className="eyebrow">CURRENT OBSERVATION · {scopeLabel}</p><h3 id="airport-checkpoints-title">{airportTodayText.current[lang]}</h3></div><p>{airportTodayText.currentNote[lang]}</p></div>
      {checkpointTerminals.length ? <div className="airport-checkpoint-groups">{checkpointTerminals.map((terminalId) => {
        const busiest = airport.currentBusiestDepartureHallByTerminal?.[terminalId];
        return <div className="airport-checkpoint-terminal" key={terminalId}><h4><span>{terminalId}</span>{airportTodayText.scope[lang][terminalId as "T1" | "T2"] ?? terminalId}</h4><div>{rankedCheckpoints[terminalId].map((row, index) => {
          const isBusiest = busiest?.zone === row.zone;
          return <article className={isBusiest ? "is-busiest" : ""} key={`${terminalId}-${row.zone}`}><span className="checkpoint-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{friendlyCheckpointName(row.zone, lang)}</strong>{isBusiest && <small>{airportTodayText.longest[lang]}</small>}</div><b>{waitText(row)}</b><p>{row.waitingCount === null ? airportTodayText.unavailable[lang] : `${row.waitingCount.toLocaleString(numberLocale)}${airportTodayText.waiting[lang]}`}<small>{formatHumanFreshness(row.observedAt, nowIso, lang)}{row.freshness === "STALE" ? " · STALE" : ""}</small></p></article>;
        })}</div></div>;
      })}</div> : <p className="airport-empty-line">{airportTodayText.unavailable[lang]}</p>}
    </section>
    <section className="airport-detail-section airport-gates" aria-labelledby="airport-gates-title">
      <div className="airport-detail-head"><div><p className="eyebrow">PHYSICAL DEPARTURES · {scopeLabel}</p><h3 id="airport-gates-title">{airportTodayText.gatesTitle[lang]}</h3></div><p>{airportTodayText.gatesNote[lang]}</p></div>
      {gateList.length ? <ol>{gateList.map((row, index) => <li className="airport-gate-row" key={`${row.terminal ?? "unknown"}-${row.gate}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{isAll && row.terminal ? `${row.terminal} · ` : ""}Gate {row.gate}</strong><b>{row.flights.toLocaleString(numberLocale)}{flightUnit}</b></li>)}</ol> : <p className="airport-empty-line">{airportTodayText.noGateList[lang]}</p>}
    </section>
    <section className="airport-detail-section airport-forecast" aria-labelledby="airport-forecast-title">
      <div className="airport-detail-head"><div><p className="eyebrow">OFFICIAL FORECAST · {scopeLabel}</p><h3 id="airport-forecast-title">{airportTodayText.forecastTitle[lang]}</h3></div><p>{airportTodayText.forecastOnly[lang]}</p></div>
      {forecastStatus === "COMPLETE" && timeline.length > 0 ? <div className="airport-timeline" role="img" aria-label={`${airportTodayText.timeline[lang]}. ${airportTodayText.forecastOnly[lang]}`}><div><strong>{peak ? formatKstBand(peak.targetStartAt, peak.targetEndAt) : ""}</strong><p>{airportTodayText.peak[lang]}</p></div><div className="airport-timeline-bars">{timeline.map((row) => <p key={row.targetStartAt} className={peak?.targetStartAt === row.targetStartAt ? "peak" : ""}><i style={{ height: `${Math.max(6, row.expectedPassengers / maxBand * 100)}%` }} /><span>{formatKstBand(row.targetStartAt, row.targetEndAt).replace(" KST", "")}</span><b>{Math.round(row.expectedPassengers).toLocaleString(numberLocale)}</b></p>)}</div></div> : <div className={`airport-forecast-state ${isForecastPartial ? "partial" : "unavailable"}`}><strong>{isForecastPartial ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang]}</strong><p>{isForecastPartial ? airportTodayText.partialBody[lang] : airportTodayText.unavailableBody[lang]}</p>{passengerCollected && <small>{passengerCollected}</small>}</div>}
    </section>
    <aside className="airport-guidance" aria-labelledby="airport-guidance-title"><h3 id="airport-guidance-title">{airportTodayText.guidanceTitle[lang]}</h3><p>{isForecastPartial ? airportTodayText.guidanceForecast[lang] : airportTodayText.guidanceGate[lang]}</p>{isForecastPartial && <p>{airportTodayText.guidanceGate[lang]}</p>}</aside>
  </section>;
}

export function HomeTodayBrief({ lang, selected, onSelect }: { lang: Lang; selected: AreaId; onSelect: (area: AreaId) => void }) {
  const summary = useLiveSummary();
  if (!summary) return null;
  const areas = (["myeongdong", "hongdae", "seongsu"] as AreaId[]).map((area) => {
    const block = summary.areas[area];
    const brief = buildAreaCurrentBrief({
      realtime: block?.realtime ?? null,
      realtimeForecast: block?.realtimeForecast ?? [],
      weather: block?.weather ?? [],
      eventCount: block?.events?.length ?? 0,
      nowIso: summary.generatedAt,
    });
    return { area, brief, copy: localizeAreaBrief(brief, lang) };
  });
  if (!areas.some(({ brief }) => brief.evidenceTypes.length > 0)) return null;
  return <section className="home-area-briefs" aria-labelledby="home-area-briefs-title">
    <div className="home-area-briefs-head"><p className="eyebrow">OFFICIAL NOW · SEOUL</p><h2 id="home-area-briefs-title">{areaBriefText.title[lang]}</h2><p>{lang === "ko" ? "현재 상태와 오늘 남은 시간의 공식 예측을 함께 봅니다." : lang === "en" ? "Current conditions and official forecasts for the rest of today." : lang === "zh" ? "一起查看当前状态和今天剩余时段的官方预测。" : "現在の状況と本日これからの公式予測をまとめて確認します。"}</p></div>
    <div className="home-area-brief-rows">{areas.map(({ area, copy }) => <button key={area} className={selected === area ? "selected" : ""} onClick={() => onSelect(area)} aria-current={selected === area ? "true" : undefined}>
      <span>{areaNames[area][lang]}</span><div><strong>{copy.headline}</strong>{copy.lines.map((line) => <p key={line}>{line}</p>)}</div>{copy.freshness && <small>{formatHumanFreshness(copy.freshness, summary.generatedAt, lang)}</small>}
    </button>)}</div>
  </section>;
}

function formatPeopleRange(lang: Lang, min: number, max: number): string {
  const locale = lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
  return `${min.toLocaleString(locale)}–${max.toLocaleString(locale)}`;
}

function formatPeopleValue(lang: Lang, value: number): string {
  const locale = lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
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
  return `${Math.round(eok).toLocaleString(lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "ko-KR")}${unit}`;
}

export default function LiveSignals({ lang, area }: { lang: Lang; area: AreaId }) {
  const summary = useLiveSummary();
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
  const scheduled = summary.airport.scheduled ?? [];
  const passengerForecast = summary.airport.passengerForecast ?? [];
  const hasArea = Boolean(block && (block.realtime || block.realtimeForecast?.length || block.foreignPresence || block.weather.length || block.events.length || block.sales));
  if (!hasArea && !congestion.length && !trackedFlights && !scheduled.length && !passengerForecast.length) return null;

  // 지역 상세 화면의 첫 화면 브리핑. 홈의 3지역 행과 같은 결정론적 builder를
  // 재사용하므로, 같은 데이터에서 같은 문장이 나온다(해석이 화면마다 갈리지 않는다).
  const areaBrief = buildAreaCurrentBrief({
    realtime: block?.realtime ?? null,
    realtimeForecast: block?.realtimeForecast ?? [],
    weather: block?.weather ?? [],
    eventCount: block?.events?.length ?? 0,
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
    rows.push({
      key: "weather",
      label: text.weather[lang],
      value: parts.join(" · "),
      note: text.sourceKma[lang],
    });
  }

  if (block?.events.length) {
    rows.push({
      key: "events",
      label: text.events[lang],
      value: `${block.events.length}${lang === "en" ? " " : ""}${text.eventCount[lang]} · ${block.events[0].title}`,
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
    const rows_ = congestionByTerminal.get(terminal)!;
    const terminalWaiting = rows_.reduce((sum, row) => sum + (row.waitingCount ?? 0), 0);
    const latest = rows_.reduce((newest, row) => (row.observedAt > newest.observedAt ? row : newest), rows_[0]);
    rows.push({
      key: `airport_${terminal}`,
      label: text.airportTerminal[lang](terminal),
      value: `${terminalWaiting.toLocaleString(lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US")} ${text.airportPeople[lang]}`,
      note: `${text.sourceAirport[lang]} · ${formatHumanFreshness(latest.observedAt, summary.generatedAt, lang)}`,
      state: latest.freshness,
    });
  }

  // A5 — official FORECAST/EXPECTED departure passengers, one row per
  // terminal actually returned. Semantically separate from the A4
  // CURRENT/OBSERVED rows above: never merged into the same number, and the
  // wording/notice always makes clear this is an official forecast, not an
  // actual waiting count.
  for (const forecast of passengerForecast) {
    rows.push({
      key: `forecast_${forecast.terminal}`,
      label: text.passengerForecastLabel[lang](forecast.terminal),
      value: `${Math.round(forecast.expectedPassengers).toLocaleString(lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US")}${text.passengerForecastUnit[lang]}`,
      note: `${text.passengerForecastSource[lang]} · ${text.passengerForecastNotice[lang]} · ${formatKstBand(forecast.targetStartAt, forecast.targetEndAt).replace(" KST", "")}`,
    });
  }

  if (trackedFlights) {
    rows.push({
      key: "airport_flights",
      label: text.airportFlights[lang],
      value: `${trackedFlights.toLocaleString()}${text.flightUnit[lang]}`,
      note: localTextAirport(lang, "실제 운항편 수 · 승객 수 아님", "Actual flights · not passenger count", "实际航班数 · 非旅客人数", "実運航便数 · 旅客数ではありません"),
    });
  }

  if (scheduled.length) {
    const total = scheduled.reduce((sum, row) => sum + Number(row.flights), 0);
    const terminals = scheduled.map((row) => row.terminal).filter(Boolean).join(" · ");
    rows.push({
      key: "airport_scheduled",
      label: text.airportScheduled[lang],
      value: `${terminals} · ${total.toLocaleString()}${text.flightUnit[lang]}`,
      note: localTextAirport(lang, "미래 정기운항 · 실제 당일 운항과 별도", "Future schedule · separate from actual operations", "未来定期航班 · 与当日实际航班分开", "将来の定期運航 · 当日の実運航とは別"),
    });
  }

  if (!rows.length) return null;

  return (
    <section className="live-signals" aria-labelledby="live-signals-title">
      {areaBrief.evidenceTypes.length > 0 && (
        <section className="current-brief area-current-brief" aria-label={`${areaNames[area][lang]} ${areaBriefText.nowLabel[lang]}`}>
          <p className="eyebrow">{areaNames[area][lang]} · NOW</p>
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
        <span className="official-label">OFFICIAL DATA</span>
      </div>
      <p className="section-intro">{text.intro[lang]}</p>
      <div className="live-signal-rows">
        {rows.map((row, index) => (
          <p key={row.key}>
            <span>0{index + 1}</span>
            <strong>{row.label}</strong>
            <b>{row.value}</b>
            <small>{row.note}{row.state === "STALE" ? ` · ${text.stale[lang]}` : ""}</small>
          </p>
        ))}
      </div>
    </section>
  );
}

function localTextAirport(lang: Lang, ko: string, en: string, zh: string, ja: string): string {
  return { ko, en, zh, ja }[lang];
}
