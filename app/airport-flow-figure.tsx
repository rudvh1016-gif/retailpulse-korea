"use client";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FLOW_HOURS, flowLayout, type FlowBand } from "../lib/airport-flow-geometry";
import type { Lang } from "./retailpulse-data";
import { airportModelScope } from '../lib/airport-model-scope';
import { AirportSceneModel } from './airport-scene-model';
// Styles live in app/airport-visual.css, imported once by
// app/airport-departure-overview.tsx (always in the app bundle). Importing it
// here too would break the node tests that load live-signals.tsx.

/** Published hourly values as flat columns; gaps, terminal layers and keyboard readings stay exact. */
const copy = {
  past: { ko: "지난 시간대", en: "Elapsed hours", zh: "已过时段", ja: "経過した時間帯" },
  ahead: { ko: "남은 시간대", en: "Hours ahead", zh: "剩余时段", ja: "残りの時間帯" },
  peak: { ko: "피크", en: "Peak", zh: "高峰", ja: "ピーク" },
  unit: { ko: "명", en: "", zh: "人", ja: "人" },
  concept: { ko: "공항 그림은 개념 모형이며 막대 높이는 공식 예상 승객 수입니다.", en: "The airport image is conceptual; bar heights show official forecast passengers.", zh: "机场图像是概念模型；柱高表示官方预测旅客数。", ja: "空港の図は概念模型です。柱の高さは公式予測旅客数です。" },
} as const;

const kstClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
/** Rough text width at 11px: CJK glyphs are square, Latin digits are narrow. */
const textWidth = (text: string) => [...text].reduce((sum, ch) => sum + (ch > "⺀" ? 11 : /[0-9]/.test(ch) ? 6.4 : /[ ·–:]/.test(ch) ? 3.4 : 6.2), 0);

export function AirportFlowFigure({ timeline, layers = null, lang = "ko", terminal = 'all', showModel = true, peakStartAt, nowBandStart, nowBandProgress, nowLabel, numberLocale, label }: {
  timeline: ReadonlyArray<FlowBand>;
  layers?: Record<string, ReadonlyArray<FlowBand> | undefined> | null;
  lang?: Lang;
  terminal?: 'all' | 'T1' | 'T2';
  showModel?: boolean;
  peakStartAt: string | null;
  nowBandStart: string | null;
  nowBandProgress: number | null;
  nowLabel: string;
  numberLocale: string;
  label: string;
}) {
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
  const height = width < 560 ? 184 : 224;
  const layout = useMemo(() => flowLayout({ timeline, layers, width, height, peakStartAt, nowBandStart, nowBandProgress }),
    [timeline, layers, width, height, peakStartAt, nowBandStart, nowBandProgress]);

  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const hoverBand = useCallback((index: number) => {
    const band = layout.bands[index];
    if (!band) { setHover(null); return; }
    setHover({ index, x: band.mid, y: layout.base-band.value/layout.maxBand*(layout.base-layout.top) });
  }, [layout]);
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const x = (event.clientX - box.left) * (width / Math.max(1, box.width));
    const index = layout.bands.findIndex((band) => x >= band.x && x < band.x + band.width);
    if (index < 0) setHover(null); else if (index !== hover?.index) hoverBand(index);
  };

  const numberFormat = useMemo(() => new Intl.NumberFormat(numberLocale), [numberLocale]);
  const clock = (iso: string) => kstClock.format(new Date(iso));
  const people = (value: number) => numberFormat.format(Math.round(value));
  const unit = copy.unit[lang];
  const { left, right, top, base } = layout;
  const clampX = (x: number, half: number) => Math.min(right - half, Math.max(left + half, x));

  const nowBand = layout.now ? layout.bands[layout.now.index] : null;

  const peakText = layout.peak ? `${copy.peak[lang]} ${people(layout.peak.value)}` : "";
  const peakAnchor = layout.peak ? (layout.peak.x > right - 60 ? "end" : layout.peak.x < left + 60 ? "start" : "middle") : "middle";

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

  return <figure className="av-figure airport-flow" ref={figureRef} role="group" aria-label={label} data-bands={layout.bands.length} data-chart-material="ink-silver">
    <p className="airport-model-scope" data-testid="airport-model-scope" data-terminal={terminal}>{airportModelScope(terminal,lang)}</p>
    {showModel && <AirportSceneModel scope={terminal} lang={lang} className="airport-hourly-concept"/>}
    {/* No role="img" here: the figure itself is the labelled group, and the band
        rects inside are real keyboard stops that an image role would hide. */}
    <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
      data-day-left={left} data-day-width={right - left}
      onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)}>
      <g className="airport-hourly-prisms" aria-hidden="true" pointerEvents="none">
        {layout.bands.map((band, index) => {
          const barHeight = band.value / layout.maxBand * (base - top);
          const w = band.width * .64, x = band.mid-w/2;
          const y = base - barHeight;
          const finish = band.now ? "now" : layout.now && band.x >= layout.now.x ? "ahead" : "elapsed";
          const lower = layout.stacked ? layout.layers[0].values[index] / layout.maxBand * (base - top) : 0;
          return barHeight > 0 && <g key={band.start} data-start={band.start} data-value={band.value} data-height={barHeight} data-finish={finish}>
            <rect x={x} y={y} width={w} height={barHeight} rx={Math.min(1.5,barHeight/2)} style={{fill:finish==='now'?'#80b2a4':finish==='ahead'?'#aec5d8':'#43617f'}}/>
            {lower>0&&<rect x={x} y={base-lower} width={w} height={lower} style={{fill:band.now?'#b8d6ca':'#7194b2'}}/>}
          </g>;
        })}
      </g>
      <line className="av-rule airport-flow-base" x1={left} x2={right} y1={base} y2={base} />
      <g className="airport-flow-hours">
        {layout.ticks.map((tick) => <text key={tick.hour} x={tick.x} y={base + 17} textAnchor={tick.hour === FLOW_HOURS[0] ? "start" : tick.hour === FLOW_HOURS.at(-1) ? "end" : "middle"}>{String(tick.hour).padStart(2, "0")}</text>)}
      </g>

      {layout.peak && <g className="airport-flow-mark airport-flow-peak" data-start={layout.peak.start}>
        <circle cx={layout.peak.x} cy={layout.peak.y} r={2.5} style={{fill:'#43617F'}} />
        <text x={clampX(layout.peak.x, 0)} y={Math.max(top - 6, layout.peak.y - 12)} textAnchor={peakAnchor}>{peakText}</text>
      </g>}
      {layout.now && <g className="airport-flow-mark airport-flow-now-group">
        <line className="av-now airport-flow-now" x1={layout.now.x} x2={layout.now.x} y1={top - 14} y2={base} data-now-label={nowLabel} />
        <text className="airport-flow-now-label" x={left} y={18} textAnchor="start">{nowLabel}</text>
        {nowBand&&<text className="airport-flow-now-value" x={right} y={18} textAnchor="end">{people(nowBand.value)}{unit} · KST</text>}
      </g>}

      {hover && tip && <g className="airport-flow-tip" pointerEvents="none">
        <line x1={hover.x} x2={hover.x} y1={top} y2={base} />
        <circle cx={hover.x} cy={hover.y} r={4.5} />
        <rect x={tip.x - tip.w / 2} y={tip.y} width={tip.w} height={tip.h} rx={3} />
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
    {showModel && <p className="prep-note airport-hourly-model-note">{copy.concept[lang]}</p>}
  </figure>;
}
