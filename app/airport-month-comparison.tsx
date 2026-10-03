/** Shared-height comparison; the accessible, fully labelled values remain in the existing monthly definition list. */
export function AirportMonthComparison({ current, previous, currentLabel, previousLabel, numberLocale, unit }: { current: number | null; previous: number | null; currentLabel: string; previousLabel: string; numberLocale: string; unit: string }) {
  if (current === null || previous === null) return null;
  const max = Math.max(current, previous);
  return <svg className="airport-month-compare-model" viewBox="0 0 360 185" width="360" height="185" aria-hidden="true">
    <path d="M30 130 H320" stroke="#d4e2e8" fill="none"/>
    {[previous, current].map((value, index) => {
      const x = 68 + index * 150, h = max > 0 ? value / max * 95 : 0, y = 128 - h;
      return <g key={index} data-value={value}>
        {h > 0 && <>
        <path d={`M${x} ${y} h48 V128 h-48 Z`} fill={index ? '#a9d5ec' : '#c6e5f6'}/>
        <path d={`M${x+48} ${y} l8 -5 V123 l-8 5 Z`} fill="#81b3cd"/>
        <path d={`M${x} ${y} l8 -5 h48 l-8 5 Z`} fill="#e5f5fc"/>
        </>}
        <text x={x+24} y="151" textAnchor="middle" fill="#000" fontSize="12">{index ? currentLabel : previousLabel}</text>
        <text x={x+24} y="172" textAnchor="middle" fill="#000" fontSize="14">{Math.round(value).toLocaleString(numberLocale)}{unit}</text>
      </g>;
    })}
  </svg>;
}
