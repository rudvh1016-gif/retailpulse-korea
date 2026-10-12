# Domestic destinations and confirmed transit flights

The monthly KR destination aggregate is now labelled “국내 목적지” (localized in all four languages), without the international destination flag treatment. The full destination-country table uses the same label. Airline registration-country labels are unchanged. No country, flight, count, included day, percentage denominator or ranking row is removed or recalculated.

The monthly payload does not contain an airport-by-airport breakdown. It is therefore not labelled “domestic transit flights”, and the October/September aggregate is not presented as if one day's Gimhae/Daegu examples explained the entire month.

The existing flight browser keeps actual destination airport names. Only these verified outbound flight/destination pairs receive “국내 환승편”: KE1401/1403/1405/1407/1409 → PUS (김해), KE1431 → TAE (대구). Both the actual mapped destination and the flight designator must match. Other KR destinations, including CJU and different or unknown services, remain generic domestic destinations. This conservative allowlist does not claim to list every transit service.

The supporting Korean Air guide is https://www.koreanair.com/contents/booking/reservation-guide/how-to-book/domestic-transit?hl=ko, whose contents were confirmed by the parent on 2026-10-12: Busan/Daegu–Incheon international connection services require a combined international ticket and cannot be booked or used as standalone domestic travel. The flight's schedule/status is still shown separately; a service-type label does not claim that today's flight departed. The official guide is linked within the confirmed flight's details.

Airport name/IATA search works with both 김해 and PUS. No new API request, collector, monthly schema, operational data or passenger-nationality inference was introduced. Latest-main top-eight/more controls are preserved. Claude PR346's preload/retry files are untouched. React and vendored web-design review found no new hook, focus, request-waterfall or dependency changes.

Actual public API captures at 2026-10-12T06:43:09.299Z:
- [T2 monthly domestic card](screenshots/domestic-destinations-20261012/monthly-domestic-390.png): both displayed means remain6.1; the underlying October67/11 and September183/30 evidence remains in PR347.
- [KE1401 example](screenshots/domestic-destinations-20261012/confirmed-transit-390.png): 김해 and the transit restriction are shown, while the actual source status remains “상태 미확인”.

Validation: TypeScript, scoped ESLint (0 errors, one existing flag-image advisory), unit12 including negative transit-classification cases and unchanged monthly aggregation, unchanged UI-lock, native vinext build, and browser5 passed. Browser coverage includes Korean360/390, English/Chinese/Japanese390, exact monthly totals, unchanged registration country, separate flight classifications, official link, keyboard opening, airport-code/name search, reduced motion, no horizontal overflow and no pageerrors. Rendered HTML result and exact remote SHA/CI are recorded in the draft PR. No merge or deployment was performed.
