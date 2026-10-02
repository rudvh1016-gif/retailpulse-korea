/**
 * Motion for the airport figures, in one place so every screen moves the same
 * way: a number counts up once, a mark grows once, and that is all.
 *
 * GSAP (Standard "no charge" licence, gsap.com/standard-license) is loaded only
 * when a figure first animates, so the first page load carries none of it, and
 * never when the reader asked the system for less motion.
 */

export const REVEAL_MS = 560;
export const STATE_MS = 240;

/** True when the reader prefers reduced motion (or there is no window). */
export function reducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

/**
 * Counts a number from 0 to `value` over the reveal time, calling `render` with
 * each rounded step. Returns a function that stops it. With motion off the
 * final value is rendered at once.
 */
export function countUp(value: number, render: (current: number) => void, duration = REVEAL_MS): () => void {
  let stopped = false;
  render(reducedMotion() ? value : 0);
  void loadMotion().then((gsap) => {
    if (stopped) return;
    if (!gsap) { render(value); return; }
    const state = { n: 0 };
    const tween = gsap.to(state, { n: value, duration: duration / 1000, ease: "power2.out", onUpdate: () => { if (!stopped) render(Math.round(state.n)); } });
    stopAll.push(() => tween.kill());
  });
  const stopAll: Array<() => void> = [];
  return () => { stopped = true; stopAll.forEach((stop) => stop()); render(value); };
}
