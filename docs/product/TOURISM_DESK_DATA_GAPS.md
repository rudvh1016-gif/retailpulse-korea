# Tourism Desk — what a guide asks that KORETAIL cannot answer

**Recorded:** 2026-09-04 KST
**Scope:** the three-area Tourism Desk pilot: Myeongdong, Hongdae and Seongsu
(`/{lang}/tourism-desk/{area}`).

This is a list of questions a 관광통역안내사 or information-desk worker is
actually asked, which the pilot **does not answer today**. Nothing here has
been integrated. It exists so a later decision is made against a written
record of cost and licence rather than against "an API exists".

The rule for adding any of these: it has to change what a real worker
*does*, not add a row to a screen. Priority below reflects that, not how
easy the integration would be.

## What the pilot answers today

The same reusable guide workflow serves exactly three areas: Myeongdong,
Hongdae and Seongsu. The area switch changes the URL and every scoped signal;
it does not add nearby stations or mix area records. Each page is ordered for
the question a worker asks before a shift, not for the order in which datasets
were collected:

1. 오늘 근무 브리핑 — three to five high-value facts for the next 10–30 seconds
2. 오늘 안내할 것 — a small, evidence-ranked set of official event records
3. 교통 흐름 참고 — the area's one mapped station, with alighting first
4. 지금 지역 상황 — the detailed crowd state and its observation time
5. 관광 흐름 배경 참고 — delayed foreign statistics and airport context
6. 관광객에게 보여주기 — a deliberately narrow visitor-facing event view
7. 자료 기준과 한계 — source periods, formulas and semantic boundaries

It uses only sources KORETAIL already collects:

| Block | Source | Cadence |
|---|---|---|
| 오늘 근무 브리핑 / 지금 지역 상황 | Seoul live city data (SEOUL_CITYDATA_PPLTN) and its official forecast | real-time |
| 실용 날씨 안내 | KMA village forecast, through the deterministic guide | ~hourly |
| 오늘 안내할 것 | KTO TourAPI official title, period, address and official link | by event date |
| 교통 흐름 참고 | Stored Seoul Metro daily boarding/alighting observations (OA-22723) | daily |
| 관광 흐름 배경 참고 | Short-stay foreign living population (OA-23018), foreign-purpose mobility and Incheon A5 arrival forecast | source-specific; visibly dated |
| 관광객에게 보여주기 | Safe subset of the same event and deterministic weather records | no additional collection |

No new provider or provider call was added for this workflow.

### Subway comparison contract

The primary station signal is **alighting flow**, not boarding. The mappings
remain exactly `명동역 4호선`, `홍대입구역 2호선` and `성수역 2호선`.
An alighting count is a station gate count: it is not a unique-person count,
an area visitor count or a tourist count.

Comparisons use only compact daily observations already stored by KORETAIL.
The read is bounded to the exact area, station, line, mapping version, source,
quality and date window. It never calls OA-22723 for historical comparison,
never fills a missing date with zero and never chooses a nearby date.

| Comparison | Evidence required before display |
|---|---|
| Previous day | exact `D-1` row with a positive baseline |
| Same weekday last week | exact `D-7` row with a positive baseline |
| Recent seven-day average | all exact `D-1` through `D-7` rows and a positive total |
| Four-week same-weekday average | all exact `D-7`, `D-14`, `D-21` and `D-28` rows and a positive total |

For one baseline, percentage change is `(current - baseline) / baseline ×
100`. For an average baseline, the same formula is applied to the arithmetic
mean without prematurely rounding that mean. A zero, negative, missing,
wrong-station, wrong-line or duplicate baseline makes that comparison
unavailable. The UI omits it; it never shows a fabricated `0%`.

No simple previous-month-same-date comparison is shown because calendar and
weekday effects make it misleading. Month and year-on-year comparisons remain
unavailable until real stored history and a defensible documented method both
exist.

### Event and visitor-show truth contract

`startDate <= today <= endDate` supports only **"today falls within the
official event period"**. It does not prove that an event is physically
operating now or establish today's opening hours. Event cards, copied event
facts and visitor show all retain the instruction to check the official page
for actual operation.

Event priority is deterministic: today inside the official period, verified
area relevance or distance, then date proximity. It is not a popularity,
attendance or AI score. Visitor show accepts only the official event title,
official period, address, safe official URL, source and a deterministic
weather note. It excludes crowd statistics, diagnostics and inferred status.
Its Korean, English, Chinese and Japanese interface labels do not create a
translated proper name: when no verified official foreign-language name is
available, the official Korean source name remains unchanged and the gap is
stated.

## Gaps

### G1 — 약국 / pharmacy open now

**Worker question.** "지금 문 연 약국이 어디예요?"

**Why KORETAIL cannot answer.** The airport facility directory covers the
airport only. For the three Tourism Desk areas there is no collected pharmacy source at all,
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

**Why KORETAIL cannot answer.** Tourism Desk now exposes an event's official
period and official page, including in visitor show, but TourAPI event records
do not carry dependable per-attraction daily operating hours or closure days.
An official event period is not an "open now" signal.

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
verified KO/EN/JA/ZH names, but attractions and events in the three Tourism
Desk areas do not: TourAPI's multilingual endpoints are separate services
from the one collected. Visitor show therefore translates its interface and
weather guidance only; it preserves the official Korean proper name and says
that an official foreign-language name has not been verified.

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
chosen from what 3–5 Tourism Desk workers actually ask for during a 2–4 week
validation (see `docs/product/PILOT_VALIDATION.md`), not from this list's
ordering. No major expansion starts unless at least 1–2 of those workers
return voluntarily.
