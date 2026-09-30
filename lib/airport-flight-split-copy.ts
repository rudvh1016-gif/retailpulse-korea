/**
 * Sentences for the east/west flight comparison, in the four product
 * languages. The screen card, the prep facts, the copied text and the image
 * all call these, so a number can only be written one way.
 *
 * The person figure is always "참고 추정" (a reference estimate): the airport's
 * terminal-wide expected departures divided by the east:west flight ratio. It
 * is never called actual east or west passengers.
 */
import type { FlightSplit, SplitHour, SplitResult } from "./airport-flight-split";

type Lang = "ko" | "en" | "zh" | "ja";
type Row = Record<Lang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export type SplitCore = Omit<FlightSplit, "hours" | "expected" | "expectedIssuedAt" | "retrievedAt" | "checkedAt" | "basis">;
export type SplitEstimate = { terminal: FlightSplit["terminal"]; total: number; east: number; west: number };

const locale = { ko: "ko-KR", en: "en-US", zh: "zh-CN", ja: "ja-JP" } as const;
const num = (value: number, lang: Lang) => new Intl.NumberFormat(locale[lang], { maximumFractionDigits: 0 }).format(value);
const pctText = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
const hh = (hour: number) => String(hour).padStart(2, "0");

const sideWord = {
  EAST: row("동편", "East", "东侧", "東側"),
  WEST: row("서편", "West", "西侧", "西側"),
};
const unit = row("편", " flights", "班", "便");
const person = row("명", "", "人", "人");

export const splitCopy = {
  heading: (terminal: string, when: "TODAY" | "TOMORROW" | "DATE", lang: Lang) => ({
    TODAY: row(`${terminal} 오늘 출발편`, `${terminal} departures today`, `${terminal} 今日出发航班`, `${terminal} 本日の出発便`),
    TOMORROW: row(`${terminal} 내일 출발편`, `${terminal} departures tomorrow`, `${terminal} 明日出发航班`, `${terminal} 明日の出発便`),
    DATE: row(`${terminal} 선택한 날 출발편`, `${terminal} departures on the chosen day`, `${terminal} 所选日期出发航班`, `${terminal} 選択日の出発便`),
  })[when][lang],
  estimateHeading: row("항공편 비율로 본 예상 출국객", "Expected departing passengers by flight ratio", "按航班比例的预计出境旅客", "便数の比率で見た出国予想客"),
  estimateNote: row(
    "실제 동·서편 승객 수가 아닙니다. 터미널 전체 예상 출국객을 이 터미널 탑승구의 동·서편 항공편 비율로 나눈 참고값입니다.",
    "Not the actual passengers on each side. The terminal-wide expected departures split by the east:west ratio of flights at this terminal's gates, for reference only.",
    "并非东西两侧的实际旅客数。这是把航站楼整体预计出境旅客，按本航站楼登机口航班的东西侧比例分配得到的参考值。",
    "東西それぞれの実際の乗客数ではありません。ターミナル全体の出国予想客を、このターミナルの搭乗口の東西の便数比率で分けた参考値です。",
  ),
  verifiedBasis: row("동·서 위치가 확인된 항공편 기준", "Based on flights whose east/west side is confirmed", "以东西位置已确认的航班为准", "東西の位置が確認できた便が基準"),
  estimateBasis: row("이 터미널 탑승구 항공편 비율로 나눈 추정", "split by this terminal's gate-flight ratio", "按本航站楼登机口航班比例分配", "このターミナルの搭乗口の便数比率で按分"),
  scheduled: row("예정 출발 시각 기준", "By scheduled departure time", "按计划出发时间", "予定出発時刻基準"),
  perHour: row("시간대별 동·서편 출발편", "East and west departures by hour", "各时段东西侧出发航班", "時間帯別の東西の出発便"),
  unavailable: {
    NONE: row("탑승구 기준 출발편 자료가 없어 동·서편 비교를 표시하지 않습니다.", "No gate-based flight data, so the east/west comparison is not shown.", "没有按登机口的航班资料，因此不显示东西侧比较。", "搭乗口基準の便データがないため、東西の比較は表示しません。"),
    STALE: row("항공편 자료가 오래되어 동·서편 비교를 표시하지 않습니다.", "The flight data is too old, so the east/west comparison is not shown.", "航班资料过旧，因此不显示东西侧比较。", "便データが古いため、東西の比較は表示しません。"),
    DATE_MISMATCH: row("항공편 자료의 날짜가 선택한 날과 달라 동·서편 비교를 표시하지 않습니다.", "The flight data is for another date, so the comparison is not shown.", "航班资料日期与所选日期不同，因此不显示比较。", "便データの日付が選択日と異なるため、比較は表示しません。"),
    NO_TERMINAL_FLIGHTS: row("이 터미널의 출발편 기록이 없어 동·서편 비교를 표시하지 않습니다.", "There are no departure records for this terminal, so the comparison is not shown.", "该航站楼没有出发航班记录，因此不显示比较。", "このターミナルの出発便の記録がないため、比較は表示しません。"),
  } as Record<Exclude<SplitResult["status"], "OK">, Row>,
  noConfirmedEstimate: row(
    "동·서 위치가 확인된 항공편이 없어 예상 출국객을 동·서편으로 나누지 않습니다.",
    "No flight has a confirmed east or west side, so the expected departures are not split.",
    "没有东西位置已确认的航班，因此不按东西侧分配预计出境旅客。",
    "東西の位置が確認できた便がないため、出国予想客は東西に分けません。",
  ),
  noEstimate: row(
    "터미널 전체 예상 출국객 자료가 없어 항공편 비율 추정은 표시하지 않습니다.",
    "There is no terminal-wide expected-departures figure, so no estimate by flight ratio is shown.",
    "没有航站楼整体预计出境旅客资料，因此不显示按航班比例的估算。",
    "ターミナル全体の出国予想客データがないため、便数の比率による推定は表示しません。",
  ),
};

/** "동편 120편 60% · 서편 80편 40% …": the counts, with the unconfirmed ones named next to them. */
export function flightsBody(s: SplitCore, lang: Lang): string {
  const east = `${sideWord.EAST[lang]} ${num(s.east, lang)}${unit[lang]}${s.eastPct !== null ? ` ${s.eastPct}%` : ""}`;
  const west = `${sideWord.WEST[lang]} ${num(s.west, lang)}${unit[lang]}${s.westPct !== null ? ` ${s.westPct}%` : ""}`;
  const center = row("중앙", "Centre", "中央", "中央")[lang] + ` ${num(s.center, lang)}${unit[lang]}`;
  const unverified = `${row("위치 미확인", "Side not confirmed", "位置未确认", "位置未確認")[lang]} ${num(s.unverified, lang)}${unit[lang]}${s.unverifiedPct !== null ? `(${row("전체의", "of all", "占全部", "全体の")[lang]} ${pctText(s.unverifiedPct)})` : ""}`;
  return `${east} · ${west} · ${center} · ${unverified}`;
}

/** Which side has more, in words. */
export function largerWord(s: SplitCore, lang: Lang): string {
  if (s.larger === "EAST") return row("동편이 더 많음", "more on the east", "东侧更多", "東側が多い")[lang];
  if (s.larger === "WEST") return row("서편이 더 많음", "more on the west", "西侧更多", "西側が多い")[lang];
  if (s.larger === "EQUAL") return row("동·서 차이 작음", "about equal", "东西相近", "東西は同程度")[lang];
  return "";
}

/** The east:west ratio and the sentence it rests on. */
export function sharesBody(s: SplitCore, lang: Lang): string {
  if (s.eastPct === null || s.westPct === null) {
    return row("동·서 위치가 확인된 항공편이 없어 비율을 계산하지 않았습니다.", "No flight has a confirmed east or west side, so no ratio is calculated.", "没有东西位置已确认的航班，因此不计算比例。", "東西の位置が確認できた便がないため、比率は計算しません。")[lang];
  }
  const head = `${splitCopy.verifiedBasis[lang]} (${num(s.verified, lang)}${unit[lang]})`;
  return `${head}: ${sideWord.EAST[lang]} ${s.eastPct}% · ${sideWord.WEST[lang]} ${s.westPct}% (${largerWord(s, lang)})`;
}

/** "동편 약 24,000명 · 서편 약 16,000명": the reference estimate. */
export function estimateBody(e: SplitEstimate, lang: Lang): string {
  const about = row("약 ", "about ", "约", "約");
  return `${sideWord.EAST[lang]} ${about[lang]}${num(e.east, lang)}${person[lang]} · ${sideWord.WEST[lang]} ${about[lang]}${num(e.west, lang)}${person[lang]}`;
}

/** "터미널 전체 예상 40,000명 기준 · 확인된 항공편 기준 추정" */
export function estimateBasisLine(e: SplitEstimate, lang: Lang): string {
  const total = row(`터미널 전체 예상 ${num(e.total, lang)}명 기준`, `from ${num(e.total, lang)} expected across the terminal`, `按航站楼整体预计 ${num(e.total, lang)} 人`, `ターミナル全体の予想 ${num(e.total, lang)}人が基準`)[lang];
  return `${total} · ${splitCopy.estimateBasis[lang]}`;
}

/** The estimate as one sentence, with its basis and its short warning. */
export function estimateSentence(e: SplitEstimate, lang: Lang): string {
  const day = row("하루 전체", "whole day", "全天", "終日")[lang];
  return `${e.terminal} ${splitCopy.estimateHeading[lang]}(${day}): ${estimateBody(e, lang)} (${estimateBasisLine(e, lang)}). ${splitCopy.estimateNote[lang]}`;
}

/** The whole-day flight sentence used as a prep fact. */
export function flightSentence(s: SplitCore, lang: Lang): string {
  const title = row(`${s.terminal} 출발편(하루 전체)`, `${s.terminal} departures (whole day)`, `${s.terminal} 出发航班（全天）`, `${s.terminal} 出発便（終日）`)[lang];
  return `${title} ${num(s.total, lang)}${unit[lang]}: ${flightsBody(s, lang)}. ${sharesBody(s, lang)}`;
}

/** One hour of the comparison, kept short enough for a phone. The shares are of the confirmed east + west flights. */
export function hourBody(h: SplitHour, lang: Lang): string {
  const span = lang === "en" ? `${hh(h.hour)}:00–${hh(h.hour + 1)}:00` : `${hh(h.hour)}–${hh(h.hour + 1)}${row("시", "", "时", "時")[lang]}`;
  const east = lang === "en" ? "E" : lang === "ko" ? "동" : lang === "zh" ? "东" : "東";
  const west = lang === "en" ? "W" : lang === "ko" ? "서" : lang === "zh" ? "西" : "西";
  const shares = h.eastPct !== null && h.westPct !== null ? ` (${east} ${h.eastPct}% · ${west} ${h.westPct}%)` : "";
  const total = `${row("합계", "total", "合计", "合計")[lang]} ${h.total}${unit[lang]}`;
  const extra = [
    h.center > 0 ? `${row("중앙", "centre", "中央", "中央")[lang]} ${h.center}${unit[lang]}` : "",
    h.unverified > 0 ? `${row("미확인", "unconfirmed", "未确认", "未確認")[lang]} ${h.unverified}${unit[lang]}` : "",
  ].filter(Boolean).join(" · ");
  return `${span} · ${total} · ${east} ${h.east}${unit[lang]} / ${west} ${h.west}${unit[lang]}${shares}${extra ? ` · ${extra}` : ""}`;
}
