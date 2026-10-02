/**
 * Motion for the airport figures, in one place so every screen moves the same
 * way: a number counts up once, a line draws once, and that is all.
 *
 * Small reveals (a count-up, a line drawing itself) run on requestAnimationFrame
 * with one ease, so they start the moment data arrives and carry no library.
 * GSAP (Standard "no charge" licence, gsap.com/standard-license) is for the
 * sequenced figures that come later; it is loaded only when such a figure first
 * animates, so the first page load carries none of it, and never when the
 * reader asked the system for less motion.
 */

export const REVEAL_MS = 560;
export const STATE_MS = 240;

/** True when the reader prefers reduced motion (or there is no window). */
export function reducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** One ease for everything that reveals: fast in, settling out. */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

/**
 * Runs `onUpdate` with an eased progress 0..1 over `duration` and returns a
 * function that cancels it. With motion off the final state is painted at once.
 */
export function tween(duration: number, onUpdate: (progress: number) => void, onDone?: () => void): () => void {
  if (reducedMotion() || duration <= 0) { onUpdate(1); onDone?.(); return () => {}; }
  let frame = 0;
  const started = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / duration);
    onUpdate(easeOut(t));
    if (t < 1) frame = requestAnimationFrame(step);
    else onDone?.();
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

/**
 * Counts a number from `from` to `value` over the reveal time, calling
 * `render` with each rounded step. Returns a function that stops it. With
 * motion off the final value is rendered at once.
 */
export function countUp(value: number, render: (current: number) => void, duration = REVEAL_MS, from = 0): () => void {
  return tween(duration, (progress) => render(Math.round(from + (value - from) * progress)));
}

type Gsap = typeof import("gsap").gsap;
let loader: Promise<Gsap | null> | null = null;

/** The GSAP core, or null when motion is off or the chunk could not load. */
export function loadMotion(): Promise<Gsap | null> {
  if (reducedMotion()) return Promise.resolve(null);
  if (!loader) {
    loader = import("gsap").then((module) => module.gsap).catch(() => null);
    void loader.then((result) => { if (!result) loader = null; });
  }
  return loader;
}
