/** Two low capsule bars share one dynamic zero-based axis. */
export function AirportMonthComparison({ current, previous, currentLabel, previousLabel, numberLocale, unit }: { current: number | null; previous: number | null; currentLabel: string; previousLabel: string; numberLocale: string; unit: string }) {
  if (current === null || previous === null) return null;
  const max = Math.max(current, previous) * 1.1;
  const width = (value: number) => max > 0 ? value / max * 312 : 0;
  return <><div className="airport-month-compare-wide" aria-hidden="true">
    {[previous, current].map((value, index) => <div className="airport-month-compare-row" key={index}>
      <div><span>{index ? currentLabel : previousLabel}</span><b>{Math.round(value).toLocaleString(numberLocale)}{unit}</b></div>
      <div className="airport-month-compare-track"><span data-period={index ? 'current' : 'previous'} data-value={value} style={{width: `${max > 0 ? value / max * 100 : 0}%`}} /></div>
    </div>)}
    <small>0</small>
  </div><svg className="airport-month-compare-model" viewBox="0 0 360 120" width="360" height="120" aria-hidden="true">
    {[previous, current].map((value, index) => {
      const w = width(value), y = 25 + index * 52;
      return <g key={index} data-value={value}>
        <text x="24" y={17+index*52} fill="#000" fontSize="12">{index ? currentLabel : previousLabel}</text>
        <text x="336" y={17+index*52} textAnchor="end" fill="#000" fontSize="14" fontWeight="700">{Math.round(value).toLocaleString(numberLocale)}{unit}</text>
        {w > 0 && <rect x="24" y={y} width={w} height="16" rx="2" fill={index ? '#7194b8' : '#43617f'}/>}
      </g>;
    })}
    <text x="24" y="112" fill="#000" fontSize="12">0</text>
  </svg></>;
}
