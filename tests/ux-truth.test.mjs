import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const signals = readFileSync("app/live-signals.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

/**
 * A number without its metric is not data, it is a guess the reader has to
 * make. "96,000–98,000명" beside a congestion word reads to most people as
 * today's visitor count; it is Seoul's estimate of how many people are in the
 * area at the moment it was observed. These tests pin the wording that says so.
 */

test("the area population names itself as a current estimate", () => {
  assert.match(signals, /현재 추정 인구/, "Korean must name the metric");
  assert.match(signals, /Estimated population now/, "English must name the metric");
  assert.match(signals, /当前推定人口/, "Simplified Chinese must name the metric");
  assert.match(signals, /現在の推定人口/, "Japanese must name the metric");
});

test("the realtime population is never called a visitor count", () => {
  // "누적 방문객" is allowed in exactly one shape: saying the number is NOT
  // that. Anything else would be the claim this phase exists to prevent.
  const claims = signals.split("\n").filter((line) =>
    /오늘 방문객|누적 방문객|일일 방문자|오늘 방문자 수/.test(line)
    && !/아님|ではありません|not today's cumulative|非今日累计/.test(line));
  assert.deepEqual(claims, [], "a visitor-count claim must only ever appear as a denial");
});

test("the population range is presented with its metric, not on its own", () => {
  // The row's label carries the metric and the value carries the unit, so a
  // bare range can never be the whole of what the reader sees.
  assert.match(signals, /label: text\.currentPopulation\[lang\]/);
  assert.match(signals, /formatPeopleRange\(lang, block\.realtime\.populationMin, block\.realtime\.populationMax\)\}\$\{text\.foreignPeople\[lang\]\}/);
  assert.match(signals, /const measured = `\$\{metric\} \$\{range\}\$\{people\} · \$\{level\}`/,
    "the brief headline must name the metric before the number too");
});

test("the observation time and the not-cumulative note travel with the number", () => {
  assert.match(signals, /notCumulative/);
  assert.match(signals, /오늘 누적 방문객 아님/);
  assert.match(signals, /formatHumanFreshness\(block\.realtime\.observedAt, summary\.generatedAt, lang, "observed"\)/,
    "the reader must be able to see which moment was observed");
});

test("realtime commercial activity appears immediately after population with truthful scope", () => {
  for (const phrase of [
    "신한카드 내국인 결제 기반 · 전수 매출 아님 · 외국인 소비 아님",
    "Based on Shinhan Card domestic-consumer payments · not total sales · not foreign-consumer spending",
    "基于新韩卡韩国境内消费者支付 · 非全量销售额 · 非外国消费者支出",
    "新韓カードの国内消費者決済に基づく · 売上全数ではありません · 外国人消費ではありません",
  ]) assert.ok(signals.includes(phrase), `${phrase} must remain visible`);
  const areaSignals = signals.match(/export default function LiveSignals[\s\S]*?\nconst flightBoardText/)?.[0] ?? "";
  assert.ok(areaSignals.indexOf('key: "realtime"') < areaSignals.indexOf("buildCommercialSignalRow"));
  assert.ok(areaSignals.indexOf("buildCommercialSignalRow") < areaSignals.indexOf("block?.foreignPresence"));
  assert.doesNotMatch(areaSignals, /foreign spend|tourist spend|외국인 매출|관광객 매출/i);
});

test("foreign purpose mobility is historical, dated, and never presented as visitors or sales", () => {
  for (const phrase of [
    "최근 공개 외국인 이동 패턴", "Latest published foreign mobility pattern",
    "最新公开外国人移动模式", "最新公開の外国人移動傾向",
    "실시간·방문객·구매·매출 아님",
    "not real-time activity, visitors, purchases, or sales",
  ]) assert.ok(signals.includes(phrase), `${phrase} must remain visible`);
  const areaSignals = signals.match(/export default function LiveSignals[\s\S]*?\nconst flightBoardText/)?.[0] ?? "";
  assert.ok(areaSignals.indexOf("block?.foreignPresence") < areaSignals.indexOf("block?.foreignPurposeMobility"));
  const mobilityBlock = areaSignals.match(/if \(block\?\.foreignPurposeMobility\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(mobilityBlock, /mobility\.referenceDate/);
  assert.doesNotMatch(mobilityBlock, /LIVE|today|오늘|visitor count|매출액/);
});

test("subway signal preserves boarding/alighting truth in all four languages", () => {
  for (const phrase of [
    "대표 지하철역 승하차", "Representative station boarding and alighting",
    "代表地铁站进出站", "代表駅の乗降",
    "실시간·고유 방문객·상권 방문객 수 아님",
    "not real-time, unique people, or commercial-area visitors",
  ]) assert.ok(signals.includes(phrase), `${phrase} must remain visible`);
  const areaSignals = signals.match(/export default function LiveSignals[\s\S]*?\nconst flightBoardText/)?.[0] ?? "";
  const subwayBlock = areaSignals.match(/if \(block\?\.subwayRidership\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(subwayBlock, /subway\.referenceDate/);
  assert.match(subwayBlock, /subway\.alightingCount/);
  assert.match(subwayBlock, /subway\.boardingCount/);
  assert.doesNotMatch(subwayBlock, /visitor count|방문객 수.*\$\{|LIVE|realtime/i);
  // The station names itself. The old internal vocabulary told a visitor
  // nothing about which station produced the number. Comments are stripped
  // first, since the code explains the change it made.
  assert.match(subwayBlock, /formatRepresentativeStations\(subway\.selectedStations\)/);
  const shown = signals.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const internal of ["선정 역", "Selected-station", "所选车站", "選定駅"]) {
    assert.equal(shown.includes(internal), false, `internal "${internal}" vocabulary must not reach the UI`);
  }
});

/**
 * A4 is an observation of one checkpoint. A5 is an official forecast. The
 * product must never let one read as the other.
 */
test("airport current observation and official forecast stay separately named", () => {
  for (const forecastWord of ["예상 출국객", "예상 피크"]) {
    assert.ok(signals.includes(forecastWord), `${forecastWord} must exist as forecast wording`);
  }
  // These words may appear only where the product denies them, e.g.
  // "인천공항 공식 예상 · 실제 출국객 집계 아님".
  const claims = signals.split("\n").filter((line) =>
    /실제 출국객|현재 실제 승객|실측 승객/.test(line)
    && !/아님|ではありません|not an actual|非实际/.test(line));
  assert.deepEqual(claims, [], "a forecast must never be worded as a measurement");
});

test("Seoul uses airport arrivals only as area-independent background context", () => {
  for (const wording of ["예상 입국객", "입국 예보", "공식 입국 예보"]) {
    assert.ok(signals.includes(wording), `${wording} must exist as forecast wording`);
  }
  assert.match(signals, /서울의 특정 지역과 직접 연결되지 않는 배경 참고/);
  assert.match(signals, /실제 서울 방문객 수 아님/);
  assert.doesNotMatch(signals, /서울 소비 수요의 선행 참고 신호/);
  const claims = signals.split("\n").filter((line) =>
    /실제 입국객|현재 입국객|실측 입국객/.test(line)
    && !/아님|ではありません|not actual|非实际/.test(line));
  assert.deepEqual(claims, [], "airport arrival forecasts must never read as observed arrivals");
  assert.doesNotMatch(signals, /입국객[^\n]*명동에 유입/,
    "airport arrivals must never be asserted as Myeongdong visitors");
});

test("event cards describe the selected date, not an unproven live operating state", () => {
  for (const wording of [
    "선택 날짜가 공식 행사기간에 포함",
    "Selected date falls within the official event period",
    "所选日期在官方活动期间内",
    "選択日は公式開催期間内",
    "선택 날짜 이후 공식 행사기간 시작",
    "Official event period starts after the selected date",
    "官方活动期间在所选日期之后开始",
    "公式開催期間は選択日より後に開始",
  ]) assert.ok(signals.includes(wording), `${wording} must exist as selected-date wording`);

  const eventCard = signals.match(/function EventCard[\s\S]*?\nfunction EventSignalPanel/)?.[0] ?? "";
  assert.ok(eventCard.length > 0);
  assert.match(eventCard, /eventStatusForDate\(event, serviceDate\)/);
  assert.doesNotMatch(eventCard, /진행 중|\bRunning\b|进行中|開催中|오늘 포함|\bToday\b/u);
});

/**
 * The chart used to be laid out as 24 bands of `flex: 1 0 42px` with a 5px
 * gap — at least 24*42 + 23*5 = 1123px — inside a chart column of roughly
 * 1004px and a fixed 158px height with `overflow-x: auto`. The horizontal
 * scrollbar that forced ate into the fixed height and produced a second,
 * vertical scrollbar; the bars were clipped between them.
 */
test("the chart row is laid out flat in its own single-column container", () => {
  // The chart markup has one child, the band row. A two-column template with
  // a fixed 190px first track put that row into the 190px track: 24 bands in a
  // strip the width of a label. The container must never regain a fixed
  // first track it has no occupant for.
  const timeline = styles.split("\n").find((line) => line.startsWith(".airport-timeline {"));
  assert.ok(timeline, "the timeline container rule must exist");
  assert.doesNotMatch(timeline, /grid-template-columns: *190px/, "no fixed label track for a child that does not exist");
  assert.doesNotMatch(styles, /\.airport-timeline \{[^}]*grid-template-columns: 190px/);
});

test("bands keep a readable minimum width and the row scrolls sideways instead of squeezing", () => {
  const bars = styles.split("\n").find((line) => line.startsWith(".airport-timeline-bars {"));
  assert.ok(bars);
  assert.match(bars, /grid-auto-columns: minmax\(44px, 1fr\)/, "a band narrower than its own value label is unreadable");
  assert.match(bars, /overflow-x: auto/, "24 official bands are kept; a narrow viewport scrolls, never drops or squeezes them");
  assert.doesNotMatch(bars, /flex: 1 0 42px/);
});

test("a fixed height is never combined with horizontal scrolling", () => {
  // This pairing is the exact cause of the nested vertical scrollbar: the
  // scrollbar consumes height the box was not given room for.
  const bars = styles.split("\n").find((line) => line.startsWith(".airport-timeline-bars {"));
  assert.match(bars, /height: auto/, "the scrolling row must not also have a fixed height");
  assert.match(styles, /\.airport-timeline-bars p \{ position: relative; min-width: 0; height: 158px/,
    "the band height lives on the bands themselves instead");
});

test("the current-time marker is drawn for today only and never rewrites past bands", () => {
  assert.match(signals, /summary\?\.dayRelation === "TODAY"/, "a past or future date has no 'now' inside it");
  assert.match(signals, /nowBandStart === row\.targetStartAt \? "now" : ""/);
  assert.match(signals, /data-now-label=/);
  for (const label of ["현재 시각", "当前时间", "現在時刻"]) assert.ok(signals.includes(label), `${label} must exist`);
  // The marker is a class and a pseudo-element; the bar itself is untouched,
  // so a band behind the marker keeps its forecast styling.
  assert.match(styles, /\.airport-timeline-bars p\.now::before/);
  assert.doesNotMatch(styles, /p\.now i \{/, "past bars must not be restyled as observations");
});

test("the content width system exists and is used rather than one page-wide cap", () => {
  for (const token of ["--w-narrow", "--w-standard", "--w-wide", "--gutter"]) {
    assert.ok(styles.includes(token), `${token} must be defined`);
  }
  assert.match(styles, /\.page-shell \{ max-width: var\(--w-wide\)/);
  assert.doesNotMatch(styles, /\.page-shell \{ max-width: 1280px/, "the fixed cap must be gone");
  // Prose keeps its own measure: widening the shell must not widen paragraphs.
  assert.match(styles, /\.hero h1 \{ max-width: 660px/);
});

test("the checkpoint list is collapsed by default behind a real button", () => {
  assert.match(signals, /const \[showAllCheckpoints, setShowAllCheckpoints\] = useState\(false\)/,
    "eight tall rows must not be the default state");
  assert.match(signals, /<button\s+type="button"\s+className="airport-checkpoint-toggle"/);
  assert.match(signals, /aria-expanded=\{showAllCheckpoints\}/);
  assert.match(signals, /aria-controls="airport-checkpoints-title"/);
  assert.match(styles, /\.airport-checkpoint-toggle:focus-visible \{ outline:/,
    "a keyboard user must be able to see the focused control");
  for (const label of ["전체 출국장 보기", "Show all checkpoints", "查看全部出境检查口", "すべての出国場を表示"]) {
    assert.ok(signals.includes(label), `${label} must exist`);
  }
});

test("the event line carries official period and distance, and omits what is missing", () => {
  assert.match(signals, /function formatEventPeriod/);
  assert.match(signals, /function formatEventDistance/);
  assert.match(signals, /\.filter\(Boolean\)\.join\(" · "\)/,
    "an absent official field must drop out rather than render empty");
  // Nothing about the event may be derived from its title. Comments discuss
  // that rule on purpose, so only executable lines are examined.
  const code = signals.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  assert.doesNotMatch(code, /inferCategory|describeEvent|guessEvent/i,
    "an event description may only come from official data");
});

test("event wording stays neutral about cause", () => {
  for (const causal of ["행사 때문에", "행사로 인해 사람이", "때문에 사람이 많"]) {
    assert.ok(!signals.includes(causal), `${causal} would claim causality the data cannot support`);
  }
});

test("Store Dynamics is a dedicated historical block with four-language limitations", () => {
  assert.match(signals, /data-signal-key="store-dynamics"/);
  assert.match(signals, /groupId === "past" && storeDynamicsPresentation/);
  for (const label of ["점포 현황", "Store openings and closures", "店铺开业与歇业", "店舗の開業・廃業"]) {
    assert.ok(signals.includes(label), `${label} must exist`);
  }
  for (const limitation of [
    "분기 기준 공식 과거 자료이며, 현재 영업 중인 점포의 실시간 수가 아닙니다.",
    "Official quarterly historical data, not a real-time count of stores currently operating.",
    "官方季度历史资料，并非当前营业店铺的实时数量。",
    "四半期基準の公式過去資料であり、現在営業中の店舗のリアルタイム件数ではありません。",
  ]) assert.ok(signals.includes(limitation), `${limitation} must exist`);

  const block = signals.match(/const storeDynamicsText = \{[\s\S]*?\n\} as const;/)?.[0] ?? "";
  for (const unsupported of [
    "좋은 상권", "나쁜 상권", "생존율", "폐업 위험", "성공 점수", "점포 품질", "미래 예측",
    "good area", "bad area", "survival rate", "closure risk", "success score", "store quality", "future prediction",
    "优质商圈", "劣质商圈", "存活率", "歇业风险", "成功评分", "店铺质量", "未来预测",
    "良い商圏", "悪い商圏", "生存率", "廃業リスク", "成功スコア", "店舗品質", "将来予測",
  ]) {
    assert.equal(block.includes(unsupported), false, `${unsupported} is unsupported judgement`);
  }
  for (const realtimeTerm of ["실시간", "real-time", "实时", "リアルタイム"]) {
    assert.equal(block.split(realtimeTerm).length - 1, 1,
      `${realtimeTerm} must appear only in the exact negative limitation`);
  }
  assert.match(signals, /timeState: signalStructureText\.timeState\.historical\[lang\]/);
  assert.match(signals, /<(\w+) lang="ko">\{presentation\.areaValue\}<\/\1>/,
    "official Korean geography keeps its source language for assistive technology");
  // The spreadsheet grid is gone: no cell-per-field grid, and the one rule
  // left is the divider before the quarter's change.
  for (const gridClass of ["store-dynamics-counts", "store-dynamics-changes", "store-dynamics-context"]) {
    assert.equal(signals.includes(gridClass), false, `${gridClass} was the table layout and must be gone`);
    assert.equal(styles.includes(gridClass), false, `${gridClass} styles must be gone`);
  }
  assert.match(styles, /\.store-dynamics-total > strong \{[^}]*font-size: clamp\(/,
    "the total is the headline, set by type size rather than by a bordered cell");
});

/**
 * The event card shows the provider's category name, period, place, distance
 * and an accessible complete stored description — and nothing the product
 * made up.
 */
test("the event card leads with official fields and exposes the complete description", () => {
  assert.match(signals, /\[event\.categoryName, event\.title\]\.filter\(Boolean\)\.join\(" · "\)/,
    "category then title, and no category means no placeholder");
  assert.match(signals, /formatEventPlace\(event\)/, "the place line is the official address");
  assert.match(signals, /<details>/, "the complete stored overview is available on demand");
  assert.match(signals, /<p className="event-overview">\{event\.overview\}<\/p>/);
  assert.match(signals, /safeOfficialEventHomepage\(event\.homepage\)/);
  assert.match(signals, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(styles, /-webkit-line-clamp:\s*[1-9]/,
    "a line clamp must not be the only path to official event text");
  assert.match(signals, /signalStructureText\.eventAll\[lang\]\(events\.length\)/,
    "the disclosure promises exactly the event cards present in the payload");
  assert.match(signals, /nextEventCategory: block\?\.events\?\.\[0\]\?\.categoryName \?\? null/,
    "the brief names the category from the same stored field");
});

/**
 * Display headings do not end in a full stop.
 *
 * A headline is a sign, not a sentence: "숫자 하나가 무슨 뜻인지부터." reads as
 * a fragment that trailed off, while the same words without the stop read as a
 * title. This scans every h1-h4 literal in all four locales, so the rule holds
 * for Korean and Japanese (. and 。) as well as English and Chinese.
 *
 * Body prose is deliberately NOT covered: disclaimers, methodology and source
 * notes are sentences and keep their punctuation.
 */
const HEADING_BLOCK = /<(h[1-4])[^>]*>([\s\S]{0,600}?)<\/\1>/g;
const LOCALE_STRING = /(ko|en|zh|ja):\s*"((?:[^"\\]|\\.)*)"/g;

test("no display heading ends in a terminal period, in any locale", () => {
  const offenders = [];
  for (const file of ["app/retailpulse-app.tsx", "app/live-signals.tsx", "app/not-found.tsx"]) {
    const source = readFileSync(file, "utf8");
    for (const block of source.matchAll(HEADING_BLOCK)) {
      for (const localized of block[2].matchAll(LOCALE_STRING)) {
        if (/[.。]$/.test(localized[2])) offenders.push(`${file} <${block[1]}> ${localized[1]}: ${localized[2]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "headings must read as titles, not as trailing-off sentences");
});

test("body prose keeps its punctuation — the rule is about headings only", () => {
  // A guard on the guard: if the rule were applied mechanically to all copy,
  // the limitation and source lines would lose their full stops too, and that
  // is exactly what must not happen.
  assert.match(signals, /현재 영업 중인 점포의 실시간 수가 아닙니다\./);
});

/**
 * Perceptual neutrality, not just #FFFFFF.
 *
 * The owner checked the real phone screen: the empty background pixels were
 * already white, and the page still felt warm. A background token cannot fix
 * that, because the cast comes from what sits ON the white — an ochre
 * informational line tints the whole surface by contrast even when every
 * background pixel is pure. So this scans the palette itself rather than
 * asserting one colour.
 */
function warmColours(css) {
  const found = [];
  for (const match of css.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
    const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
    const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    // A clearly warm cast: red well ahead of blue. A saturated alert red is
    // allowed and excluded here — it is a state a person must act on.
    const isAlertRed = r > 200 && g < 120 && b < 120;
    if (r - b >= 12 && !isAlertRed) found.push({ colour: match[0], r, g, b });
  }
  return found;
}

test("the palette is cold and neutral — no beige, ochre or warm grey", () => {
  const warm = warmColours(styles).filter((entry) => entry.colour.toLowerCase() !== "#b22d35");
  assert.deepEqual(warm, [], "a warm colour tints the whole page even on a pure-white ground");
  // The neutral system is spelled out, so a later change has to be deliberate.
  assert.match(styles, /--ink:\s*#111111/);
  assert.match(styles, /--muted:\s*#666666/);
  assert.match(styles, /--line:\s*#e5e5e5/);
  assert.match(styles, /--paper:\s*#ffffff/);
  assert.equal(styles.includes("--amber"), false, "the warm token is gone, so it cannot be reused");
  assert.doesNotMatch(styles, /backdrop-filter\s*:/,
    "modal overlays stay neutral and must not blur the product behind them");
});

test("ordinary missing-data and stale states are neutral, not alarms", () => {
  // "저장된 운항 기록 없음" is an ordinary empty state. In ochre it read as a
  // warning about something the reader had done wrong.
  assert.match(styles, /\.date-scope-note \{[^}]*color: var\(--muted\)/);
  // Stale keeps its prominence through weight, not through hue.
  assert.match(styles, /\.signal-stale \{[^}]*color: var\(--ink\)[^}]*font-weight: var\(--weight-strong\)/);
});

/**
 * 공항 페이지의 정보 순서, 그리고 예보가 관측인 척하지 않게 하는 것.
 *
 * 원래 이 검사는 "관측 섹션이 예보 섹션보다 위" 를 강제했다. 예보가 위에
 * 있으면 읽는 사람이 그걸 지금 벌어지는 일로 읽기 때문이다.
 *
 * 2026-09-04, 소유자 요청으로 검색대 상세 표를 맨 아래로 내렸다("잘 안 봐").
 * 그래서 섹션 순서만으로는 그 걱정을 막지 못한다. 대신 진짜로 지키는 두 가지를
 * 강제한다:
 *   1. 맨 위 요약이 관측으로 시작한다 — 지금 대기가 가장 긴 곳.
 *   2. 예보에서 나온 모든 값이 자기 입으로 예보라고 말한다.
 * 표를 내린 것이지 지운 것이 아니다. 구역·대기 인원·관측 시각은 그대로 있다.
 */
test("공항 페이지는 요약 → 다음 → 구성 → 관측 표 순서로 읽힌다", () => {
  const summary = signals.match(/export function AirportTodaySummary[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(summary.length > 0);
  const at = (needle) => summary.indexOf(needle);
  const brief = at('className="current-brief airport-current-brief"');
  const grid = at('className="airport-today-grid"');
  const forecast = at('airport-detail-section airport-forecast');
  const composition = at('className="airport-composition"');
  const checkpoints = at('airport-detail-section airport-checkpoints');
  for (const [name, index] of [["brief", brief], ["grid", grid], ["forecast", forecast], ["composition", composition], ["checkpoints", checkpoints]]) {
    assert.ok(index > -1, `${name} 섹션이 있어야 한다`);
  }
  assert.ok(brief < grid, "지금 요약이 가장 먼저");
  assert.ok(grid < forecast, "예보 차트는 자기가 설명하는 격자 바로 아래");
  assert.ok(forecast < composition, "구성/이유는 예보 다음");
  assert.ok(composition < checkpoints, "검색대 상세 표는 참고 자료라 마지막");
  // 게이트·항공사·등록 국가는 최상위로 흩어지지 않고 한 탭 묶음 안에 있다.
  assert.ok(at('className="airport-composition-tabs"') > composition);
  assert.ok(at('className="airport-composition-panel airport-gates"') > composition);
  assert.ok(at('className="airport-composition-panel airport-airlines"') > composition);
  assert.ok(at('className="airport-composition-panel airport-countries"') > composition);
  // 표를 내렸을 뿐, 내용은 그대로다.
  assert.ok(summary.includes("airportTodayText.waitLabel[lang]"), "대기 시간은 그대로 있어야 한다");
  assert.ok(summary.includes("airportTodayText.peopleLabel[lang]"), "대기 인원은 그대로 있어야 한다");
  assert.ok(summary.includes('formatHumanFreshness(row.observedAt, nowIso, lang, "observed")'), "관측 시각은 그대로 있어야 한다");
});

/**
 * 요약은 지금 시간대 출국객으로 열고, 예보는 예보라고 말한다.
 *
 * 2026-09-04 소유자 검토: 예전 첫 줄은 "지금 …에서 대기가 가장 긴 곳은
 * …, 16분입니다" 였다. 길고 굵어서 검색대 줄 하나가 이 화면에서 가장
 * 중요한 사실처럼 보였는데, 사실이 아니다. 공항 매장 근무자가 근무를
 * 계획하는 숫자는 "지금 이 시간대에 공항이 공식으로 예상하는 출국객"
 * 이다. 그래서 그게 첫 줄이 되고, 대기는 짧은 보조 줄로 내려갔다.
 *
 * 예보가 관측인 척하지 않게 하는 장치는 그대로다: 예보에서 나온 값은
 * 네 언어 모두 "공식 예상" 이라고 말한다.
 */
test("요약은 지금 시간대 공식 예상 출국객으로 열고, 대기는 보조 줄로 내려간다", () => {
  const localize = signals.match(/function localizeAirportBrief\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(localize.length > 0);

  // 줄 순서가 코드로 고정되어 있다: 지금 시간대 → 증감 → 대기 → 운항 → 남은 예상.
  assert.match(localize, /\[nowLine, trendLine, waitLine, flightsLine, restLine\]/,
    "지금 시간대 값이 첫 줄이어야 한다");
  // 지금 시간대가 없는 날짜(과거·미래)에는 피크가 대신 열고, 대기가 열지 않는다.
  assert.match(localize, /\[peakLine, waitLine, flightsLine, restLine\]/,
    "지금 시간대가 없어도 요약이 대기로 시작하면 안 된다");

  // 예보에서 나온 값은 스스로 예보라고 말한다.
  assert.ok(localize.includes("공식 예상 출국객"), "지금 시간대 값은 공식 예상이라고 말해야 한다");
  assert.ok(localize.includes("오늘 피크"), "피크 값도 함께 제시되어야 한다");

  // 길이: 첫 줄은 숫자를 앞세운 짧은 구절이지 문장이 아니다.
  // 주석은 왜 바뀌었는지 설명하느라 옛 문구를 인용하므로, 실제로 화면에
  // 나가는 문자열만 본다.
  const rendered = localize.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/대기가 가장 긴 곳은/.test(rendered),
    "검색대 대기를 긴 문장으로 강조하던 옛 문구가 남아 있으면 안 된다");
  assert.ok(!/가 오늘 피크입니다/.test(rendered),
    "읽고 지나가야 하는 서술문 대신 요점만 남아야 한다");
  assert.ok(!/입니다/.test(rendered),
    "요약 줄은 서술문이 아니라 요점이어야 한다");
});

/**
 * 공식 등록 자료 ≠ 실시간 입점 현황.
 *
 * 소유자가 실제로 겪은 일: 이미 퇴점한 화장품 매장이 여전히 공식 자료에
 * 남아 있었다. 데이터셋 15095064 는 공항공사의 등록 대장이지 임차 현황
 * 실시간 피드가 아니다. 기존에도 안내 문구는 있었지만 "그냥 지나치기
 * 쉽다"는 보고가 있어, 필터 위에 항상 보이는 자리로 올렸다.
 *
 * KORETAIL 은 소유자가 근무지에서 아는 사실을 공개 데이터에 덮어쓰지
 * 않는다. 특정 매장을 코드로 지우는 대신, 자료의 성격을 밝힌다.
 */
test("시설 디렉터리는 공식 등록 자료임을 필터 위에서 먼저 밝힌다", () => {
  const block = signals.match(/const facilityText = \{[\s\S]*?\n\} as const;/)?.[0]
    ?? signals.match(/const facilityText = \{[\s\S]*?\n\};/)?.[0] ?? "";
  assert.ok(block.length > 0);

  // 네 언어 모두 "실시간 입점 현황이 아니다" 를 말한다.
  for (const phrase of ["실시간 입점 현황 아님", "not live tenancy", "非实时入驻状况", "リアルタイムの入居状況ではありません"]) {
    assert.ok(block.includes(phrase), `${phrase} 가 있어야 한다`);
  }
  // 퇴점 매장이 남을 수 있다는 사실도 같은 자리에 있다.
  assert.ok(block.includes("이미 퇴점한 매장이 표시될 수 있습니다"));
  // 공급자가 변경일을 주지 않는다는 사실을 수집 시각으로 대체하지 않는다.
  assert.ok(block.includes("공급자가 개별 시설의 실제 변경일은 제공하지 않습니다"));

  // 필터보다 먼저 렌더링된다: 툴팁도, 더보기도, 푸터도 아니다.
  const basis = signals.indexOf('className="facility-basis"');
  const filters = signals.indexOf('className="facility-filters"');
  const list = signals.indexOf('className="facility-list"');
  assert.ok(basis > 0 && filters > 0 && list > 0);
  assert.ok(basis < filters, "근거는 필터보다 먼저 보여야 한다");
  assert.ok(basis < list, "근거는 결과보다 먼저 보여야 한다");
});

/**
 * 등록 자료를 "지금 영업 중"으로 부르지 않는다.
 *
 * 등록 대장은 그 매장이 지금 존재하는지도, 문을 열었는지도 증명하지
 * 못한다. 그렇게 읽히는 라벨을 금지한다.
 */
test("시설을 현재 영업/입점 상태로 부르지 않는다", () => {
  const block = signals.match(/const facilityText = \{[\s\S]*?\n\} as const;/)?.[0]
    ?? signals.match(/const facilityText = \{[\s\S]*?\n\};/)?.[0] ?? "";
  assert.ok(block.length > 0);
  for (const forbidden of ["현재 입점", "현재 영업", "운영 중", "영업 중입니다", "현재 매장"]) {
    assert.ok(!block.includes(forbidden), `"${forbidden}" 은 등록 자료가 증명하지 못하는 상태다`);
  }
  // 영업시간은 언제나 "공식 영업시간 기준" 으로만 말한다.
  assert.ok(block.includes("공식 영업시간 기준"));
});

/**
 * 매장을 저장해도 한계는 사라지지 않는다.
 *
 * 내 매장 브리핑은 인쇄되어 다른 사람 손에 넘어간다. 종이에서는 화면의
 * 안내를 볼 수 없으므로, 근거가 브리핑 안에 함께 있어야 한다.
 */
test("선택한 매장과 인쇄물에도 같은 근거가 남는다", () => {
  const snapshot = signals.match(/function MyStoreSnapshot\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(snapshot.length > 0);
  assert.ok(snapshot.includes('className="facility-basis"'),
    "저장한 매장에도 같은 근거 블록이 있어야 한다");
  assert.ok(snapshot.includes("facilityText.staleness[lang]"));
  // 인쇄 범위 안에 있다: 근거 블록이 .my-store-brief 안쪽에 있어야 한다.
  const brief = snapshot.indexOf('className="my-store-brief"');
  const basis = snapshot.indexOf('className="facility-basis"');
  assert.ok(brief > -1 && basis > brief, "근거는 인쇄되는 영역 안에 있어야 한다");
});

/**
 * 특정 매장을 코드로 지우지 않는다.
 *
 * 소유자는 근무지에서 어떤 매장이 이미 없다는 것을 알 수 있다. 그런 사적
 * 지식을 공개 데이터 위에 덮어쓰면 KORETAIL 은 더 이상 공공 데이터로
 * 검증 가능한 제품이 아니게 되고, 근무지 내부 정보를 공개 저장소에
 * 옮겨 적는 일이 된다. 공개적으로 확인 가능한 공식 근거가 나오기
 * 전까지는, 기록을 그대로 보여주고 한계를 밝힌다.
 */
test("사적 지식으로 특정 시설을 숨기거나 지우지 않는다", () => {
  for (const source of [signals, styles]) {
    // 공개 소스에 근무지·특정 브랜드를 지목한 로직이나 설명이 남으면
    // 안 된다. 공식 자료에 실려 오는 매장 이름은 데이터이지 코드가 아니다.
    assert.ok(!/신라|Shilla|SHILLA/.test(source),
      "특정 브랜드를 이름으로 지목한 코드나 주석이 있으면 안 된다");
  }
  // 시설을 이름/브랜드로 제외하는 하드코딩 목록이 없어야 한다.
  assert.ok(!/(HIDDEN|BLOCKED|EXCLUDED|CLOSED)_FACILIT/i.test(signals));
});

/**
 * 오늘 출발편 구성은 한 부모와 동등한 세 보기다. 예전처럼 공통 96px
 * section head를 부모와 자식에 연속 적용하면 실제 행까지 큰 빈 띠가
 * 다시 생기므로 구성 전용 head/panel만 허용한다.
 */
test("오늘 출발편 구성은 반복 머리말 없이 세 탭을 품는 한 묶음이다", () => {
  const summary = signals.match(/export function AirportTodaySummary[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(summary, /className="airport-composition"/);
  assert.match(summary, /role="tablist"/);
  assert.match(summary, /\["gates", "airlines", "countries"\]/);
  assert.match(summary, /role="tabpanel"/);
  assert.match(summary, /aria-selected=\{compositionView === view\}/);
  assert.match(summary, /event\.key === "ArrowRight"/);
  assert.match(summary, /event\.key === "ArrowLeft"/);
  assert.match(summary, /event\.key === "Home"/);
  assert.match(summary, /event\.key === "End"/);
  assert.doesNotMatch(summary, /PHYSICAL DEPARTURES|OPERATING AIRLINES|airlinesJump|airport-jump-link/);

  // 단일 터미널에서는 행마다 같은 terminal을 반복하지 않는다.
  assert.match(summary, /isAll && row\.terminal/);
  // 제목·설명·panel은 min-height가 없는 전용 규칙이고, 넓은 화면에서도
  // 행의 의미 단위가 860px 안에 머문다.
  assert.match(styles, /\.airport-composition-head \{[^}]*width: min\(100%, 860px\)/);
  assert.match(styles, /\.airport-composition-panel \{[^}]*width: min\(100%, 860px\)/);
  assert.doesNotMatch(styles, /\.airport-composition-(?:head|panel) \{[^}]*min-height:/);
});

test("항공사 등록 국가는 승객 국적으로 보이지 않는다", () => {
  for (const phrase of [
    "항공사 등록 국가별 운항편", "등록 국가 미확인",
    "승객의 국적이 아닙니다", "not passenger nationality",
    "并非旅客国籍", "旅客の国籍ではありません",
  ]) assert.ok(signals.includes(phrase), `${phrase} 가 있어야 한다`);
  assert.ok(!signals.includes("승객 국적별 운항편"));
  assert.ok(!signals.includes("국적별 운항편"));
});

/**
 * 예보 차트는 읽는 사람이 서 있는 시간대에서 열린다.
 *
 * 막대가 가로로 스크롤되고 하루가 휴대폰 화면에 다 안 들어가서, 차트는
 * 늘 00:00 에서 열렸다. 17:27 에 보는 사람은 새벽 시간대를 보고 직접
 * 끌어야 자기 시간을 찾았다 — 그 한 시간대가 차트가 존재하는 이유인데.
 *
 * scrollIntoView 가 아니라 scrollLeft 를 쓴다. 전자는 페이지까지 같이
 * 스크롤해서 방금 읽던 요약에서 사용자를 끌어내린다.
 */
test("예보 차트는 현재 시간대로 가로 스크롤해서 열린다", () => {
  // 구조 분해 매개변수의 닫는 중괄호는 "\n}: {" 라서, 함수 자체가 닫히는
  // "\n}\n" 까지 읽는다.
  const chart = signals.match(/function AirportForecastChart\([\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(chart.length > 0, "차트가 자기 컴포넌트여야 훅을 가질 수 있다");
  assert.match(chart, /bars\.scrollLeft = Math\.max\(0,/);
  assert.match(chart, /querySelector<HTMLElement>\("p\.now"\)/);
  assert.ok(!/scrollIntoView/.test(chart),
    "scrollIntoView 는 페이지까지 스크롤해서 읽던 자리를 잃게 만든다");
  // 오늘이 아니면 현재 시간대가 없으므로 아무것도 하지 않는다.
  assert.match(chart, /if \(!bars \|\| !nowBandStart\) return;/);
});
