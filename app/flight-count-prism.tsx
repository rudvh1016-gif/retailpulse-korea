/** Flight-count comparison only. Text values, share denominator and registration provenance stay beside it. */
export function FlightCountPrism({ flights, maximum }: { flights: number; maximum: number }) {
  const width = maximum > 0 ? Math.max(0, flights) / maximum * 148 : 0;
  return <svg className="flight-count-prism" viewBox="0 0 160 20" width="160" height="20" aria-hidden="true" data-flights={flights}>
    <path d="M0 18 H158" stroke="#dce8ee" />
    {width > 0 && <>
      <path d={`M1 6 H${width} V17 H1 Z`} fill="#c6e5f6"/>
      <path d={`M1 6 l5 -4 H${width+5} l-5 4 Z`} fill="#e9f7fd"/>
      <path d={`M${width} 6 l5 -4 V13 l-5 4 Z`} fill="#a0c7d9"/>
    </>}
  </svg>;
}
