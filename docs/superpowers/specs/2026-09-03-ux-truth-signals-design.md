# Current Signal Truth and Layout Design

**Date:** 2026-09-03
**Status:** owner-approved by the unattended master execution brief
**Scope:** Phase A only — clarify the existing live-signal surface without performing the later white-first redesign

## Subject, audience, and job

KORETAIL is an official-data decision aid for retail operators comparing Myeongdong, Hongdae, and Seongsu. This screen has one job: let an operator distinguish what is current, forecast, delayed, or historical without mistaking a signal for sales or visitors.

## Root cause

The provider and D1 records already separate the OA-21285 commercial status, payment range, reference time, retrieval time, and freshness. The client collapses them into one ambiguous phrase. The event query already retrieves multiple official events and their detail fields, but the client uses only the first event, the route shortens its overview, and CSS hides the remainder behind a two-line clamp. A flat numbered row template then gives every time horizon equal visual weight and moves source notes away from their values.

## Truth contracts

### Commercial activity

- Treat `CMRCL_TIME` only as the verified reference/end time. The current authenticated contract proves a recent ten-minute measure and a KST reference minute, but not a separately published interval start. Render `23:10 기준 최근 10분`; never synthesize `23:00–23:10`.
- Keep status, amount, optional count, reference window, and retrieval time as separate fields.
- State that this is based on Shinhan Card domestic-consumer payments, is not total sales, and is not foreign-consumer spending in KO/EN/ZH/JA.
- Nullable payment values remain absent. A suppressed amount receives a localized privacy-protection message and never becomes zero.
- A stale last-good row remains visible with its age and original reference time.

### Events

- De-duplicate first by official content ID and then by normalized title + period + address.
- Rank running events first; rank upcoming events by nearest start; use distance and title as deterministic tie-breakers.
- Return the bounded current event set already read by the summary, with no provider request. The first three are representatives; the exact de-duplicated total drives the all-events control.
- A card uses only official category, title, period, address, distance, overview, and homepage.
- A deterministic first complete sentence is the preview. The stored official overview remains available through an accessible details control without a permanent line clamp.
- Render a homepage only when it parses as `http:` or `https:`. Open it in a new tab with `noopener noreferrer`.

## Information architecture

The existing paper, ink, blue, green, amber, and red tokens remain unchanged:

- Paper `#F5F3ED`
- Ink `#111217`
- Muted `#686970`
- Rule `#D5D3CC`
- Action blue `#214CFF`
- Live green `#087A55`

Typography stays locale-aware: Pretendard Variable for Korean/English, Noto Sans SC for Chinese, and Noto Sans JP for Japanese, using only 400 and 600.

The distinctive device is a compact **truth ledger**: every value owns its time-state label and source/limitation directly below it. Numbering disappears because the signals are not a sequence.

```text
NOW                                      REALTIME / RECENT
  Current estimated population
    23,000–25,000 people · Somewhat busy
    Seoul real-time city data · observed 3 min ago · not cumulative

  Recent 10-minute domestic-card activity
    [status] [payment amount] [payment count]
    [23:10 reference] [23:12 collected]
    Shinhan Card domestic consumers · not total sales · not foreign spend

MOVEMENT AND FOREIGN FLOW                RECENT / DELAYED
  ...

TODAY AND NEXT                           OFFICIAL SCHEDULE / FORECAST
  Nearby events · 13 running or upcoming
    [representative card] [representative card] [representative card]
    [View all 13]

PAST COMMERCIAL INFORMATION              HISTORICAL
  ...
```

Mobile stacks the ledger label above the value and source. Commercial metrics become one column, event cards are full width, and all controls have a minimum 44px target. Desktop keeps the label column consistent but caps value/source prose near 70 characters instead of pushing it to the far edge. Long event prose uses a readable measure.

## Deliberate restraint review

An earlier idea used colored cards for every time horizon. That would become the full visual redesign the phase forbids and would make official status look like decoration. The revised design uses existing rules, spacing, and one restrained state badge; the structural change—not a new visual theme—does the work.

## Non-goals

- No provider request, collector change, Demand Index change, scheduler change, or Cron addition.
- No new paid service, runtime LLM summary, invented event text, or inferred commercial interval start.
- No full brand, navigation, hero, or white-first redesign in Phase A.
