# November–December 2026 candidate review

Reviewed on 2026-10-25 UTC. This is a bounded manual review of two candidates, not a complete calendar or a new collection schedule.

## Taiwan: add one institutional holiday date

- Add **2026-12-25 only**, Constitution Day (行憲紀念日), using the existing public-holiday kind with institutional scope for government administrative-office civil servants.
- DGPA's [2026 approval and applicability notice](https://www.dgpa.gov.tw/information?pid=12574&uid=41), published 2025-06-13, links [Appendix 3](https://www.dgpa.gov.tw/FileConversion?filename=dgpa%2Ffiles%2F202506%2F105f965b-c3e3-49e8-9e67-dadedccb2052.pdf&name=%E9%99%84%E8%A1%A83.pdf&nfix=). Its Constitution Day row identifies a December 25–27 interval inclusive of Saturday and Sunday. The statutory commemoration is Friday December 25; December 26–27 are weekend dates, not two added public holidays.
- Cross-checked the [official 2026 calendar publication](https://www.dgpa.gov.tw/information?pid=12685&uid=55) and its linked calendar PDF. The scope notice explicitly separates private employers and school calendars. No universal private-sector or school closure is inferred.
- Source date, event date and review date remain distinct. No other event or verification date is changed. Existing JP/US/SG automated replacement scopes do not cover TW. No Taiwan automatic collector exists in the current runtime country allowlist.
- Repository-wide calendar and notice search found no matching TW December 25 event; the existing Taiwan January 1, 2027 entry is independent and unchanged. Existing calendar API merges this seed, while `preparationEvents` and `mergeBriefHolidays` reuse it without extending dates.

## Korea CSAT: verified, not added to public holiday/calendar data

The Ministry of Education's [2026-10-20 policy notice](https://www.korea.kr/news/policyNewsView.do?newsId=148973935) confirms **2026-11-19, 13:10–13:35 KST** as the English-listening period for which aircraft/helicopter takeoff and landing times are to be adjusted. It is an operational timing reference, not a public holiday, evidence of stronger passenger demand, or confirmation that a specific flight will be delayed.

No duplicate CSAT record or matching official URL was found in repository calendar/approved notice data. However:

- `CalendarEvent.kind` and its validators accept only `public_holiday` or `school_break`, with inclusive civil dates; they cannot represent a 25-minute operational instruction.
- `official-notices.ts` accepts airport notice-board/urgent-banner sources, not a Ministry of Education source. That review channel is not public (`config/official-notices.review.json`). Customs news is also not a generic operations channel.
- Therefore this review **does not create an event under an incorrect kind, change the notice publication gate, invent an airport notice, or extend collector permissions**. A future separate operational-advisory design must preserve publisher, exact KST interval, applicability and expiry before public exposure.

## Validation boundary

Tests cover the exact single Taiwan date, weekends not ingested, institutional scope/source, API projection, country-context and preparation/brief reuse, no duplicate entry, and exclusion of CSAT from holiday/planning data. Existing data and all collector/authentication behavior are preserved. Local browser execution remains unavailable under the existing task restriction; CI is the render execution authority.
