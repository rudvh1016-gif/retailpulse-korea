# Tourism Desk — what a guide asks that KORETAIL cannot answer

**Recorded:** 2026-09-04 KST
**Scope:** the Myeongdong Tourism Desk pilot (`/{lang}/tourism-desk`).

This is a list of questions a 관광통역안내사 or information-desk worker is
actually asked, which the pilot **does not answer today**. Nothing here has
been integrated. It exists so a later decision is made against a written
record of cost and licence rather than against "an API exists".

The rule for adding any of these: it has to change what a real worker
*does*, not add a row to a screen. Priority below reflects that, not how
easy the integration would be.

## What the pilot answers today

Only from sources KORETAIL already collects:

| Block | Source | Cadence |
|---|---|---|
| 지금 명동 crowding | Seoul live city data (SEOUL_CITYDATA_PPLTN) | real-time |
| 지금 명동 weather | KMA village forecast, via the deterministic guide | ~hourly |
| 오늘 명동 events | KTO TourAPI, official dates + official links | by event date |
| 외국인 흐름 · 대표역 | Seoul Metro daily boarding/alighting (OA-22723) | daily |
| 외국인 흐름 · 체류 | Short-stay foreign living population (OA-23018) | daily, ~9-day lag |
| 인천공항 입국 참고 | Incheon A5 arrival forecast | ~hourly |

No new provider was added for the pilot.

## Gaps

### G1 — 약국 / pharmacy open now

**Worker question.** "지금 문 연 약국이 어디예요?"

**Why KORETAIL cannot answer.** The airport facility directory covers the
airport only. For Myeongdong there is no collected pharmacy source at all,
and even the airport directory is a registration record with published
hours — it cannot say "open now".

**Possible official source.** 건강보험심사평가원 병원·약국 정보 (data.go.kr),
which publishes address and registered opening hours per pharmacy.

**Update frequency.** Periodic bulk, not real-time.
**Cost / licence.** Free, open licence — needs verification before use.
**Data quality risk.** Registered hours ≠ open now. Holiday and night-duty
rotas are published separately and are the part a visitor actually needs.
**Would it change an action?** Yes — this is the single most common
practical question. **Priority: HIGH**, but only if a night/holiday rota
source is verified with it. Registered hours alone would repeat the exact
"registration record read as live status" problem the airport directory
already taught us.

### G2 — 환전 / currency exchange

**Worker question.** "환전은 어디서 해요? 지금 열었어요?"

**Why KORETAIL cannot answer.** No collected source for licensed exchange
outlets outside the airport.

**Possible official source.** 한국은행 / 관세청 등록 환전영업자 registries.
**Update frequency.** Periodic.
**Cost / licence.** Free where published; needs verification.
**Data quality risk.** Registration ≠ currently trading, same class of
problem as G1. Rates are not published per outlet.
**Would it change an action?** Partly — a guide usually points to a bank or
a known street. **Priority: MEDIUM.**

### G3 — 짐보관 / luggage storage

**Worker question.** "캐리어 맡길 데 있어요?"

**Why KORETAIL cannot answer.** Lockers and storage desks are mostly
commercial operators with no official open dataset.

**Possible official source.** Seoul Metro station locker information for
station lockers only; the rest is private.
**Cost / licence.** Station data free; commercial operators would be a paid
or partnership integration — **out of scope under current constraints**.
**Would it change an action?** Yes, frequently asked. **Priority: MEDIUM**,
limited to station lockers, clearly labelled as station-only.

### G4 — 화장실 / public toilets

**Worker question.** "화장실 어디예요?"

**Possible official source.** 서울시 공중화장실 정보 (open data).
**Update frequency.** Periodic.
**Cost / licence.** Free.
**Data quality risk.** Location good, opening hours often missing.
**Would it change an action?** Yes, but a guide usually answers from memory
within their own block. **Priority: LOW for the pilot**, cheap later.

### G5 — 관광지 운영시간 / attraction opening hours

**Worker question.** "경복궁 오늘 몇 시까지예요? 휴관일이에요?"

**Why KORETAIL cannot answer.** TourAPI event records carry event dates,
not per-attraction daily operating hours or closure days.

**Possible official source.** TourAPI `detailIntro` per content id, and each
attraction's own official page.
**Update frequency.** Irregular; closure days change seasonally.
**Cost / licence.** Free within the existing key.
**Data quality risk.** Closure days are the field most often stale, and a
wrong closure day sends a visitor across the city for nothing. That risk is
worse than not answering.
**Would it change an action?** Yes. **Priority: HIGH**, but only with a
visible "confirm on the official page" link rather than a bare time.

### G6 — 공항 이동 / getting to the airport

**Worker question.** "공항 어떻게 가요? 얼마나 걸려요?"

**Why KORETAIL cannot answer.** No route or timetable source is collected.
KORETAIL has airport-side congestion and arrival forecasts, not transport
between Myeongdong and Incheon.

**Possible official source.** 공항철도 timetable, 서울시 버스 노선 정보.
**Cost / licence.** Free.
**Data quality risk.** A published timetable is not live running status.
**Would it change an action?** Partly — the answer is stable enough that a
guide already knows it. **Priority: LOW.**

### G7 — 면세 / 세금환급 안내

**Worker question.** "택스리펀 어디서 받아요?"

**Why KORETAIL cannot answer.** Refund-desk locations are operator
information, and the airport directory's refund entries are registration
records.

**Note.** Anything sourced from an employer's internal knowledge is
**excluded by policy**, regardless of how easy it would be. Only publicly
verifiable official sources are eligible.
**Priority: LOW**, and only from public sources.

### G8 — 다국어 공식 장소명

**Worker question.** A visitor shows a name in Chinese or Japanese; the guide
needs the official Korean name to give directions.

**Why KORETAIL partly cannot answer.** The airport facility directory has
verified KO/EN/JA/ZH names, but Myeongdong attractions do not: TourAPI's
multilingual endpoints are separate services from the one collected.

**Possible official source.** TourAPI multilingual services.
**Data quality risk.** Coverage is uneven; a fabricated translation would be
worse than none, so any gap must fall back to the Korean name unchanged.
**Would it change an action?** Yes for non-Korean-speaking staff.
**Priority: MEDIUM.**

## What must not be built to close these

- No scraped commercial listings, no map-service data, no review data.
- No "open now" derived from registered hours. That inference is exactly
  what the airport directory work established KORETAIL will not make.
- No employer-internal knowledge, in any of these gaps.
- No paid API, and no runtime LLM to paper over a missing field.

## How to decide

None of these is scheduled. The next one to build — if any — should be
chosen from what pilot users actually ask for during validation (see
`docs/product/PILOT_VALIDATION.md`), not from this list's ordering.
