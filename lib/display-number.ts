/** Display only: retain original values for comparisons, percentages and chart geometry. */
export function roundDisplayInteger(value: number): number {
  const magnitude = Math.round(Math.abs(value));
  return magnitude === 0 ? 0 : value < 0 ? -magnitude : magnitude;
}

export function formatDisplayInteger(value: number, locale = 'ko-KR'): string {
  return new Intl.NumberFormat(locale, {maximumFractionDigits: 0}).format(roundDisplayInteger(value));
}
