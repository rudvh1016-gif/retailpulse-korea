/**
 * Sentences for the east/west flight comparison, in the four product
 * languages. The screen card, the prep facts, the copied text and the image
 * all call these, so a number can only be written one way.
 *
 * The person figure is always "참고 추정" (a reference estimate): the airport's
 * terminal-wide expected departures divided over every flight of the same
 * scope, each flight counting the same. It is never called actual east or west
 * passengers, and what could not be placed on a side is shown as its own item.
 */
import type { FlightEstimate, FlightSplit, SplitHour, SplitResult } from "./airport-flight-split";

type Lang = "ko" | "en" | "zh" | "ja";
type Row = Record<Lang, string>;
const row = (ko: string, en: string, zh: string, ja: string): Row => ({ ko, en, zh, ja });

export type SplitCore = Omit<FlightSplit, "hours" | "expected" | "expectedIssuedAt" | "retrievedAt" | "checkedAt" | "basis">;
export type SplitEstimate = { terminal: FlightSplit["terminal"] } & FlightEstimate;

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
  estimateDetails: row("배분 기준과 주의사항", "How this reference is calculated", "参考值的计算依据", "参考値の計算根拠"),
  heading: (terminal: string, when: "TODAY" | "TOMORROW" | "DATE", lang: Lang) => ({
    TODAY: row(`${terminal} 오늘 출발편`, `${terminal} departures today`, `${terminal} 今日出发航班`, `${terminal} 本日の出発便`),
    TOMORROW: row(`${terminal} 내일 출발편`, `${terminal} departures tomorrow`, `${terminal} 明日出发航班`, `${terminal} 明日の出発便`),
    DATE: row(`${terminal} 선택한 날 출발편`, `${terminal} departures on the chosen day`, `${terminal} 所选日期出发航班`, `${terminal} 選択日の出発便`),
  })[when][lang],
  estimateHeading: row("항공편 비율로 나눈 참고값", "Reference split by flight ratio", "按航班比例分配的参考值", "便数の比率で配分した参考値"),
  estimateNote: row(
    "실제 동·서편 승객 수가 아닙니다. 편당 승객 수가 같다는 가정의 참고값이며 백 명 단위로 반올림했습니다.",
    "Not the actual passengers on each side. A reference value that assumes every flight carries the same number of passengers, rounded to the nearest hundred.",
    "并非东西两侧的实际旅客数。这是假设每班航班旅客数相同的参考值，按百人取整。",
    "東西それぞれの実際の乗客数ではありません。1便あたりの乗客数が同じという前提の参考値で、百人単位に四捨五入しています。",
  ),
  concourseNote: row(
    "T1 예상 출국객에는 탑승동으로 가는 승객이 포함된 것으로 보고(공항 출국 절차 기준), 탑승동 출발편도 함께 나누어 따로 표시했습니다.",
    "The T1 figure is taken to include passengers bound for the concourse (per the airport's departure procedure), so concourse departures are divided too and shown separately.",
    "按机场出境流程，T1的预计出境旅客视为包含前往登机楼的旅客，因此登机楼出发航班也一并分配并单独显示。",
    "空港の出国手続きに基づき、T1の出国予想客には搭乗棟へ向かう乗客が含まれるものとして、搭乗棟の出発便もあわせて分け、別に表示しています。",
  ),
  center: row("중앙", "Centre", "中央", "中央"),
  unverified: row("위치 미확인", "Side not confirmed", "位置未确认", "位置未確認"),
  concourse: row("탑승동", "Concourse", "登机楼", "搭乗棟"),
  underHundred: row("100명 미만", "under 100", "不足100人", "100人より少ない"),
  verifiedBasis: row("동·서 위치가 확인된 항공편 기준", "Based on flights whose east/west side is confirmed", "以东西位置已确认的航班为准", "東西の位置が確認できた便が基準"),
  scheduled: row("예정 출발 시각 기준", "By scheduled departure time", "按计划出发时间", "予定出発時刻基準"),
  perHour: row("시간대별 동·서편 출발편", "East and west departures by hour", "各时段东西侧出发航班", "時間帯別の東西の出発便"),
  unavailable: {
    NONE: row("탑승구 기준 출발편 자료가 없어 동·서편 비교를 표시하지 않습니다.", "No gate-based flight data, so the east/west comparison is not shown.", "没有按登机口的航班资料，因此不显示东西侧比较。", "搭乗口基準の便データがないため、東西の比較は表示しません。"),
    STALE: row("항공편 자료가 오래되어 동·서편 비교를 표시하지 않습니다.", "The flight data is too old, so the east/west comparison is not shown.", "航班资料过旧，因此不显示东西侧比较。", "便データが古いため、東西の比較は表示しません。"),
    DATE_MISMATCH: row("항공편 자료의 날짜가 선택한 날과 달라 동·서편 비교를 표시하지 않습니다.", "The flight data is for another date, so the comparison is not shown.", "航班资料日期与所选日期不同，因此不显示比较。", "便データの日付が選択日と異なるため、比較は表示しません。"),
    NO_TERMINAL_FLIGHTS: row("이 터미널 탑승구로 확인된 출발편 자료가 없어 동·서편 비교를 표시하지 않습니다.", "No collected departures are placed at this terminal's gates, so the comparison is not shown.", "没有归入本航站楼登机口的已收集出发航班，因此不显示比较。", "このターミナルの搭乗口に分類された収集済みの出発便がないため、比較は表示しません。"),
  } as Record<Exclude<SplitResult["status"], "OK">, Row>,
  noConfirmedEstimate: row(
    "동·서 위치가 확인된 항공편이 없어 예상 출국객을 동·서편으로 나누지 않습니다.",
    "No flight has a confirmed east or west side, so the expected departures are not split.",
    "没有东西位置已确认的航班，因此不按东西侧分配预计出境旅客。",
    "東西の位置が確認できた便がないため、出国予想客は東西に分けません。",
  ),
  noEstimate: row(
    "터미널 전체 예상 출국객이 아직 하루치 모두 모이지 않았거나 오래되어 항공편 비율 추정은 표시하지 않습니다.",
    "The terminal-wide expected departures are incomplete or out of date, so no estimate by flight ratio is shown.",
    "航站楼整体预计出境旅客尚不完整或已过期，因此不显示按航班比例的估算。",
    "ターミナル全体の出国予想客が未完了または古いため、便数の比率による推定は表示しません。",
  ),
};

/** "동편 120편 60% · 서편 80편 40% …": the counts, with the unconfirmed ones named next to them. */
export function flightsBody(s: SplitCore, lang: Lang): string {
  const east = `${sideWord.EAST[lang]} ${num(s.east, lang)}${unit[lang]}${s.eastPct !== null ? ` ${s.eastPct}%` : ""}`;
  const west = `${sideWord.WEST[lang]} ${num(s.west, lang)}${unit[lang]}${s.westPct !== null ? ` ${s.westPct}%` : ""}`;
  const center = row("중앙", "Centre", "中央", "中央")[lang] + ` ${num(s.center, lang)}${unit[lang]}`;
  const unverified = `${row("위치 미확인", "Side not confirmed", "位置未确认", "位置未確認")[lang]} ${num(s.unverified, lang)}${unit[lang]}${s.unverifiedPct !== null ? `${lang === "en" ? " " : ""}(${row("전체의", "of all", "占全部", "全体の")[lang]} ${pctText(s.unverifiedPct)})` : ""}`;
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

/** One group's figure: exactly none when it has no flight (or nothing to spread), "under 100" when it rounds to nothing, else "about N". */
function peopleText(part: { flights: number; people: number }, total: number, lang: Lang): string {
  if (part.flights === 0 || total === 0) return `0${person[lang]}`;
  if (part.people === 0) return splitCopy.underHundred[lang];
  const about = row("약 ", "about ", "约", "約");
  return `${about[lang]}${num(part.people, lang)}${person[lang]}`;
}

/**
 * "동편 약 15,700명 · 서편 약 14,300명 · 위치 미확인 약 12,600명": the reference estimate.
 * East and west are always named; a group with no flight is left out, and the
 * unconfirmed share is its own item, never folded into east or west.
 */
export function estimateBody(e: SplitEstimate, lang: Lang): string {
  const items: Array<[string, { flights: number; people: number }]> = [
    [sideWord.EAST[lang], e.east],
    [sideWord.WEST[lang], e.west],
  ];
  if (e.center.flights > 0) items.push([splitCopy.center[lang], e.center]);
  if (e.unverified.flights > 0) items.push([splitCopy.unverified[lang], e.unverified]);
  if (e.concourse && e.concourse.flights > 0) items.push([splitCopy.concourse[lang], e.concourse]);
  return items.map(([label, part]) => `${label} ${peopleText(part, e.total, lang)}`).join(" · ");
}

/**
 * "터미널 전체 예상 42,606명 기준 · 같은 범위 출발편 303편(T1 본관 162편 + 탑승동 141편)으로 나눈 추정":
 * what was divided, and over how many flights of which scope.
 */
export function estimateBasisLine(e: SplitEstimate, lang: Lang): string {
  const total = row(`터미널 전체 예상 ${num(e.total, lang)}명 기준`, `from ${num(e.total, lang)} expected across the terminal`, `按航站楼整体预计 ${num(e.total, lang)} 人`, `ターミナル全体の予想 ${num(e.total, lang)}人が基準`)[lang];
  const concourse = e.concourse?.flights ?? 0;
  const main = e.flights - concourse;
  // T1 with concourse flights: show the two buildings so the count can be reconciled with the card's own T1 total.
  const composition = concourse > 0
    ? row(`(T1 본관 ${num(main, lang)}편 + 탑승동 ${num(concourse, lang)}편)`, ` (${num(main, lang)} T1 main building + ${num(concourse, lang)} concourse)`, `（T1主楼 ${num(main, lang)} 班 + 登机楼 ${num(concourse, lang)} 班）`, `（T1本館 ${num(main, lang)}便 + 搭乗棟 ${num(concourse, lang)}便）`)[lang]
    : "";
  const spread = row(
    `같은 범위 출발편 ${num(e.flights, lang)}편${composition}으로 나눈 추정`,
    `divided over ${num(e.flights, lang)} departures of the same scope${composition}`,
    `按同一范围的 ${num(e.flights, lang)} 班出发航班分配${composition}`,
    `同じ範囲の出発${num(e.flights, lang)}便${composition}で按分`,
  )[lang];
  const outside = e.outsideScope > 0
    ? ` · ${row(`터미널 미확인 ${num(e.outsideScope, lang)}편 제외`, `${num(e.outsideScope, lang)} departures with unknown terminal left out`, `航站楼未确认的 ${num(e.outsideScope, lang)} 班未计入`, `ターミナル未確認の${num(e.outsideScope, lang)}便は除外`)[lang]}`
    : "";
  return `${total} · ${spread}${outside}`;
}

/**
 * The warning that travels with the number: the base note, plus the T1 concourse
 * line when there are concourse flights among the ones divided.
 */
export function estimateNote(e: SplitEstimate, lang: Lang): string {
  return (e.concourse?.flights ?? 0) > 0 ? `${splitCopy.estimateNote[lang]} ${splitCopy.concourseNote[lang]}` : splitCopy.estimateNote[lang];
}

/** The estimate as one sentence, with its basis and its short warning. */
export function estimateSentence(e: SplitEstimate, lang: Lang): string {
  const day = row("하루 전체", "whole day", "全天", "終日")[lang];
  const heading = lang === "en" ? splitCopy.estimateHeading.en.replace(/^./, (first) => first.toLowerCase()) : splitCopy.estimateHeading[lang];
  return `${e.terminal}${lang === "en" ? " — " : " "}${heading}(${day}): ${estimateBody(e, lang)} (${estimateBasisLine(e, lang)}). ${estimateNote(e, lang)}`;
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
