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

test("Seoul uses airport arrivals only as a leading reference signal", () => {
  for (const wording of ["예상 입국객", "입국 예상", "공식 예상"]) {
    assert.ok(signals.includes(wording), `${wording} must exist as forecast wording`);
  }
  assert.match(signals, /서울 소비 수요의 선행 참고 신호/);
  assert.match(signals, /실제 서울 방문객 수 아님/);
  const claims = signals.split("\n").filter((line) =>
    /실제 입국객|현재 입국객|실측 입국객/.test(line)
    && !/아님|ではありません|not actual|非实际/.test(line));
  assert.deepEqual(claims, [], "airport arrival forecasts must never read as observed arrivals");
  assert.doesNotMatch(signals, /입국객[^\n]*명동에 유입/,
    "airport arrivals must never be asserted as Myeongdong visitors");
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
});

test("ordinary missing-data and stale states are neutral, not alarms", () => {
  // "저장된 운항 기록 없음" is an ordinary empty state. In ochre it read as a
  // warning about something the reader had done wrong.
  assert.match(styles, /\.date-scope-note \{[^}]*color: var\(--muted\)/);
  // Stale keeps its prominence through weight, not through hue.
  assert.match(styles, /\.signal-stale \{[^}]*color: var\(--ink\)[^}]*font-weight: var\(--weight-strong\)/);
});
