# Incheon Airport facility / store source — contract review (Phase E · A2)

**Status:** BLOCKED — waiting on owner-supplied source identity and terms
**Date:** 2026-09-03 KST
**Scope:** Phase E step A2 (official facility/store directory), and therefore A3 (facility-to-zone mapping) and A4 (facility-specific briefing), which depend on A2.

## 1. What Phase E A2 needs

An official or public Incheon International Airport facility/store directory that KORETAIL may reuse commercially and automatically, covering at least:

- duty free, restaurants/cafés, convenience, pharmacy, services, lounges (if allowed), other passenger facilities
- terminal / zone / floor / gate-vicinity attributes so facilities can be related to the checkpoints and passenger flow already on the airport screen

Only that data could feed a searchable facility list with category filtering, terminal/zone guidance and the A3/A4 operational layer. Nothing else is acceptable: KORETAIL shows no facility data it cannot attribute to a verified official/public source.

## 2. What the repository holds today

- `app/retailpulse-data.ts` lists a catalog row `INCHEON DUTY-FREE FACILITIES` (provider "Incheon Airport", `status: CONDITION_REVIEW`, `commercial: "Usage terms review"`, `free: "Public web directory"`, `redistribution: "Link / derived metadata only"`). It is a placeholder for a future review, not a verified contract.
- `docs/DATA_SOURCES.md` has **no** verified contract row for any facility/store dataset. The verified A-series contracts (A1–A5) are flight status, duty-free flight lists, departure-hall congestion and passenger forecasts — none of them describe facilities.
- No adapter, migration, collector or test references a facility/store source. There is nothing to activate.

## 3. Why it could not be verified in this session

The build sandbox cannot reach the provider hosts: `curl` to `https://www.data.go.kr/…`, `https://www.airport.kr/…` and `https://apis.data.go.kr/…` all ended without an HTTP response (connection blocked at the network policy, not a provider error). GitHub Actions can reach them — the existing `smoke-public-apis.yml` pattern proves that — but a read-only probe still needs a dataset identity and an operation name to call, and neither exists in the repository. Guessing a dataset id, an operation name or field names would violate the project rule against fabricated contracts.

## 4. What the owner needs to supply (same path that unblocked A4-T2 and A5)

1. **Dataset identity**: the exact data.go.kr dataset id (`15xxxxxx`) or the Incheon International Airport Corporation OpenAPI 활용가이드 for the facility/shop information service, plus the operation name(s) and base URL.
2. **Terms**: the dataset's 이용허락범위 / licence text, and confirmation that commercial use and automated periodic collection are permitted (the same two conditions every other KORETAIL source had to pass).
3. **Key**: whether it uses the existing `DATA_GO_KR_SERVICE_KEY` or another credential (never pasted into chat, prompts or code — GitHub/Cloudflare secrets only).
4. **Field sample**: one real response page (secrets redacted), so the adapter is written against observed fields rather than assumed ones.

With those four items the A2 work is bounded: contract test → adapter → additive migration → bounded collector on an existing workflow (no sixth cron) → facility list UI → A3 zone mapping → A4 facility briefing, each as its own PR with production verification.

## 5. Safe behaviour until then

- The airport screen shows only what is verified: A1's per-terminal briefing (observed queues, official forecast bands, counted departures and gates) and the existing at-a-glance grid.
- No facility names, categories, opening hours or locations are displayed or stored.
- The `INCHEON DUTY-FREE FACILITIES` catalog row stays `CONDITION_REVIEW` and is not promoted.
- Private employer data (Shilla Duty Free) is not an alternative and will not be used.

## 6. Impact on the Phase E plan

| Step | State |
|---|---|
| A1 terminal briefing | DONE (PR #97) |
| A2 facility directory | BLOCKED on §4 |
| A3 facility-to-zone mapping | BLOCKED (depends on A2) |
| A4 facility briefing + executive print view | BLOCKED (depends on A2/A3) |

The remaining airport UX items from the brief that do not need facility data were checked against the current screen: the checkpoint list is already collapsed to the longest wait per terminal with an accessible toggle, the rest-of-day and peak tiles exist with a COMPLETE-coverage gate, and the home screen already uses the **arrival** forecast (not departures) as the Seoul demand-leading signal.
