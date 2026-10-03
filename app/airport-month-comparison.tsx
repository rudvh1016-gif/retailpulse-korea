/** Shared-height comparison; the accessible, fully labelled values remain in the existing monthly definition list. */
export function AirportMonthComparison({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return null;
  const max = Math.max(current, previous);
  return <svg className="airport-month-compare-model" viewBox="0 0 360 210" width="360" height="210" aria-hidden="true">
    <path d="M30 190 H320" stroke="#d4e2e8" fill="none"/>
    {[previous, current].map((value, index) => {
      if (value <= 0 || max <= 0) return null;
      const x = 60 + index * 150, h = value / max * 155, y = 188 - h;
      return <g key={index}>
        <path d={`M${x} ${y} h64 V188 h-64 Z`} fill={index ? '#a9d5ec' : '#c6e5f6'}/>
        <path d={`M${x+64} ${y} l12 -8 V180 l-12 8 Z`} fill="#81b3cd"/>
        <path d={`M${x} ${y} l12 -8 h64 l-12 8 Z`} fill="#e5f5fc"/>
      </g>;
    })}
  </svg>;
}
