/** Exact CSS gap for the approved phone date row; desktop remains 6px. */
export function airportDateGapPx(width) {
  // Multiply by an integer first: 430 * .045 stringifies as 19.349999999999998.
  const gap = width <= 600 ? Math.max(16, Math.min(width * 45 / 1000, 20)) : 6;
  return `${gap}px`;
}
