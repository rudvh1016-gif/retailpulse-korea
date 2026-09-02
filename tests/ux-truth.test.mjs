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

/**
 * The chart used to be laid out as 24 bands of `flex: 1 0 42px` with a 5px
 * gap — at least 24*42 + 23*5 = 1123px — inside a chart column of roughly
 * 1004px and a fixed 158px height with `overflow-x: auto`. The horizontal
 * scrollbar that forced ate into the fixed height and produced a second,
 * vertical scrollbar; the bars were clipped between them.
 */
test("the hourly chart cannot reintroduce a minimum width it must overflow", () => {
  const bars = styles.slice(styles.indexOf(".airport-timeline-bars {"));
  assert.doesNotMatch(bars.slice(0, 400), /flex: 1 0 42px|min-width: 42px/,
    "a rigid per-band basis is what overflowed the column");
  assert.match(bars.slice(0, 400), /grid-auto-columns: minmax\(0, 1fr\)/,
    "shrinkable columns have no minimum width to overflow");
});

test("a fixed height is never combined with horizontal scrolling", () => {
  // This pairing is the exact cause of the nested vertical scrollbar: the
  // scrollbar consumes height the box was not given room for.
  const mobileRule = styles.split("\n").find((line) => line.includes("grid-auto-columns: minmax(38px, 1fr)"));
  assert.ok(mobileRule, "the mobile chart rule must exist");
  assert.match(mobileRule, /overflow-x: auto/);
  assert.match(mobileRule, /height: auto/,
    "the scrollable mobile chart must not also have a fixed height");
  assert.match(styles, /\.airport-timeline-bars p \{ height: 145px; \}/,
    "the band height moves onto the bands themselves instead");
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
