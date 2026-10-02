"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { FLOW_HOURS, flowLayout, type FlowBand } from "../lib/airport-flow-geometry";
import { REVEAL_MS, reducedMotion, tween } from "../lib/motion";
// Styles live in app/airport-visual.css, imported once by
// app/airport-departure-overview.tsx (always in the app bundle). Importing it
// here too would break the node tests that load live-signals.tsx.

/**
 * The hour-by-hour shape of the day's official forecast, drawn as one figure
 * over the whole KST day: a line through the hourly bands, the area under it,
 * the peak marked, and today's exact minute as a rule with its time. It
 * replaces the strip of 24 bars that scrolled sideways on a phone.
 *
 * What it does not do: it draws only the bands the airport published, so a
 * gap in coverage is a gap in the line; it never smooths across hours that
 * have no value; and the rule exists only when the caller found a band that
 * contains the present minute, which it does for TODAY alone.
 *
 * Motion: when the data arrives the line draws itself and the area fades in
 * over one reveal. Readers who asked for less motion see the finished figure.
 */
export function AirportFlowFigure({ timeline, peakStartAt, nowBandStart, nowBandProgress, nowLabel, numberLocale, label }: {
  timeline: FlowBand[];
  peakStartAt: string | null;
  nowBandStart: string | null;
  nowBandProgress: number | null;
  nowLabel: string;
  numberLocale: string;
  label: string;
}) {
  const figureRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(720);
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (!figure || typeof ResizeObserver === "undefined") return;
    const measure = () => setWidth(Math.max(240, Math.round(figure.clientWidth - 32)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);
  const height = width < 560 ? 190 : 220;
  const layout = useMemo(() => flowLayout({ timeline, width, height, peakStartAt, nowBandStart, nowBandProgress }),
    [timeline, width, height, peakStartAt, nowBandStart, nowBandProgress]);

  // Reveal once per data set. Inline styles are set and cleared by hand so a
  // re-render (a resize, the clock moving the rule) never leaves a half-drawn
  // line behind, and reduced motion skips all of it.
  const lineRefs = useRef<Array<SVGPathElement | null>>([]);
  const areaRef = useRef<SVGGElement | null>(null);
  const marksRef = useRef<SVGGElement | null>(null);
  const signature = timeline.map((band) => `${band.targetStartAt}:${band.expectedPassengers}`).join("|");
  useLayoutEffect(() => {
    const lines = lineRefs.current.filter((line): line is SVGPathElement => Boolean(line));
    const area = areaRef.current, marks = marksRef.current;
    if (reducedMotion() || lines.length === 0) return;
    const lengths = lines.map((line) => line.getTotalLength());
    const paint = (progress: number) => {
      lines.forEach((line, index) => {
        line.style.strokeDasharray = `${lengths[index]}`;
        line.style.strokeDashoffset = `${lengths[index] * (1 - progress)}`;
      });
      if (area) area.style.opacity = String(progress);
      if (marks) marks.style.opacity = String(Math.max(0, (progress - 0.55) / 0.45));
    };
    const settle = () => {
      lines.forEach((line) => { line.style.strokeDasharray = ""; line.style.strokeDashoffset = ""; });
      if (area) area.style.opacity = "";
      if (marks) marks.style.opacity = "";
    };
    paint(0);
    const cancel = tween(REVEAL_MS, paint, settle);
    return () => { cancel(); settle(); };
  }, [signature]);

  const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const people = (value: number) => Math.round(value).toLocaleString(numberLocale);
  // The time label is centred on the rule and pulled inside the figure near
  // either edge, so 23:59 does not hang off the right-hand side.
  const nowAnchor = layout.now ? (layout.now.x < layout.left + 60 ? "start" : layout.now.x > layout.right - 60 ? "end" : "middle") : "middle";
  const peakLabelY = layout.peak ? Math.max(layout.top - 10, layout.peak.y - 10) : 0;

  return <figure className="av-figure airport-flow" ref={figureRef} role="group" aria-label={label} data-bands={layout.bands.length}>
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="false" role="img" aria-label={label}
      data-day-left={layout.left} data-day-width={layout.right - layout.left}>
      <g ref={areaRef}>
        {layout.segments.map((segment, index) => <path key={`area-${index}`} className="airport-flow-area" d={segment.area} />)}
      </g>
      {layout.segments.map((segment, index) => <path key={`line-${index}`} className="airport-flow-line" d={segment.line}
        ref={(element) => { lineRefs.current[index] = element; }} />)}
      <line className="av-rule" x1={layout.left} x2={layout.right} y1={layout.base} y2={layout.base} />
      <g className="airport-flow-hours">
        {layout.ticks.map((tick) => <g key={tick.hour}>
          <line className="av-rule" x1={tick.x} x2={tick.x} y1={layout.base} y2={layout.base + 4} />
          <text x={tick.x} y={layout.base + 18} textAnchor={tick.hour === FLOW_HOURS[0] ? "start" : tick.hour === FLOW_HOURS.at(-1) ? "end" : "middle"}>{String(tick.hour).padStart(2, "0")}</text>
        </g>)}
      </g>
      <g ref={marksRef}>
        {layout.peak && <g className="airport-flow-peak" data-start={layout.peak.start}>
          <circle cx={layout.peak.x} cy={layout.peak.y} r={4} />
          <text x={layout.peak.x} y={peakLabelY} textAnchor={layout.peak.x > layout.right - 48 ? "end" : layout.peak.x < layout.left + 48 ? "start" : "middle"}>{people(layout.peak.value)}</text>
        </g>}
        {layout.now && <g className="airport-flow-now-group">
          <line className="av-now airport-flow-now" x1={layout.now.x} x2={layout.now.x} y1={layout.top - 14} y2={layout.base} data-now-label={nowLabel} />
          <text className="airport-flow-now-label" x={layout.now.x} y={layout.top - 20} textAnchor={nowAnchor}>{nowLabel}</text>
        </g>}
      </g>
      {/* One hit area per published band, for a pointer or a keyboard. */}
      {layout.bands.map((band) => <rect key={band.start} className={["airport-flow-band", band.now ? "now" : "", band.peak ? "peak" : ""].filter(Boolean).join(" ")}
        x={band.x} y={layout.top} width={band.width} height={layout.base - layout.top} tabIndex={0}
        data-start={band.start} aria-label={`${clock(band.start)}–${clock(band.end)} KST · ${people(band.value)}`}>
        <title>{`${clock(band.start)}–${clock(band.end)} KST · ${people(band.value)}`}</title>
      </rect>)}
    </svg>
  </figure>;
}
