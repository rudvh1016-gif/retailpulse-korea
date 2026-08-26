# Data Sources

Last verified: 2026-08-26 KST. Recheck official terms immediately before activating Production.

| Source | Status | Cost | Key/approval | Production role | Truth boundary |
|---|---|---:|---|---|---|
| [Incheon Airport detailed flight status](https://www.data.go.kr/data/15140153/openapi.do) | `GREEN_FREE_APPROVAL` | Free | development 500 calls/day; operating increase requires reviewed use case | Flight, terminal, gate, check-in and status context | Flights are not passengers; gate flow is not store footfall |
| [Seoul real-time city data](https://data.seoul.go.kr/dataList/OA-21285/F/1/datasetView.do) | `GREEN_FREE_APPROVAL` | Free | Seoul Open Data key | Area activity actual/context | Total area population is not foreign tourists or shoppers |
| [Seoul short-stay foreign living population](https://data.seoul.go.kr/dataList/OA-15441/S/1/datasetView.do) | `CONDITIONAL` | Free public data | The former administrative-dong dataset ended after July 2026; new 250 m grid/API mapping and reuse terms must be rechecked | Delayed foreign-presence outcome/history | D-4 or later; presence is not tourism or purchase |
| [KMA village forecast](https://www.data.go.kr/data/15084084/openapi.do) and observed weather | `GREEN_FREE_APPROVAL` | Free | data.go.kr/KMA application and attribution | Forecast feature and later weather actual | Forecast and observation remain separate records |
| Shopping/tourism-purpose movement | `RESEARCH_ONLY` until automated commercial reuse is confirmed | No paid runtime planned | Dataset-specific approval | Deep verification candidate | Movement purpose is not purchase or sales |

No paid API, paid data, paid fallback or runtime LLM is approved. A source without verified commercial and automated-use terms remains disabled.

In the initial design there are three server-side secret variable names (`DATA_GO_KR_SERVICE_KEY`, `SEOUL_OPEN_DATA_KEY`, `KMA_SERVICE_KEY`). This does not necessarily mean three different issued strings: data.go.kr products may share an account authentication key while still requiring separate utilization applications. Confirm the account screen before entering values; never copy a key into this repository.

## Source lifecycle

Raw adapter → schema validation → canonical normalizer → D1 → internal API → UI. Canonical records store source, record origin, event time, publication/availability time, retrieval time, freshness, schema version, quality status and a source hash. The frontend never receives an official service key.

## Failure behavior

`LIVE`, `STALE`, `MISSING`, `DEGRADED`, `ERROR`, `OFFICIAL_HISTORICAL`, and `DEMO` are distinct. A last-good record may remain visible only with its original timestamp and a STALE label. Missing terminal data is N/A; it is never copied from the all-airport value.

The prepared airport schedule is 12 calls/day and at most 24 with its single retry, below the listed 500-call development quota. This is a quota calculation, not proof of a successful approved-key response.
