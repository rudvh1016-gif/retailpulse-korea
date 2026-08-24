# RetailPulse Korea · Seoul V6.1 — 60-Point QA

Date: 2026-08-24 KST. `BLOCKED` means production evidence, key, approval or backend does not exist.

## PRODUCT 1–10

| # | Check | Status | Evidence |
|---:|---|---|---|
| 1 | Foreign Retail Intelligence is primary | PASS | hero, Business and Forecast Lab |
| 2 | Not generic congestion | PASS | area pulse and foreign-shopping proxy separated |
| 3 | Airport is supporting layer | PASS | context/utility scope only |
| 4 | Business is core | PASS | deepest why/brief/action/history flow |
| 5 | TODAY purpose clear | PASS | product definition and date switch |
| 6 | Tomorrow signal discoverable | PASS | Home and Business |
| 7 | Opening Brief discoverable | PASS | Business map and section |
| 8 | What Changed discoverable | PASS | Home and Insights |
| 9 | Forecast Lab discoverable | PASS | Insights map and section |
| 10 | Track Record discoverable | PASS | zero-state, FAST/DEEP and baselines |

## COMPETITION 11–15

| # | Check | Status | Evidence |
|---:|---|---|---|
| 11 | No direct fight with Seoul congestion | PASS | Seoul realtime is input/outcome only |
| 12 | No direct fight with airport super-app | PASS | parking/navigation/commerce excluded |
| 13 | No nationwide commercial-analysis claim | PASS | three Seoul areas frozen |
| 14 | No card/telco raw-data claim | PASS | paid/private sources excluded |
| 15 | Gap explicit | PASS | Foreign × Retail × Tomorrow × Why × Action × Validation |

## DATA TRUTH 16–25

| # | Check | Status | Evidence |
|---:|---|---|---|
| 16 | Proxy ≠ sales | PASS | UI, FAQ, registry |
| 17 | Foreign presence ≠ tourists | PASS | Data Truth copy |
| 18 | Shopping movement ≠ purchase | PASS | registry/policy |
| 19 | Tourism movement ≠ purchase | PASS | source matrix |
| 20 | Flights ≠ passengers | PASS | gate-flow boundary |
| 21 | Route ≠ nationality | PASS | Airport truth copy |
| 22 | Airport arrival ≠ Seoul visit | PASS | supporting-signal wording |
| 23 | Forecast ≠ actual | PASS | separate contracts |
| 24 | Backfill ≠ prospective | PASS | Lab and leakage policy |
| 25 | Historical ≠ live | PASS | status labels/runtime audit |

## TARGET 26–30

| # | Check | Status | Evidence |
|---:|---|---|---|
| 26 | Target registry exists | PASS | four versioned targets |
| 27 | Target unit clear | PASS | definition/unit/grain |
| 28 | Actual source clear | PASS | source/blocked state per target |
| 29 | Target grain clear | PASS | area/time/industry grain |
| 30 | Target-match rule exists | PASS | definition+unit+geo+time match |

## FORECAST 31–40

| # | Check | Status | Evidence |
|---:|---|---|---|
| 31 | `createdAt` | PASS | forecast contract |
| 32 | `dataCutoff` | PASS | forecast contract |
| 33 | `modelVersion` | PASS | forecast contract |
| 34 | `proxyVersion` | PASS | forecast contract |
| 35 | `sourceVersions` | PASS | forecast contract |
| 36 | `predictionHash` | PASS | forecast contract |
| 37 | immutable | PASS | append-only rule and UI |
| 38 | baselines defined | PASS | weekday, four-week, seasonal naive |
| 39 | Good/Fair/Miss predefined | BLOCKED | freeze numeric thresholds after production target distribution, before scoring |
| 40 | no fake accuracy | PASS | prospective counters zero; baseline N/A |

## OUTCOME 41–46

| # | Check | Status | Evidence |
|---:|---|---|---|
| 41 | `eventDate` | PASS | outcome contract |
| 42 | `availableAt` | PASS | outcome contract |
| 43 | `collectedAt` | PASS | outcome contract |
| 44 | FAST Outcome | PASS | defined; current count zero |
| 45 | DEEP Outcome | PASS | defined; current count zero |
| 46 | STORE Outcome separate | PASS | consented aggregate class; current count zero |

## LEAKAGE 47–50

| # | Check | Status | Evidence |
|---:|---|---|---|
| 47 | publication lag respected | PASS | three-clock rule |
| 48 | D-4 leakage prevented | PASS | explicit prohibition |
| 49 | future leakage prevented | PASS | availability reconstruction/split windows |
| 50 | official forecast contamination prevented | PASS | feature cannot also be independent baseline |

## ZERO COST 51–55

| # | Check | Status | Evidence |
|---:|---|---|---|
| 51 | paid API zero | PASS | policy prohibits it |
| 52 | paid data zero | PASS | commercial sources excluded |
| 53 | runtime LLM zero | PASS | source scan/dependency audit |
| 54 | automatic billing zero | PASS | degraded mode instead of purchase |
| 55 | paid fallback zero | PASS | explicit prohibition |

## DELIVERY 56–60

| # | Check | Status | Evidence |
|---:|---|---|---|
| 56 | Data Source Matrix complete | PASS | classified sources/failure behavior |
| 57 | Competitor Audit complete | PASS | official-service comparison |
| 58 | Production Handoff complete | PASS | product lock and P0–P3 order |
| 59 | Mobile + 4 languages + build | PASS | lint/build/render tests and responsive CSS review |
| 60 | Final publish | PASS | Sites version 18 verified after favicon correction |

## Pessimistic conclusion

The Work UI can pass while the business fails. The site still has zero live external data APIs, zero prospective forecasts, zero matched outcomes and zero store ground truth. Product direction is narrower and honest; predictive advantage is unproven. Production is blocked on keys/approvals, collectors, storage, public access/custom domain and elapsed evidence time.
