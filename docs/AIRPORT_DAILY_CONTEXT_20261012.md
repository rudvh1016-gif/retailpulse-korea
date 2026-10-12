# Airport daily context and missing official months

Base: `1c4adac2f9e6488b1dec667fa30fd05381c73370`. Draft only; no public merge, deployment, collector dispatch or database write.

## Changes

- Daily destination headings show the selected date (today only with matching KST clock) and selected time window. Monthly comparison headings remain separate.
- Similar-day facts retain departure counts and east share, then show Japan, mainland China and other known destinations. Unknown/missing records are excluded and disclosed; unavailable shares remain unavailable. The requested Korean label `기타국적행` is explicitly defined as destination, not passenger nationality. Ranking and similarity algorithms are unchanged.
- A compact departure summary immediately follows the choices. It consumes the existing verified planner, preserving unknown choices, conditional customs checks before bag drop, order-specific pickup and the concourse transfer notice. No new storage or API.
- Seoul movement cards show the human-readable Seoul Open Data source name while retaining dates, values, unverified units and internal dataset identifiers.
- The concourse screen now uses its already stored monthly country counts. The monthly T1 UI subtracts the exact separately stored concourse counts on the same included dates. It preserves stored terminal semantics and returns unavailable for an absent/inconsistent split. Official passenger history and security waits are never proportionally split.

## Official passenger history diagnosis

The screen reads `airportMonthly` in `app/retailpulse-data.ts`, not a collection table. The list ended at July 2026; the six-month filter correctly selected its last six entries. There is no monthly-history collector in this display path to restart.

On 2026-10-12 the official default page already displayed September:
https://www.airport.kr/co_ko/651/subview.do

Public form `/fsmFsn/co_ko/statisticCategoryOfTimeSeries.do` was queried with passenger aircraft `arplnSe=Y`, all routes/passenger types, `terminalId` empty/P01/P03, July–September 2026, `tmType=TM_M`, `firstYn=1`. July exactly matched existing ALL/T1/T2 entries. Newly appended published values:

| Month | ALL arrival | ALL departure | T1 arrival | T1 departure | T2 arrival | T2 departure |
|---|---:|---:|---:|---:|---:|---:|
| 2026-08 | 3,601,429 | 3,470,815 | 1,798,044 | 1,719,533 | 1,803,385 | 1,751,282 |
| 2026-09 | 3,167,685 | 3,144,533 | 1,578,144 | 1,538,638 | 1,589,541 | 1,605,895 |

Both directions reconcile T1+T2=ALL. The two verified rows and the single protected-file hash update are recorded in `docs/approvals/daily-country-context-20261012.json`; the active UI Lock is retained. Automatic monthly ingestion is not added: future published months still need a verified data update.

## Read-only data questions

- Public October monthly API returned T2 Korean destinations 67/11 included dates, versus September 183/30, both rounding to 6.1 flights/day. On October 12 the stored scheduled T2 records were KE1401/1403/1405/1407/1409 to Gimhae and KE1431 to Daegu. These are destination mappings, not airline registration or passenger nationality. They are not proof all flights actually departed. Official transfer-only domestic-flight guidance exists at https://www.airport.kr/ap_ko/940/subview.do; the UI does not relabel every Korean destination as transfer-only.
- The same public monthly payload contained separate concourse totals: September 4,078 and October 1–11 1,581, with destination-country counts. The missing cards were a missing component call, not missing retained totals.
- Public Myeongdong tourism movement 360.5 had reference date 2026-09-30 and source OA-22378. The existing parser sums finite non-suppressed `total_cnt` for destination administrative dong 11140550, purpose 5, on the latest recorded day. It is not an hourly average. The actual original CSV was not downloaded/re-summed in this work; the public payload does not establish the official unit. The separate 6,484.13 foreign-presence figure comes from OA-23018 at 2026-08-26 23:00 KST. No unit relabel or data correction is inferred from these distinct values.

## Validation and boundaries

Targeted unit checks cover unknown/zero/inconsistent splits and official-total reconciliation. Browser checks cover four locales, 320/360/390/430/1280 where applicable, date/terminal transitions, preparation yes/no/unknown choices, missing history, bounded loading, country lists, keyboard and reduced motion. Exact commands/results and remote CI are recorded in the draft PR.

The separate selected chart A and airport-glance previews are not implemented here. Their Library records resolve, but the Windows materialization path is blocked and the unauthenticated native download returns HTTP 403. No logged-in Chrome/Edge process or supported authenticated browser-control tool was available. No xattr patch, credential extraction, authentication bypass or user re-save request was used. No visual-match or performance-improvement claim is made.
