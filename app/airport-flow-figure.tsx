"use client";
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FLOW_HOURS, flowLayout, type FlowBand } from "../lib/airport-flow-geometry";
import { REVEAL_MS, reducedMotion, tween } from "../lib/motion";
import type { Lang } from "./retailpulse-data";
// Styles live in app/airport-visual.css, imported once by app/retailpulse-app.tsx
// (always in the app bundle). Importing it here would break the node tests that
// load live-signals.tsx.

/**
 * The hour-by-hour shape of the day's official forecast, drawn as the sky a
 * reader would see from the departure hall at dusk (the owner's reference
 * frames): pale blue grading to peach at the horizon, and the day's
 * passengers as a bank of white cloud along that horizon — one smooth curve
 * through the hourly bands. Hours already behind the reader are dense cloud,
 * hours ahead are translucent so the sky shows through; the peak is one warm
 * point; the present minute is a soft column of light with its time and a
 * dot on the cloud's edge. On the whole-airport view T1 is a denser cloud
 * inside the whole, so the strip above it is T2 (the whole is T1 + T2, band
 * for band). Pointing or touching anywhere reads that hour; every band is
 * also a keyboard stop.
 *
 * What it does not do: it draws only the bands the airport published, so a
 * gap in coverage is a gap in the curve; the curve never rises above or
 * falls below the two values it joins (monotone cubic); and the rule exists
 * only when the caller found a band containing the present minute, which it
 * does for TODAY alone.
 *
 * Motion: when the data arrives the curve draws itself, the area fills, then
 * the markers settle in and the present-minute dot sends out one ring. Readers
 * who asked for less motion see the finished figure at once.
 */
const copy = {
  past: { ko: "지난 시간대", en: "Elapsed hours", zh: "已过时段", ja: "経過した時間帯" },
  ahead: { ko: "남은 시간대", en: "Hours ahead", zh: "剩余时段", ja: "残りの時間帯" },
  peak: { ko: "피크", en: "Peak", zh: "高峰", ja: "ピーク" },
  unit: { ko: "명", en: "", zh: "人", ja: "人" },
} as const;

const REVEAL_TOTAL_MS = REVEAL_MS * 2;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Rough text width at 11px: CJK glyphs are square, Latin digits are narrow. */
const textWidth = (text: string) => [...text].reduce((sum, ch) => sum + (ch > "⺀" ? 11 : /[0-9]/.test(ch) ? 6.4 : /[ ·–:]/.test(ch) ? 3.4 : 6.2), 0);

export function AirportFlowFigure({ timeline, layers = null, lang = "ko", peakStartAt, nowBandStart, nowBandProgress, nowLabel, numberLocale, label }: {
  timeline: ReadonlyArray<FlowBand>;
  layers?: Record<string, ReadonlyArray<FlowBand> | undefined> | null;
  lang?: Lang;
  peakStartAt: string | null;
  nowBandStart: string | null;
  nowBandProgress: number | null;
  nowLabel: string;
  numberLocale: string;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const figureRef = useRef<HTMLElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(720);
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (!figure || typeof ResizeObserver === "undefined") return;
    const measure = () => setWidth(Math.max(240, Math.round(figure.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);
  const height = width < 560 ? 232 : 264;
  const layout = useMemo(() => flowLayout({ timeline, layers, width, height, peakStartAt, nowBandStart, nowBandProgress }),
    [timeline, layers, width, height, peakStartAt, nowBandStart, nowBandProgress]);

  // The curve's exact y at an x, read off the drawn path so dots sit on the
  // curve itself rather than on a straight line between band centres.
  const lineRefs = useRef<Array<SVGPathElement | null>>([]);
  const pointOnCurve = useCallback((x: number): number | null => {
    const index = layout.segments.findIndex((segment) => x >= segment.x0 - 0.01 && x <= segment.x1 + 0.01);
    const path = index >= 0 ? lineRefs.current[index] : null;
    if (!path) return null;
    let lo = 0, hi = path.getTotalLength();
    for (let step = 0; step < 24; step += 1) {
      const mid = (lo + hi) / 2;
      if (path.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
    }
    return path.getPointAtLength((lo + hi) / 2).y;
  }, [layout.segments]);

  // The present-minute dot is rendered at its band's value and then snapped
  // onto the drawn curve by hand, so no state changes after layout.
  const nowDotRefs = useRef<Array<SVGCircleElement | SVGTextElement | null>>([]);
  useLayoutEffect(() => {
    if (!layout.now) return;
    const onCurve = pointOnCurve(layout.now.x);
    if (onCurve === null) return;
    for (const element of nowDotRefs.current) {
      if (!element) continue;
      if (element instanceof SVGCircleElement) element.setAttribute("cy", String(onCurve));
      else element.setAttribute("y", String(onCurve - 9));
    }
  }, [layout, pointOnCurve]);

  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const hoverBand = useCallback((index: number) => {
    const band = layout.bands[index];
    if (!band) { setHover(null); return; }
    setHover({ index, x: band.mid, y: pointOnCurve(band.mid) ?? layout.base });
  }, [layout, pointOnCurve]);
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const x = (event.clientX - box.left) * (width / Math.max(1, box.width));
    const index = layout.bands.findIndex((band) => x >= band.x && x < band.x + band.width);
    if (index < 0) setHover(null); else if (index !== hover?.index) hoverBand(index);
  };

  // Reveal once per data set. Inline styles are set and cleared by hand so a
  // re-render (a resize, the clock moving the rule) never leaves a half-drawn
  // curve behind, and reduced motion skips all of it.
  const ringRef = useRef<SVGCircleElement | null>(null);
  const signature = timeline.map((band) => `${band.targetStartAt}:${band.expectedPassengers}`).join("|");
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || reducedMotion() || layout.segments.length === 0) return;
    const lines = Array.from(svg.querySelectorAll<SVGPathElement>(".airport-flow-line"));
    const areas = Array.from(svg.querySelectorAll<SVGPathElement>(".airport-flow-area"));
    const marks = Array.from(svg.querySelectorAll<SVGGElement>(".airport-flow-mark"));
    const ring = ringRef.current;
    const lengths = lines.map((line) => line.getTotalLength());
    const paint = (progress: number) => {
      const draw = clamp01(progress / 0.6);
      lines.forEach((line, index) => { line.style.strokeDasharray = `${lengths[index]}`; line.style.strokeDashoffset = `${lengths[index] * (1 - draw)}`; });
      areas.forEach((area) => { area.style.opacity = String(draw); area.style.transform = `scaleY(${0.35 + 0.65 * draw})`; });
      const settleIn = clamp01((progress - 0.55) / 0.35);
      marks.forEach((mark) => { mark.style.opacity = String(settleIn); mark.style.transform = `translateY(${(1 - settleIn) * 8}px)`; });
      if (ring) { const ringOut = clamp01((progress - 0.6) / 0.4); ring.style.opacity = String(0.55 * (1 - ringOut)); ring.setAttribute("r", String(5 + 16 * ringOut)); }
    };
    const settle = () => {
      lines.forEach((line) => { line.style.strokeDasharray = ""; line.style.strokeDashoffset = ""; });
      areas.forEach((element) => { element.style.opacity = ""; element.style.transform = ""; });
      marks.forEach((mark) => { mark.style.opacity = ""; mark.style.transform = ""; });
      if (ring) { ring.style.opacity = ""; ring.setAttribute("r", "5"); }
    };
    paint(0);
    const cancel = tween(REVEAL_TOTAL_MS, paint, settle);
    return () => { cancel(); settle(); };
  }, [signature, layout.segments.length]);

  const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const people = (value: number) => Math.round(value).toLocaleString(numberLocale);
  const unit = copy.unit[lang];
  const { left, right, top, base } = layout;
  const clampX = (x: number, half: number) => Math.min(right - half, Math.max(left + half, x));

  // The present-minute pill is centred on the rule and pulled inside the
  // figure near either edge, so 23:59 does not hang off the right-hand side.
  const pillWidth = textWidth(nowLabel) + 18;
  const pillX = layout.now ? clampX(layout.now.x, pillWidth / 2) : 0;
  const nowBand = layout.now ? layout.bands[layout.now.index] : null;
  const nowY = nowBand ? top + (1 - Math.min(1, nowBand.value / layout.maxBand)) * (base - top) : null;

  const peakText = layout.peak ? `${copy.peak[lang]} ${people(layout.peak.value)}` : "";
  // When the peak and the now column are close, the peak label steps to the
  // side away from the now pill and the now value takes the other side, so the
  // two never cover each other.
  const nearPeak = Boolean(layout.peak && layout.now && Math.abs(layout.peak.x - layout.now.x) < 96);
  const peakRight = layout.peak && layout.now ? layout.peak.x >= layout.now.x : true;
  const peakAnchor: "start" | "middle" | "end" = layout.peak
    ? nearPeak ? (peakRight ? "start" : "end") : (layout.peak.x > right - 60 ? "end" : layout.peak.x < left + 60 ? "start" : "middle")
    : "middle";
  const peakLabelX = layout.peak ? (nearPeak ? layout.peak.x + (peakRight ? 11 : -11) : clampX(layout.peak.x, 0)) : 0;
  const peakLabelY = layout.peak ? (nearPeak ? layout.peak.y - 7 : Math.max(top - 6, layout.peak.y - 12)) : 0;
  const nowValueLeft = layout.now ? (nearPeak ? peakRight : layout.now.x > right - 70) : false;

  const tip = hover ? (() => {
    const band = layout.bands[hover.index];
    const lines = [`${clock(band.start)}–${clock(band.end)} KST`, `${people(band.value)}${unit}`];
    if (layout.stacked) lines.push(layout.layers.map((layer) => `${layer.key} ${people(layer.values[hover.index])}`).join(" · "));
    const w = Math.max(...lines.map(textWidth)) + 20, h = 12 + lines.length * 15;
    const x = clampX(hover.x, w / 2);
    const above = hover.y - 16 - h >= top - 30;
    const y = above ? hover.y - 16 - h : Math.min(base - h, hover.y + 16);
    return { lines, w, h, x, y };
  })() : null;

  return <figure className="av-figure airport-flow" ref={figureRef} role="group" aria-label={label} data-bands={layout.bands.length}>
    {/* No role="img" here: the figure itself is the labelled group, and the band
        rects inside are real keyboard stops that an image role would hide. */}
    <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
      data-day-left={left} data-day-width={right - left}
      onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)}>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sky-500)", stopOpacity: 0.62 }} />
          <stop offset="0.42" style={{ stopColor: "var(--sky-200)", stopOpacity: 1 }} />
          <stop offset="0.78" style={{ stopColor: "var(--cloud-200)", stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: "var(--cloud-400)", stopOpacity: 0.9 }} />
        </linearGradient>
        {layout.now && <clipPath id={`${id}past`}><rect x={left} y={0} width={Math.max(0, layout.now.x - left)} height={height} /></clipPath>}
      </defs>
      <rect className="airport-flow-sky" x={0} y={0} width={width} height={height} rx={20} fill={`url(#${id}sky)`} />

      {/* Value gridlines, labelled at the right so they never collide with the curve's start. */}
      <g className="airport-flow-grid">
        {layout.grid.map((row) => <g key={row.value}>
          <line x1={left} x2={right} y1={row.y} y2={row.y} />
          <text x={right} y={row.y - 4} textAnchor="end">{people(row.value)}</text>
        </g>)}
        {layout.ticks.filter((tick) => tick.hour !== 0 && tick.hour !== 24).map((tick) => <line key={tick.hour} x1={tick.x} x2={tick.x} y1={top} y2={base} />)}
      </g>

      {/* The whole day, pale when a present minute splits it … */}
      <g className={layout.now ? "airport-flow-ahead" : undefined}>
        {layout.segments.map((segment, index) => <path key={`area-${index}`} className="airport-flow-area" d={segment.area}  />)}
        {layout.segments.map((segment, index) => <path key={`glow-${index}`} className="airport-flow-edge" d={segment.line} />)}
        {layout.segments.map((segment, index) => <path key={`line-${index}`} className="airport-flow-line" d={segment.line}
          ref={(element) => { lineRefs.current[index] = element; }} />)}
      </g>
      {/* … and the hours already behind the reader in full colour on top. */}
      {layout.now && <g className="airport-flow-past" clipPath={`url(#${id}past)`}>
        {layout.segments.map((segment, index) => <path key={`past-area-${index}`} className="airport-flow-area" d={segment.area}  />)}
        {layout.segments.map((segment, index) => <path key={`past-glow-${index}`} className="airport-flow-edge" d={segment.line} />)}
        {layout.segments.map((segment, index) => <path key={`past-line-${index}`} className="airport-flow-line" d={segment.line} />)}
      </g>}
      {/* T1 as a denser cloud inside the whole: the strip above it is T2, because the whole is T1 + T2. */}
      {layout.stacked && <g className={layout.now ? "airport-flow-ahead" : undefined}>
        {layout.layers[0].segments.map((segment, index) => <path key={`stack-${index}`} className="airport-flow-area airport-flow-stack" d={segment.area} />)}
      </g>}
      {layout.stacked && layout.now && <g className="airport-flow-past" clipPath={`url(#${id}past)`}>
        {layout.layers[0].segments.map((segment, index) => <path key={`past-stack-${index}`} className="airport-flow-area airport-flow-stack" d={segment.area} />)}
      </g>}

      <line className="av-rule airport-flow-base" x1={left} x2={right} y1={base} y2={base} />
      <g className="airport-flow-hours">
        {layout.ticks.map((tick) => <text key={tick.hour} x={tick.x} y={base + 17} textAnchor={tick.hour === FLOW_HOURS[0] ? "start" : tick.hour === FLOW_HOURS.at(-1) ? "end" : "middle"}>{String(tick.hour).padStart(2, "0")}</text>)}
      </g>

      {layout.peak && <g className="airport-flow-mark airport-flow-peak" data-start={layout.peak.start}>
        <circle cx={layout.peak.x} cy={layout.peak.y} r={4} />
        <text x={peakLabelX} y={peakLabelY} textAnchor={peakAnchor}>{peakText}</text>
      </g>}
      {layout.now && <g className="airport-flow-mark airport-flow-now-group">
        <rect className="airport-flow-now-light" x={layout.now.x - 9} y={top - 16} width={18} height={base - top + 16} rx={9} />
        <line className="av-now airport-flow-now" x1={layout.now.x} x2={layout.now.x} y1={top - 14} y2={base} data-now-label={nowLabel} />
        {nowY !== null && <>
          <circle ref={(element) => { ringRef.current = element; nowDotRefs.current[0] = element; }} className="airport-flow-now-ring" cx={layout.now.x} cy={nowY} r={5} />
          <circle ref={(element) => { nowDotRefs.current[1] = element; }} className="airport-flow-now-dot" cx={layout.now.x} cy={nowY} r={4.5} />
          {nowBand && !hover && <text ref={(element) => { nowDotRefs.current[2] = element; }} className="airport-flow-now-value" x={nowValueLeft ? layout.now.x - 10 : layout.now.x + 10} y={nowY - 9}
            textAnchor={nowValueLeft ? "end" : "start"}>{people(nowBand.value)}{unit}</text>}
        </>}
        <g className="airport-flow-now-pill">
          <rect x={pillX - pillWidth / 2} y={top - 39} width={pillWidth} height={24} rx={12} />
          <text className="airport-flow-now-label" x={pillX} y={top - 23} textAnchor="middle">{nowLabel}</text>
        </g>
      </g>}

      {hover && tip && <g className="airport-flow-tip" pointerEvents="none">
        <line x1={hover.x} x2={hover.x} y1={top} y2={base} />
        <circle cx={hover.x} cy={hover.y} r={4.5} />
        <rect x={tip.x - tip.w / 2} y={tip.y} width={tip.w} height={tip.h} rx={8} />
        {tip.lines.map((line, index) => <text key={index} x={tip.x} y={tip.y + 17 + index * 15} textAnchor="middle" className={index === 1 ? "strong" : undefined}>{line}</text>)}
      </g>}

      {/* One keyboard stop per published band; pointer reading happens on the whole figure. */}
      {layout.bands.map((band, index) => <rect key={band.start} className={["airport-flow-band", band.now ? "now" : "", band.peak ? "peak" : ""].filter(Boolean).join(" ")}
        x={band.x} y={top} width={band.width} height={base - top} tabIndex={0} pointerEvents="none"
        onFocus={() => hoverBand(index)} onBlur={() => setHover(null)}
        data-start={band.start} aria-label={`${clock(band.start)}–${clock(band.end)} KST · ${people(band.value)}`}>
        <title>{`${clock(band.start)}–${clock(band.end)} KST · ${people(band.value)}`}</title>
      </rect>)}
    </svg>
    <ul className="av-legend airport-flow-legend">
      {layout.now && <li><i className="past" />{copy.past[lang]}</li>}
      {layout.now && <li><i className="ahead" />{copy.ahead[lang]}</li>}
      {layout.stacked && layout.layers.map((layer, index) => <li key={layer.key}><i className={index === 0 ? "stack-lower" : "stack-upper"} />{layer.key}</li>)}
    </ul>
  </figure>;
}
