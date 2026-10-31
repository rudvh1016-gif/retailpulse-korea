# September forecast coverage review

Read-only review on 2026-10-31. No production writes or replacement estimates.

## Why the periods differ

`lib/passenger-reference-month.ts` includes a date only when **both** the departure-hall forecast and transfer-security forecast are complete for T1 and T2. September's passenger comparison therefore uses September 9 ~ September 30 (22 days), not the first 22 days of the month. Flight schedules have all September 1 ~ September 30 (30 days). These are independent measures.

Public read-only responses confirmed the passenger sum average is 105,589.045454545 (displayed 105,589 people), and the full-month flight average is 552.9. The passenger period must not be labeled “9/22 MTD”. The UI now emphasizes the actual observed date range and sample count.

## The eight dates are not wholly missing

`/api/live/summary?date=YYYY-MM-DD` reports complete departure-hall coverage on each date below, but **no transfer forecast**. Departure values alone cannot enter the combined comparison.

| Date | T1 departure | T2 departure | Departure total | Transfer forecast |
|---|---:|---:|---:|---|
| 2026-09-01 | 44,993 | 38,852 | 83,845 | Missing |
| 2026-09-02 | 46,705 | 39,929 | 86,634 | Missing |
| 2026-09-03 | 47,022 | 40,239 | 87,261 | Missing |
| 2026-09-04 | 51,330 | 44,563 | 95,893 | Missing |
| 2026-09-05 | 51,639 | 41,842 | 93,481 | Missing |
| 2026-09-06 | 53,659 | 44,490 | 98,149 | Missing |
| 2026-09-07 | 50,331 | 45,889 | 96,220 | Missing |
| 2026-09-08 | 44,852 | 38,122 | 82,974 | Missing |

September 9 has departure total 87,075 plus transfer T1 559 / T2 10,485. Its stored transfer retrieval timestamp is `2026-09-08T15:32:15.567Z`. `airport.passengerForecast: []` is not a valid coverage test for these responses; use the aggregate forecast and coverage fields.

## Recovery attempts

- Repository history first introduces transfer forecasting in `c7f052dab71e418278fb442925b97e2d9b48f094`, 2026-09-08 23:38:51 +09:00. Existing stored official fixtures start September 9. This explains the collection boundary; it does not prove earlier official forecasts never existed.
- Existing compressed official XLS fixtures were decoded in memory and passed through the existing strict parser. T1 September 9 SHA-256: `97d4474b99c8ce4f40f9dc63db853fba34e3b03edaeaaff0d2e0cb6fa5a27332`; T2: `21f98b568b6b0caea47809749e2423cd62c9cb242d23f375d523454dcd54d355`.
- The documented official XLS endpoint `/pni/ap_ko/statisticPredictCrowdedOfInoutExcel.do` was requested normally for T1 September 1 and T2 September 8. Both returned HTTP 302 without a Location header. A current-date control returned the same response, so this is an access/service limitation here, not evidence the historical file is absent. No blocking controls were bypassed.
- The official [forecast information page](https://www.airport.kr/ap_ko/883/subview.do), existing source-verification documents and repository history were reviewed. The page warns forecasts can change as flight schedules change. No trustworthy missing eight-day original archive was recovered. Monthly actuals and newly recomputed forecasts are not substitutes.

Result: retain the 22 complete forecast dates and explicit eight-day missing notice. Operational restoration remains unperformed because verified original transfer forecasts for those dates are unavailable.
