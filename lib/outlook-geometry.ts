/**
 * Drawing geometry for the Seoul "앞으로 · 예상" outlook, kept pure so a node
 * test can check it without a browser. Nothing here reads, changes or
 * resamples a forecast value: the caller passes the SVG positions of each
 * published hourly minimum and maximum, and gets back paths through exactly
 * those positions.
 *
 * Each edge of the band is the owner-approved monotone cubic of the airport
 * figure (`monotonePath`): it passes through every published bound and never
 * rises above or dips below the two values it joins, so it shows no hour
 * higher or lower than Seoul published. The two edges are drawn independently,
 * and two such curves could still cross between hours; a run where that would
 * happen keeps straight edges instead, so the band never turns inside out.
 * There is no midpoint and no central curve.
 */
import { monotonePath, niceSteps } from "./airport-flow-geometry";

/** One published hour: its x, and the y of its maximum (upper) and minimum (lower). */
export type BandVertex = { x: number; upper: number; lower: number };
export type BandPaths = {
  /** The maximum edge, left to right. */
  upper: string;
  /** The minimum edge, left to right. */
  lower: string;
  /** The range itself: between the two edges. */
  range: string;
  /** Under the minimum edge down to the zero line, for the soft vertical fade. */
  fade: string;
  smooth: boolean;
};

type Point = [number, number];
type Curve = { start: Point; segments: Array<{ c1: Point; c2: Point; end: Point }> };

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const at = (point: Point) => `${point[0]},${point[1]}`;

function parse(d: string): Curve {
  const n = (d.match(NUMBER) ?? []).map(Number);
  const segments: Curve["segments"] = [];
  for (let i = 2; i + 5 < n.length; i += 6) segments.push({ c1: [n[i], n[i + 1]], c2: [n[i + 2], n[i + 3]], end: [n[i + 4], n[i + 5]] });
  return { start: [n[0], n[1]], segments };
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** The same curve traced from its last point back to its first, as `C` commands. */
function reversed(curve: Curve): string {
  let from = curve.start;
  const pieces = curve.segments.map((segment) => { const piece = { ...segment, from }; from = segment.end; return piece; });
  return pieces.reverse().map((piece) => ` C${at(piece.c2)} ${at(piece.c1)} ${at(piece.from)}`).join("");
}

/** True when the upper (maximum) edge stays on or above the lower (minimum) edge everywhere. */
export function edgesStayOrdered(upper: string, lower: string, samples = 24): boolean {
  const a = parse(upper), b = parse(lower);
  if (a.segments.length !== b.segments.length) return false;
  let fromA = a.start, fromB = b.start;
  for (let s = 0; s < a.segments.length; s += 1) {
    const sa = a.segments[s], sb = b.segments[s];
    for (let k = 0; k <= samples; k += 1) {
      const t = k / samples;
      // SVG y grows downwards: the maximum edge must never sit below the minimum edge.
      if (cubic(fromA[1], sa.c1[1], sa.c2[1], sa.end[1], t) > cubic(fromB[1], sb.c1[1], sb.c2[1], sb.end[1], t) + 0.05) return false;
    }
    fromA = sa.end; fromB = sb.end;
  }
  return true;
}

/** Paths for one contiguous run of published hours (two or more). `base` is the y of zero. */
export function outlookBand(vertices: ReadonlyArray<BandVertex>, base: number): BandPaths | null {
  if (vertices.length < 2) return null;
  const first = vertices[0], last = vertices.at(-1)!;
  const smoothUpper = monotonePath(vertices.map((v): Point => [v.x, v.upper]));
  const smoothLower = monotonePath(vertices.map((v): Point => [v.x, v.lower]));
  const smooth = edgesStayOrdered(smoothUpper, smoothLower);
  const straight = (key: "upper" | "lower") => vertices.map((v, index) => `${index ? "L" : "M"}${v.x},${v[key]}`).join(" ");
  const upper = smooth ? smoothUpper : straight("upper");
  const lower = smooth ? smoothLower : straight("lower");
  const back = smooth ? reversed(parse(lower)) : [...vertices].reverse().slice(1).map((v) => ` L${v.x},${v.lower}`).join("");
  return {
    upper, lower, smooth,
    range: `${upper} L${last.x},${last.lower}${back} Z`,
    fade: `${lower} L${last.x},${base} L${first.x},${base} Z`,
  };
}

/** Index of the published hour nearest to a pointer x (the earlier one on a tie). */
export function nearestIndex(xs: ReadonlyArray<number>, x: number): number {
  let best = -1;
  for (let i = 0; i < xs.length; i += 1) if (best < 0 || Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  return best;
}

/** The time pill at the top of the selection guide: fixed size, kept inside the drawing. */
export const OUTLOOK_PILL = { width: 46, height: 20, top: 4 } as const;
export function pillCenter(x: number, width: number, pill: number = OUTLOOK_PILL.width): number {
  return Math.min(width - pill / 2 - 1, Math.max(pill / 2 + 1, x));
}

/**
 * Hairline value grid: zero, the existing ceiling, and round steps between
 * them that keep clear of both labels. The scale itself is unchanged.
 */
export function outlookGrid(ceiling: number, y: (value: number) => number, clearance = 16): Array<{ value: number; y: number; edge: "zero" | "ceiling" | "step" }> {
  const zero = y(0), top = y(ceiling);
  const steps = niceSteps(ceiling, 3).map((value) => ({ value, y: y(value), edge: "step" as const }))
    .filter((step) => Math.abs(step.y - zero) >= clearance && Math.abs(step.y - top) >= clearance);
  return [{ value: 0, y: zero, edge: "zero" as const }, ...steps, { value: ceiling, y: top, edge: "ceiling" as const }];
}
