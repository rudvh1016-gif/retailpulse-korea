/**
 * Geometry for the 24-hour passenger-flow figure, kept pure so a node test
 * can check every position without a browser.
 *
 * The horizontal axis is the whole service day in KST, 00:00 to 24:00, not
 * only the bands the airport published: a day with missing bands shows the
 * gap instead of closing it, and a two-band day is a short stretch of line,
 * which is what two bands are. The curve passes through the middle of each
 * hourly band at that band's value and runs flat to the edges of the first
 * and last band of each contiguous run, so the area under it covers exactly
 * the hours it describes. Between band centres it is a monotone cubic
 * (Fritsch–Carlson): it never overshoots the two values it joins, so no hour
 * is drawn higher or lower than the airport published.
 */
export type FlowBand = { targetStartAt: string; targetEndAt: string; expectedPassengers: number };

const HOUR = 3_600_000;
const KST = 9 * HOUR;
const DAY = 24 * HOUR;

/** UTC milliseconds of KST midnight on the day that contains `iso`. */
export function kstDayStart(iso: string): number {
  const shifted = Date.parse(iso) + KST;
  return shifted - (shifted % DAY) - KST;
}

export const FLOW_HOURS = [0, 6, 12, 18, 24] as const;
export const FLOW_PAD = { left: 18, right: 18, top: 52, bottom: 34 } as const;

const round = (n: number) => Math.round(n * 10) / 10;

/** A smooth path through `points` that stays within each pair of values. */
export function monotonePath(points: Array<[number, number]>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0][0]},${points[0][1]}`;
  const dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push(dx[i] === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx[i]);
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
    const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i];
    const size = a * a + b * b;
    if (size > 9) { const s = 3 / Math.sqrt(size); tangent[i] = s * a * slope[i]; tangent[i + 1] = s * b * slope[i]; }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    d += ` C${round(points[i][0] + third)},${round(points[i][1] + tangent[i] * third)} ${round(points[i + 1][0] - third)},${round(points[i + 1][1] - tangent[i + 1] * third)} ${points[i + 1][0]},${points[i + 1][1]}`;
  }
  return d;
}

/** Round value steps for gridlines: 1, 2, 5 × 10^k, about `target` of them below `max`. */
export function niceSteps(max: number, target = 3): number[] {
  if (!(max > 0)) return [];
  const raw = max / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = [1, 2, 5, 10].map((m) => m * magnitude).find((m) => m >= raw) ?? magnitude * 10;
  const steps: number[] = [];
  for (let value = unit; value < max * 0.98; value += unit) steps.push(value);
  return steps;
}

export type FlowSegment = { line: string; area: string; x0: number; x1: number };
export type FlowBandBox = { start: string; end: string; value: number; x: number; width: number; mid: number; now: boolean; peak: boolean };
export type FlowLayout = {
  width: number; height: number; left: number; right: number; top: number; base: number;
  dayStart: number; maxBand: number;
  segments: FlowSegment[];
  layers: Array<{ key: string; segments: FlowSegment[]; values: number[] }>;
  /** True when the layers add up to the whole, band for band, so they can be drawn stacked inside it. */
  stacked: boolean;
  bands: FlowBandBox[];
  grid: Array<{ value: number; y: number }>;
  peak: { x: number; y: number; value: number; start: string } | null;
  now: { x: number; index: number } | null;
  ticks: Array<{ hour: number; x: number }>;
};

function contiguousRuns(sorted: FlowBand[]): FlowBand[][] {
  const runs: FlowBand[][] = [];
  for (const band of sorted) {
    const current = runs.at(-1);
    if (current && Math.abs(Date.parse(band.targetStartAt) - Date.parse(current.at(-1)!.targetEndAt)) < 60_000) current.push(band);
    else runs.push([band]);
  }
  return runs;
}

function sortBands(timeline: ReadonlyArray<FlowBand>): FlowBand[] {
  return [...timeline]
    .filter((band) => Number.isFinite(Date.parse(band.targetStartAt)) && Number.isFinite(Date.parse(band.targetEndAt)) && Number.isFinite(band.expectedPassengers))
    .sort((a, b) => a.targetStartAt.localeCompare(b.targetStartAt));
}

export function flowLayout({ timeline, layers = null, width, height, peakStartAt, nowBandStart, nowBandProgress }: {
  timeline: ReadonlyArray<FlowBand>; layers?: Record<string, ReadonlyArray<FlowBand> | undefined> | null; width: number; height: number;
  peakStartAt: string | null; nowBandStart: string | null; nowBandProgress: number | null;
}): FlowLayout {
  const sorted = sortBands(timeline);
  const left = FLOW_PAD.left, right = width - FLOW_PAD.right, top = FLOW_PAD.top, base = height - FLOW_PAD.bottom;
  const dayStart = sorted.length ? kstDayStart(sorted[0].targetStartAt) : 0;
  const maxBand = Math.max(1, ...sorted.map((band) => band.expectedPassengers));
  const x = (ms: number) => round(left + Math.min(1, Math.max(0, (ms - dayStart) / DAY)) * (right - left));
  const y = (value: number) => round(top + (1 - Math.min(maxBand, Math.max(0, value)) / maxBand) * (base - top));

  const toSegments = (bands: FlowBand[]): FlowSegment[] => contiguousRuns(bands).map((run) => {
    const first = run[0], last = run.at(-1)!;
    const points: Array<[number, number]> = [
      [x(Date.parse(first.targetStartAt)), y(first.expectedPassengers)],
      ...run.map((band): [number, number] => [x((Date.parse(band.targetStartAt) + Date.parse(band.targetEndAt)) / 2), y(band.expectedPassengers)]),
      [x(Date.parse(last.targetEndAt)), y(last.expectedPassengers)],
    ];
    const line = monotonePath(points);
    const x0 = points[0][0], x1 = points.at(-1)![0];
    return { line, area: `${line} L${x1},${base} L${x0},${base} Z`, x0, x1 };
  });
  const segments = toSegments(sorted);

  // Terminal layers are kept only when every band of the whole-airport
  // timeline has a matching band in that terminal's own timeline, so they sit
  // under the same hours and the same scale as the total. The whole-airport
  // forecast is T1 + T2 band for band (lib/airport-today-summary.ts), which
  // `stacked` verifies before the figure draws one inside the other.
  const layerList = Object.entries(layers ?? {}).flatMap(([key, bands]) => {
    const own = sortBands(bands ?? []);
    if (!own.length || sorted.length === 0) return [];
    const starts = new Map(own.map((band) => [band.targetStartAt, band]));
    if (!sorted.every((band) => starts.has(band.targetStartAt))) return [];
    const aligned = sorted.map((band) => starts.get(band.targetStartAt)!);
    return [{ key, segments: toSegments(aligned), values: aligned.map((band) => band.expectedPassengers) }];
  });

  const stacked = layerList.length >= 2 && sorted.every((band, index) =>
    Math.abs(layerList.reduce((sum, layer) => sum + layer.values[index], 0) - band.expectedPassengers) <= 1);

  const bands: FlowBandBox[] = sorted.map((band) => {
    const startX = x(Date.parse(band.targetStartAt)), endX = x(Date.parse(band.targetEndAt));
    return {
      start: band.targetStartAt, end: band.targetEndAt, value: band.expectedPassengers,
      x: startX, width: round(Math.max(1, endX - startX)), mid: round((startX + endX) / 2),
      now: band.targetStartAt === nowBandStart, peak: band.targetStartAt === peakStartAt,
    };
  });

  const grid = niceSteps(maxBand).map((value) => ({ value, y: y(value) }));

  const peakBand = sorted.find((band) => band.targetStartAt === peakStartAt) ?? null;
  const peak = peakBand ? {
    x: x((Date.parse(peakBand.targetStartAt) + Date.parse(peakBand.targetEndAt)) / 2),
    y: y(peakBand.expectedPassengers), value: peakBand.expectedPassengers, start: peakBand.targetStartAt,
  } : null;

  // The rule sits at the exact minute: band start plus the share of the band
  // already elapsed, which the caller measured against its own clock.
  const nowIndex = sorted.findIndex((band) => band.targetStartAt === nowBandStart);
  const nowBand = nowIndex >= 0 ? sorted[nowIndex] : null;
  const now = nowBand && nowBandProgress !== null ? (() => {
    const start = Date.parse(nowBand.targetStartAt), end = Date.parse(nowBand.targetEndAt);
    const progress = Math.min(1, Math.max(0, nowBandProgress));
    return { x: x(start + progress * (end - start)), index: nowIndex };
  })() : null;

  const ticks = sorted.length ? FLOW_HOURS.map((hour) => ({ hour, x: x(dayStart + hour * HOUR) })) : [];
  return { width, height, left, right, top, base, dayStart, maxBand, segments, layers: layerList, stacked, bands, grid, peak, now, ticks };
}
