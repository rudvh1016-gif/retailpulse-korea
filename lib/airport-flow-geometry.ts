/**
 * Geometry for the 24-hour passenger-flow figure, kept pure so a node test
 * can check every position without a browser.
 *
 * The horizontal axis is the whole service day in KST, 00:00 to 24:00, not
 * only the bands the airport published: a day with missing bands shows the
 * gap instead of closing it, and a two-band day is a short stretch of line,
 * which is what two bands are. The line passes through the middle of each
 * hourly band and runs flat to the edges of the first and last band of each
 * contiguous run, so the area under it covers exactly the hours it describes.
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
export const FLOW_PAD = { left: 8, right: 8, top: 34, bottom: 28 } as const;

export type FlowBandBox = { start: string; end: string; value: number; x: number; width: number; now: boolean; peak: boolean };
export type FlowLayout = {
  width: number; height: number; left: number; right: number; top: number; base: number;
  dayStart: number; maxBand: number;
  segments: Array<{ line: string; area: string }>;
  bands: FlowBandBox[];
  peak: { x: number; y: number; value: number; start: string } | null;
  now: { x: number } | null;
  ticks: Array<{ hour: number; x: number }>;
};

const round = (n: number) => Math.round(n * 10) / 10;

export function flowLayout({ timeline, width, height, peakStartAt, nowBandStart, nowBandProgress }: {
  timeline: FlowBand[]; width: number; height: number;
  peakStartAt: string | null; nowBandStart: string | null; nowBandProgress: number | null;
}): FlowLayout {
  const sorted = [...timeline]
    .filter((band) => Number.isFinite(Date.parse(band.targetStartAt)) && Number.isFinite(Date.parse(band.targetEndAt)))
    .sort((a, b) => a.targetStartAt.localeCompare(b.targetStartAt));
  const left = FLOW_PAD.left, right = width - FLOW_PAD.right, top = FLOW_PAD.top, base = height - FLOW_PAD.bottom;
  const dayStart = sorted.length ? kstDayStart(sorted[0].targetStartAt) : 0;
  const maxBand = Math.max(1, ...sorted.map((band) => band.expectedPassengers));
  const x = (ms: number) => round(left + Math.min(1, Math.max(0, (ms - dayStart) / DAY)) * (right - left));
  const y = (value: number) => round(top + (1 - Math.max(0, value) / maxBand) * (base - top));

  // Contiguous runs: a band that starts where the previous one ended joins it;
  // anything else starts a new run, and the line breaks between runs.
  const runs: FlowBand[][] = [];
  for (const band of sorted) {
    const current = runs.at(-1);
    if (current && Math.abs(Date.parse(band.targetStartAt) - Date.parse(current.at(-1)!.targetEndAt)) < 60_000) current.push(band);
    else runs.push([band]);
  }
  const segments = runs.map((run) => {
    const first = run[0], last = run.at(-1)!;
    const points: Array<[number, number]> = [
      [x(Date.parse(first.targetStartAt)), y(first.expectedPassengers)],
      ...run.map((band): [number, number] => [x((Date.parse(band.targetStartAt) + Date.parse(band.targetEndAt)) / 2), y(band.expectedPassengers)]),
      [x(Date.parse(last.targetEndAt)), y(last.expectedPassengers)],
    ];
    const line = points.map(([px, py], index) => `${index === 0 ? "M" : "L"}${px},${py}`).join(" ");
    const area = `${line} L${points.at(-1)![0]},${base} L${points[0][0]},${base} Z`;
    return { line, area };
  });

  const bands: FlowBandBox[] = sorted.map((band) => {
    const startX = x(Date.parse(band.targetStartAt));
    return {
      start: band.targetStartAt, end: band.targetEndAt, value: band.expectedPassengers,
      x: startX, width: round(Math.max(1, x(Date.parse(band.targetEndAt)) - startX)),
      now: band.targetStartAt === nowBandStart, peak: band.targetStartAt === peakStartAt,
    };
  });

  const peakBand = sorted.find((band) => band.targetStartAt === peakStartAt) ?? null;
  const peak = peakBand ? {
    x: x((Date.parse(peakBand.targetStartAt) + Date.parse(peakBand.targetEndAt)) / 2),
    y: y(peakBand.expectedPassengers), value: peakBand.expectedPassengers, start: peakBand.targetStartAt,
  } : null;

  // The rule sits at the exact minute: band start plus the share of the band
  // already elapsed, which the caller measured against its own clock.
  const nowBand = sorted.find((band) => band.targetStartAt === nowBandStart) ?? null;
  const now = nowBand && nowBandProgress !== null ? (() => {
    const start = Date.parse(nowBand.targetStartAt), end = Date.parse(nowBand.targetEndAt);
    const progress = Math.min(1, Math.max(0, nowBandProgress));
    return { x: x(start + progress * (end - start)) };
  })() : null;

  const ticks = sorted.length ? FLOW_HOURS.map((hour) => ({ hour, x: x(dayStart + hour * HOUR) })) : [];
  return { width, height, left, right, top, base, dayStart, maxBand, segments, bands, peak, now, ticks };
}
