/**
 * The 10–30 second briefing a Myeongdong tourism-information worker reads
 * before the first visitor of the shift.
 *
 * Not a tourist-facing screen. The reader is a 관광통역안내사 or an
 * information-desk staffer who is about to answer questions, and the only
 * useful question this can answer is "what should I check before I start".
 *
 * Every line is a deterministic reading of data KORETAIL already collects —
 * no runtime LLM, no scoring, no randomness — and every line carries its own
 * basis, because each of these signals is one step removed from the thing a
 * guide actually cares about:
 *
 *   living population   is not a count of tourists
 *   subway boardings    are not unique visitors
 *   short-stay foreign
 *   living population   is not a count of tourists
 *   airport arrivals    are not Myeongdong arrivals
 *
 * A line whose evidence is missing is omitted. Nothing is filled in to reach
 * a line count, and no line recommends an action the data cannot support.
 */
export type DeskLang = "ko" | "en" | "zh" | "ja";

export interface TourismDeskInput {
  crowding: { label: string; populationMin: number; populationMax: number; observedAt: string } | null;
  /** Already-built deterministic weather sentence, or null when KMA published too little. */
  weatherGuide: string | null;
  todayEvent: { title: string; categoryName: string | null; status: "RUNNING" | "UPCOMING" } | null;
  eventCount: number;
  subway: { boardingCount: number; alightingCount: number; referenceDate: string; selectedStations: string } | null;
  foreignPresence: { value: number; referenceAt: string } | null;
  /** A5 arrival forecast — the airport's own expectation, never Myeongdong's. */
  airportArrival: { expectedPassengers: number; targetStartAt: string; targetEndAt: string } | null;
}

export interface TourismDeskLine {
  key: "crowding" | "weather" | "event" | "subway" | "foreign" | "airport";
  /** The fact. */
  text: string;
  /** What that fact is, and what it is not. Never optional. */
  basis: string;
}

const LOCALE: Record<DeskLang, string> = { ko: "ko-KR", en: "en-GB", zh: "zh-CN", ja: "ja-JP" };

function count(value: number, lang: DeskLang): string {
  return Math.round(value).toLocaleString(LOCALE[lang]);
}

function clock(iso: string, lang: DeskLang): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(parsed);
}

function day(value: string, lang: DeskLang): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const [, year, month, date] = match;
  const m = Number(month);
  const d = Number(date);
  return lang === "en" ? `${year}-${month}-${date}`
    : lang === "ko" ? `${m}월 ${d}일`
    : lang === "zh" ? `${m}月${d}日`
    : `${m}月${d}日`;
}

/**
 * The basis sentences. Each names the signal AND the thing it is not, in the
 * same breath, so a line cannot be quoted to a visitor as something stronger
 * than it is.
 */
const BASIS = {
  crowding: {
    ko: "서울시 실시간 생활인구 관측 · 관광객 수가 아닙니다",
    en: "Seoul live living-population observation · not a count of tourists",
    zh: "首尔市实时生活人口观测 · 并非游客人数",
    ja: "ソウル市のリアルタイム生活人口観測 · 観光客数ではありません",
  },
  weather: {
    ko: "기상청 단기예보 기준",
    en: "Based on the KMA short-range forecast",
    zh: "以韩国气象厅短期预报为准",
    ja: "気象庁の短期予報基準",
  },
  event: {
    ko: "한국관광공사 공식 행사 일정 · 운영시간은 주최 측 공지를 확인하세요",
    en: "Official KTO event schedule · check the organiser for opening hours",
    zh: "韩国观光公社官方活动日程 · 开放时间请以主办方公告为准",
    ja: "韓国観光公社の公式イベント日程 · 開催時間は主催者の案内をご確認ください",
  },
  subway: {
    ko: "서울교통공사 승하차 건수 · 방문자 수가 아니며 같은 사람이 여러 번 셀 수 있습니다",
    en: "Seoul Metro boarding/alighting counts · not unique visitors; one person can be counted more than once",
    zh: "首尔交通公社上下车次数 · 并非到访人数，同一人可能被多次计入",
    ja: "ソウル交通公社の乗降件数 · 訪問者数ではなく、同じ人が複数回数えられます",
  },
  foreign: {
    ko: "서울시 단기체류 외국인 생활인구 추정 · 관광객 수가 아닙니다",
    en: "Seoul short-stay foreign living-population estimate · not a count of tourists",
    zh: "首尔市短期停留外国人生活人口推算 · 并非游客人数",
    ja: "ソウル市の短期滞在外国人生活人口の推計 · 観光客数ではありません",
  },
  airport: {
    ko: "인천공항 공식 입국 예상 · 명동 방문객 수가 아닙니다",
    en: "Incheon Airport official arrival forecast · not Myeongdong visitors",
    zh: "仁川机场官方入境预计 · 并非明洞到访人数",
    ja: "仁川空港の公式入国予想 · 明洞の来訪者数ではありません",
  },
} as const;

export function buildTourismDeskBrief(input: TourismDeskInput, lang: DeskLang): TourismDeskLine[] {
  const lines: TourismDeskLine[] = [];

  if (input.crowding) {
    const { populationMin: min, populationMax: max, label, observedAt } = input.crowding;
    const range = `${count(min, lang)}~${count(max, lang)}`;
    const at = clock(observedAt, lang);
    lines.push({
      key: "crowding",
      text: lang === "ko" ? `지금 명동 생활인구 ${range}명 · ${label}${at ? ` (${at} 관측)` : ""}`
        : lang === "en" ? `Myeongdong living population now ${range} · ${label}${at ? ` (observed ${at})` : ""}`
        : lang === "zh" ? `当前明洞生活人口 ${range}人 · ${label}${at ? `（${at} 观测）` : ""}`
        : `現在の明洞の生活人口 ${range}人 · ${label}${at ? `（${at} 観測）` : ""}`,
      basis: BASIS.crowding[lang],
    });
  }

  if (input.weatherGuide) {
    lines.push({ key: "weather", text: input.weatherGuide, basis: BASIS.weather[lang] });
  }

  if (input.todayEvent) {
    const { title, categoryName, status } = input.todayEvent;
    const named = [categoryName, title].filter(Boolean).join(" · ");
    const more = input.eventCount > 1
      ? (lang === "ko" ? ` 외 ${input.eventCount - 1}건`
        : lang === "en" ? ` and ${input.eventCount - 1} more`
        : lang === "zh" ? ` 等${input.eventCount - 1}项`
        : ` ほか${input.eventCount - 1}件`)
      : "";
    const state = status === "RUNNING"
      ? { ko: "진행 중", en: "Running", zh: "进行中", ja: "開催中" }[lang]
      : { ko: "예정", en: "Upcoming", zh: "即将举行", ja: "開催予定" }[lang];
    const heading = { ko: "인근 행사", en: "Nearby event", zh: "附近活动", ja: "周辺イベント" }[lang];
    lines.push({
      key: "event",
      text: `${heading} ${state}: ${named}${more}`,
      basis: BASIS.event[lang],
    });
  }

  if (input.subway) {
    const { boardingCount, alightingCount, referenceDate, selectedStations } = input.subway;
    const on = count(boardingCount, lang);
    const off = count(alightingCount, lang);
    const when = day(referenceDate, lang);
    lines.push({
      key: "subway",
      text: lang === "ko" ? `${selectedStations} 승차 ${on} · 하차 ${off} (${when} 자료)`
        : lang === "en" ? `${selectedStations}: ${on} boardings · ${off} alightings (data for ${when})`
        : lang === "zh" ? `${selectedStations} 上车 ${on} · 下车 ${off}（${when} 数据）`
        : `${selectedStations} 乗車 ${on} · 降車 ${off}（${when} のデータ）`,
      basis: BASIS.subway[lang],
    });
  }

  if (input.foreignPresence) {
    const value = count(input.foreignPresence.value, lang);
    const when = day(input.foreignPresence.referenceAt, lang);
    lines.push({
      key: "foreign",
      text: lang === "ko" ? `단기체류 외국인 생활인구 ${value}명 (${when} 기준)`
        : lang === "en" ? `Short-stay foreign living population ${value} (as of ${when})`
        : lang === "zh" ? `短期停留外国人生活人口 ${value}人（${when} 基准）`
        : `短期滞在外国人生活人口 ${value}人（${when} 基準）`,
      basis: BASIS.foreign[lang],
    });
  }

  if (input.airportArrival) {
    const { expectedPassengers, targetStartAt, targetEndAt } = input.airportArrival;
    const band = `${clock(targetStartAt, lang)}–${clock(targetEndAt, lang)}`;
    const people = count(expectedPassengers, lang);
    lines.push({
      key: "airport",
      text: lang === "ko" ? `인천공항 입국 참고 · ${band} 예상 ${people}명`
        : lang === "en" ? `Incheon arrivals reference · ${people} expected ${band}`
        : lang === "zh" ? `仁川机场入境参考 · ${band} 预计 ${people}人`
        : `仁川空港の入国参考 · ${band} 予想 ${people}人`,
      basis: BASIS.airport[lang],
    });
  }

  return lines;
}
