/** Shared-height comparison; the accessible, fully labelled values remain in the existing monthly definition list. */
export function AirportMonthComparison({ current, previous, currentLabel, previousLabel, numberLocale, unit }: { current: number | null; previous: number | null; currentLabel: string; previousLabel: string; numberLocale: string; unit: string }) {
  if (current === null || previous === null) return null;
  const max = Math.max(current, previous);
  return <svg className="airport-month-compare-model" viewBox="0 0 360 245" width="360" height="245" aria-hidden="true">
    <path d="M30 190 H320" stroke="#d4e2e8" fill="none"/>
    {[previous, current].map((value, index) => {
      const x = 60 + index * 150, h = max > 0 ? value / max * 155 : 0, y = 188 - h;
      return <g key={index} data-value={value}>
        {h > 0 && <>
        <path d={`M${x} ${y} h64 V188 h-64 Z`} fill={index ? '#a9d5ec' : '#c6e5f6'}/>
        <path d={`M${x+64} ${y} l12 -8 V180 l-12 8 Z`} fill="#81b3cd"/>
        <path d={`M${x} ${y} l12 -8 h64 l-12 8 Z`} fill="#e5f5fc"/>
        </>}
        <text x={x+32} y="211" textAnchor="middle" fill="#000" fontSize="12">{index ? currentLabel : previousLabel}</text>
        <text x={x+32} y="232" textAnchor="middle" fill="#000" fontSize="14">{Math.round(value).toLocaleString(numberLocale)}{unit}</text>
      </g>;
    })}
  </svg>;
}
