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
    "신한카드 내국인 소비 기준 · 전수 매출 아님",
    "Shinhan Card domestic-consumer activity · not total sales",
    "基于新韩卡韩国境内消费者活动 · 非全量销售额",
    "新韓カードの国内消費者活動基準 · 売上全数ではありません",
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
    "최근 역 승하차 흐름", "Recent station boarding and alighting",
    "近期地铁站进出站客流", "最近の駅乗降動向",
    "실시간·고유 방문객·상권 방문객 수 아님",
    "not real-time, unique people, or commercial-area visitors",
  ]) assert.ok(signals.includes(phrase), `${phrase} must remain visible`);
  const areaSignals = signals.match(/export default function LiveSignals[\s\S]*?\nconst flightBoardText/)?.[0] ?? "";
  const subwayBlock = areaSignals.match(/if \(block\?\.subwayRidership\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(subwayBlock, /subway\.referenceDate/);
  assert.match(subwayBlock, /subway\.alightingCount/);
  assert.match(subwayBlock, /subway\.boardingCount/);
  assert.doesNotMatch(subwayBlock, /visitor count|방문객 수.*\$\{|LIVE|realtime/i);
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

/**
 * The event card shows the provider's category name, period, place, distance
 * and at most two lines of the provider's own description — and nothing the
 * product made up.
 */
test("the event card leads with the official category and clamps the official description", () => {
  assert.match(signals, /\[nextEvent\.categoryName, nextEvent\.title\]\.filter\(Boolean\)\.join\(" · "\)/,
    "category then title, and no category means no placeholder");
  assert.match(signals, /formatEventPlace\(nextEvent\)/, "the place line is the official address");
  assert.match(signals, /detail: nextEvent\.overview \?\? undefined/, "the description is the stored official overview or nothing");
  assert.match(signals, /\{row\.detail && <em className="live-signal-detail">\{row\.detail\}<\/em>\}/);
  assert.match(styles, /\.live-signal-rows \.live-signal-detail \{[^\n]*-webkit-line-clamp: 2/, "two lines, never a wall of text");
  assert.match(signals, /nextEventCategory: block\?\.events\?\.\[0\]\?\.categoryName \?\? null/,
    "the brief names the category from the same stored field");
});
