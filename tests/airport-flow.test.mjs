import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FLOW_HOURS, flowLayout, kstDayStart } from "../lib/airport-flow-geometry.ts";

const band = (hour, value, day = "2026-08-31") => ({
  targetStartAt: `${day}T${String(hour).padStart(2, "0")}:00:00+09:00`,
  targetEndAt: hour === 23 ? `2026-09-01T00:00:00+09:00` : `${day}T${String(hour + 1).padStart(2, "0")}:00:00+09:00`,
  expectedPassengers: value,
});
const fullDay = Array.from({ length: 24 }, (_, hour) => band(hour, 1000 + hour * 100));
const WIDTH = 728, HEIGHT = 220;
const plot = (layout) => layout.right - layout.left;

test("the axis is the whole KST day: midnight to midnight, whatever the bands cover", () => {
  assert.equal(kstDayStart("2026-08-31T14:00:00+09:00"), Date.parse("2026-08-31T00:00:00+09:00"));
  assert.equal(kstDayStart("2026-08-31T23:30:00Z"), Date.parse("2026-09-01T00:00:00+09:00"), "23:30Z is already the next KST day");
  const layout = flowLayout({ timeline: fullDay, width: WIDTH, height: HEIGHT, peakStartAt: null, nowBandStart: null, nowBandProgress: null });
  assert.deepEqual(layout.ticks.map((tick) => tick.hour), [...FLOW_HOURS]);
  assert.equal(layout.ticks[0].x, layout.left);
  assert.equal(layout.ticks.at(-1).x, layout.right);
  assert.equal(layout.bands.length, 24);
  assert.equal(layout.bands.at(-1).x + layout.bands.at(-1).width, layout.right, "the 23:00 band ends at the right edge, 24:00");
  assert.equal(layout.segments.length, 1, "24 contiguous bands are one line");
});

test("two published bands are a short stretch of line, not a line across the whole day", () => {
  const timeline = [band(14, 5110), band(15, 6320)];
  const layout = flowLayout({ timeline, width: WIDTH, height: HEIGHT, peakStartAt: null, nowBandStart: null, nowBandProgress: null });
  assert.equal(layout.segments.length, 1);
  const xs = [...layout.segments[0].line.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(xs[0] - (layout.left + plot(layout) * 14 / 24)) < 0.2, "the line starts at 14:00");
  assert.ok(Math.abs(xs.at(-1) - (layout.left + plot(layout) * 16 / 24)) < 0.2, "and ends at 16:00");
  assert.equal(layout.bands.length, 2);
});

test("a gap in coverage breaks the line instead of being drawn across", () => {
  const timeline = [band(6, 900), band(7, 1200), band(10, 2000), band(11, 2100)];
  const layout = flowLayout({ timeline, width: WIDTH, height: HEIGHT, peakStartAt: null, nowBandStart: null, nowBandProgress: null });
  assert.equal(layout.segments.length, 2, "06–08 and 10–12 are two runs");
  for (const segment of layout.segments) assert.match(segment.area, /Z$/);
});

test("the current-time rule sits at the exact minute and exists only when the caller found a band", () => {
  const timeline = [band(14, 5110), band(15, 6320)];
  const at1410 = flowLayout({ timeline, width: WIDTH, height: HEIGHT, peakStartAt: null, nowBandStart: timeline[0].targetStartAt, nowBandProgress: 10 / 60 });
  assert.ok(at1410.now, "a now band gives a rule");
  const expected = at1410.left + plot(at1410) * (14 + 10 / 60) / 24;
  assert.ok(Math.abs(at1410.now.x - expected) < 0.2, `rule at 14:10 → ${at1410.now.x} vs ${expected}`);
  assert.equal(at1410.bands[0].now, true);
  assert.equal(at1410.bands[1].now, false);
  const past = flowLayout({ timeline, width: WIDTH, height: HEIGHT, peakStartAt: null, nowBandStart: null, nowBandProgress: null });
  assert.equal(past.now, null, "a past or future day has no rule, and no band is 'now'");
  assert.ok(past.bands.every((row) => !row.now));
});

test("the peak is the band the summary named, marked once, at the top of its own value", () => {
  const timeline = fullDay;
  const layout = flowLayout({ timeline, width: WIDTH, height: HEIGHT, peakStartAt: timeline[23].targetStartAt, nowBandStart: null, nowBandProgress: null });
  assert.ok(layout.peak);
  assert.equal(layout.peak.value, 3300);
  assert.equal(layout.peak.y, layout.top, "the largest band touches the top of the plot");
  assert.equal(layout.bands.filter((row) => row.peak).length, 1);
  assert.equal(layout.base - layout.top >= 110, true, "the rule has room to be seen on a phone (≥110px) at this height");
});

test("the figure is drawn with strokes and fills, never a CSS border on an empty box", () => {
  const figure = readFileSync(new URL("../app/airport-flow-figure.tsx", import.meta.url), "utf8");
  const visual = readFileSync(new URL("../app/airport-visual.css", import.meta.url), "utf8");
  assert.match(figure, /<line className="av-now airport-flow-now"[^>]*data-now-label=\{nowLabel\}/s, "the rule is an SVG line carrying its own label");
  assert.match(figure, /ResizeObserver/, "the figure measures its width instead of scrolling sideways");
  assert.match(figure, /tabIndex=\{0\}[\s\S]*aria-label=\{`\$\{clock\(band\.start\)\}–\$\{clock\(band\.end\)\} KST/, "each band is reachable by keyboard with its hours and value");
  assert.match(visual, /\.av-now \{[^}]*stroke: var\(--slate\)[^}]*stroke-width: 1\.5/);
  assert.doesNotMatch(visual, /border-left/, "no bordered zero-width marker: WebKit did not paint that");
  assert.doesNotMatch(figure, /from ["']gsap["']/);
});
