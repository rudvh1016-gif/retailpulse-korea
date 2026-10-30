/** The SVG uses x=4..612 for day slots in a 620-wide viewBox. No value is inferred. */
export function recordChartIndexAt(clientX: number, left: number, width: number, days: number): number | null {
  if (![clientX, left, width, days].every(Number.isFinite) || width <= 0 || days < 1 || !Number.isInteger(days)) return null;
  const x = (clientX - left) / width * 620;
  return Math.max(0, Math.min(days - 1, Math.floor((x - 4) / 608 * days)));
}

export function recordChartKeyIndex(key: string, selected: number, days: number): number | null {
  if (!Number.isInteger(days) || days < 1 || !Number.isInteger(selected) || selected < 0 || selected >= days) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return days - 1;
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, selected - 1);
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(days - 1, selected + 1);
  return null;
}
