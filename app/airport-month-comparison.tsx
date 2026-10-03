/** Equal-size points on one zero-based axis; labelled values remain in the definition list. */
export function AirportMonthComparison({ current, previous, currentLabel, previousLabel, numberLocale, unit }: { current: number | null; previous: number | null; currentLabel: string; previousLabel: string; numberLocale: string; unit: string }) {
  if (current === null || previous === null) return null;
  const max = Math.max(current, previous) * 1.1;
  const pointX = (value: number) => 24 + (max > 0 ? value / max * 312 : 0);
  return <svg className="airport-month-compare-model" viewBox="0 0 360 110" width="360" height="110" aria-hidden="true">
    <path d="M24 56 H336" stroke="#d4e2e8" fill="none"/>
    <path d={`M${pointX(Math.min(previous,current))} 56 H${pointX(Math.max(previous,current))}`} stroke="#b9dcd5" strokeWidth="8" strokeLinecap="round"/>
    <text x="24" y="77" textAnchor="middle" fill="#000" fontSize="12">0</text>
    {[previous, current].map((value, index) => {
      const x = pointX(value);
      return <g key={index} data-value={value}>
        <path d={`M${x} ${index ? 66 : 46} V${index ? 79 : 35}`} stroke="#c1d5dc"/>
        <ellipse cx={x} cy="59" rx="8" ry="3" fill="#dde8ec"/>
        <circle cx={x} cy="56" r="7" fill={index ? '#b6d8d0' : '#b7ddea'} stroke="#a4c4d0"/>
        <circle cx={x-2} cy="54" r="2" fill="#fff"/>
        <text x="24" y={index ? 99 : 18} fill="#000" fontSize="12">{index ? currentLabel : previousLabel}</text>
        <text x="336" y={index ? 99 : 18} textAnchor="end" fill="#000" fontSize="14" fontWeight="700">{Math.round(value).toLocaleString(numberLocale)}{unit}</text>
      </g>;
    })}
  </svg>;
}
