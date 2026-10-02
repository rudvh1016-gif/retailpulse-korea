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
  heading: (terminal: string, when: "TODAY" | "TOMORROW" | "DATE", lang: Lang) => ({
    TODAY: row(`${terminal} 오늘 출발편`, `${terminal} departures today`, `${terminal} 今日出发航班`, `${terminal} 本日の出発便`),
    TOMORROW: row(`${terminal} 내일 출발편`, `${terminal} departures tomorrow`, `${terminal} 明日出发航班`, `${terminal} 明日の出発便`),
    DATE: row(`${terminal} 선택한 날 출발편`, `${terminal} departures on the chosen day`, `${terminal} 所选日期出发航班`, `${terminal} 選択日の出発便`),
  })[when][lang],
  estimateHeading: row("같은 비율로 나눈 예상 출국객", "Expected passengers split by the same ratio", "按相同比例分配的预计出境旅客", "同じ比率で分けた出国予想客"),
  estimateNote: row(
    "항공기 크기와 탑승률은 반영하지 않았고 100명 단위로 반올림했습니다. 실제 승객 수가 아닙니다.",
    "Aircraft size and load are not considered; figures are rounded to the nearest 100. Not actual passenger counts.",
    "未计入机型大小和上座率，按百人取整。不是实际旅客数。",
    "機材の大きさと搭乗率は反映せず、100人単位に四捨五入しています。実際の乗客数ではありません。",
  ),
  concourseNote: row(
    "T1 예상 출국객에는 탑승동으로 가는 승객이 포함된 것으로 보고(공항 출국 절차 기준), 탑승동 출발편도 함께 나누어 따로 표시했습니다.",
    "The T1 figure is taken to include passengers bound for the concourse (per the airport's departure procedure), so concourse departures are divided too and shown separately.",
    "按机场出境流程，T1的预计出境旅客视为包含前往登机楼的旅客，因此登机楼出发航班也一并分配并单独显示。",
    "空港の出国手続きに基づき、T1の出国予想客には搭乗棟へ向かう乗客が含まれるものとして、搭乗棟の出発便もあわせて分け、別に表示しています。",
  ),
  center: row("중앙", "Centre", "中央", "中央"),
  unverified: row("탑승구 미정", "Gate not set", "登机口未定", "搭乗口未定"),
  concourse: row("탑승동", "Concourse", "登机楼", "搭乗棟"),
  underHundred: row("100명 미만", "under 100", "不足100人", "100人より少ない"),
  verifiedBasis: row("탑승구가 정해진 출발편 기준", "Based on departures that already have a gate", "以已分配登机口的出发航班为准", "搭乗口が決まった出発便が基準"),
  scheduled: row("예정 출발 시각 기준", "By scheduled departure time", "按计划出发时间", "予定出発時刻基準"),
  perHour: row("시간대별 동·서편 출발편", "East and west departures by hour", "各时段东西侧出发航班", "時間帯別の東西の出発便"),
  unavailable: {
    NONE: row("탑승구 기준 출발편 자료가 없어 동·서편 비교를 표시하지 않습니다.", "No gate-based flight data, so the east/west comparison is not shown.", "没有按登机口的航班资料，因此不显示东西侧比较。", "搭乗口基準の便データがないため、東西の比較は表示しません。"),
    STALE: row("항공편 자료가 오래되어 동·서편 비교를 표시하지 않습니다.", "The flight data is too old, so the east/west comparison is not shown.", "航班资料过旧，因此不显示东西侧比较。", "便データが古いため、東西の比較は表示しません。"),
    DATE_MISMATCH: row("항공편 자료의 날짜가 선택한 날과 달라 동·서편 비교를 표시하지 않습니다.", "The flight data is for another date, so the comparison is not shown.", "航班资料日期与所选日期不同，因此不显示比较。", "便データの日付が選択日と異なるため、比較は表示しません。"),
    NO_TERMINAL_FLIGHTS: row("이 터미널 탑승구로 확인된 출발편 자료가 없어 동·서편 비교를 표시하지 않습니다.", "No collected departures are placed at this terminal's gates, so the comparison is not shown.", "没有归入本航站楼登机口的已收集出发航班，因此不显示比较。", "このターミナルの搭乗口に分類された収集済みの出発便がないため、比較は表示しません。"),
  } as Record<Exclude<SplitResult["status"], "OK">, Row>,
  noConfirmedEstimate: row(
    "탑승구가 정해진 출발편이 아직 없어 예상 출국객을 동·서편으로 나누지 않았습니다.",
    "No departure has a gate yet, so the expected passengers are not split east and west.",
    "还没有已分配登机口的出发航班，因此未按东西侧分配预计出境旅客。",
    "搭乗口が決まった出発便がまだないため、出国予想客は東西に分けていません。",
  ),
  noEstimate: row(
    "터미널 전체 예상 출국객이 아직 하루치 모두 모이지 않았거나 오래되어 항공편 비율 추정은 표시하지 않습니다.",
    "The terminal-wide expected departures are incomplete or out of date, so no estimate by flight ratio is shown.",
    "航站楼整体预计出境旅客尚不完整或已过期，因此不显示按航班比例的估算。",
    "ターミナル全体の出国予想客が未完了または古いため、便数の比率による推定は表示しません。",
  ),
};

/** "동편 120편 (60%) · 서편 80편 (40%) · 탑승구 미정 20편 (전체의 9.1%)": the counts; centre and unset only when they exist. */
export function flightsBody(s: SplitCore, lang: Lang): string {
  const pct = (value: number | null) => value === null ? "" : ` (${value}%)`;
  const parts = [
    `${sideWord.EAST[lang]} ${num(s.east, lang)}${unit[lang]}${pct(s.eastPct)}`,
    `${sideWord.WEST[lang]} ${num(s.west, lang)}${unit[lang]}${pct(s.westPct)}`,
  ];
  if (s.center > 0) parts.push(`${splitCopy.center[lang]} ${num(s.center, lang)}${unit[lang]}`);
  if (s.unverified > 0) parts.push(`${splitCopy.unverified[lang]} ${num(s.unverified, lang)}${unit[lang]}${s.unverifiedPct !== null ? ` (${row("전체의", "of all", "占全部", "全体の")[lang]} ${pctText(s.unverifiedPct)})` : ""}`);
  return parts.join(" · ");
}

/** Which side has more, as a short sentence. */
export function largerWord(s: SplitCore, lang: Lang): string {
  if (s.larger === "EAST") return row("동편이 더 많습니다", "More on the east", "东侧更多", "東側が多めです")[lang];
  if (s.larger === "WEST") return row("서편이 더 많습니다", "More on the west", "西侧更多", "西側が多めです")[lang];
  if (s.larger === "EQUAL") return row("동편과 서편이 거의 같습니다", "East and west are about equal", "东西相近", "東西はほぼ同じです")[lang];
  return "";
}

/** "탑승구가 정해진 200편 기준으로 동편 60%, 서편 40%. 동편이 더 많습니다." */
export function sharesBody(s: SplitCore, lang: Lang): string {
  if (s.eastPct === null || s.westPct === null) {
    return row("탑승구가 정해진 출발편이 아직 없어 비율을 내지 않았습니다.", "No departure has a gate yet, so no ratio is given.", "还没有已分配登机口的出发航班，因此未计算比例。", "搭乗口が決まった出発便がまだないため、比率は出していません。")[lang];
  }
  return row(
    `탑승구가 정해진 ${num(s.verified, "ko")}편 기준으로 동편 ${s.eastPct}%, 서편 ${s.westPct}%. ${largerWord(s, "ko")}.`,
    `Of the ${num(s.verified, "en")} flights with a gate, ${s.eastPct}% are east and ${s.westPct}% west. ${largerWord(s, "en")}.`,
    `以已分配登机口的 ${num(s.verified, "zh")} 班为基数，东侧 ${s.eastPct}%，西侧 ${s.westPct}%。${largerWord(s, "zh")}。`,
    `搭乗口が決まった${num(s.verified, "ja")}便のうち東側${s.eastPct}%、西側${s.westPct}%。${largerWord(s, "ja")}。`,
  )[lang];
}

/** One group's figure: exactly none when it has no flight (or nothing to spread), "under 100" when it rounds to nothing, else "about N". */
function peopleText(part: { flights: number; people: number }, total: number, lang: Lang): string {
  if (part.flights === 0 || total === 0) return `0${person[lang]}`;
  if (part.people === 0) return splitCopy.underHundred[lang];
  const about = row("약 ", "about ", "约", "約");
  return `${about[lang]}${num(part.people, lang)}${person[lang]}`;
}

/**
 * "동편 약 15,700명 · 서편 약 14,300명 · 탑승구 미정 약 12,600명": the reference estimate.
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
 * "공항이 발표한 T1 예상 출국객 42,606명을 출발편 303편(T1 본관 162편 + 탑승동 141편)에 같은 수로 나눈 참고값입니다.":
 * what was divided, and over how many flights of which scope.
 */
export function estimateBasisLine(e: SplitEstimate, lang: Lang): string {
  const concourse = e.concourse?.flights ?? 0;
  const main = e.flights - concourse;
  // T1 with concourse flights: show the two buildings so the count can be reconciled with the card's own T1 total.
  const composition = concourse > 0
    ? row(`(T1 본관 ${num(main, "ko")}편 + 탑승동 ${num(concourse, "ko")}편)`, ` (${num(main, "en")} T1 main building + ${num(concourse, "en")} concourse)`, `（T1主楼 ${num(main, "zh")} 班 + 登机楼 ${num(concourse, "zh")} 班）`, `（T1本館 ${num(main, "ja")}便 + 搭乗棟 ${num(concourse, "ja")}便）`)[lang]
    : "";
  const base = row(
    `공항이 발표한 ${e.terminal} 예상 출국객 ${num(e.total, "ko")}명을 출발편 ${num(e.flights, "ko")}편${composition}에 같은 수로 나눈 참고값입니다.`,
    `A reference split of the airport's ${num(e.total, "en")} expected ${e.terminal} departures over ${num(e.flights, "en")} flights${composition}, each counted the same.`,
    `将机场发布的 ${e.terminal} 预计出境旅客 ${num(e.total, "zh")} 人按 ${num(e.flights, "zh")} 班出发航班${composition}平均分配的参考值。`,
    `空港が発表した${e.terminal}の出国予想客${num(e.total, "ja")}人を出発便${num(e.flights, "ja")}便${composition}に均等に分けた参考値です。`,
  )[lang];
  const outside = e.outsideScope > 0
    ? ` ${row(`건물을 알 수 없는 ${num(e.outsideScope, "ko")}편은 제외했습니다.`, `${num(e.outsideScope, "en")} departures with an unknown building are left out.`, `所在建筑未确认的 ${num(e.outsideScope, "zh")} 班未计入。`, `建物が分からない${num(e.outsideScope, "ja")}便は除きました。`)[lang]}`
    : "";
  return `${base}${outside}`;
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
  return `${e.terminal}${lang === "en" ? " — " : " "}${heading}(${day}): ${estimateBody(e, lang)}. ${estimateBasisLine(e, lang)} ${estimateNote(e, lang)}`;
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
    h.unverified > 0 ? `${row("미정", "no gate", "未定", "未定")[lang]} ${h.unverified}${unit[lang]}` : "",
  ].filter(Boolean).join(" · ");
  return `${span} · ${total} · ${east} ${h.east}${unit[lang]} / ${west} ${h.west}${unit[lang]}${shares}${extra ? ` · ${extra}` : ""}`;
}
