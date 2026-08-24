# RetailPulse Korea — Forecast Target Registry V1

Status: specification ready; production observations not yet collecting.

| Target | Definition | Unit / grain | Actual source | Publication lag | Horizon | Baselines | Public status |
|---|---|---|---|---|---|---|---|
| `TARGET_A AREA_ACTIVITY` | Overall activity signal for one supported area | index, area × hour/day | Seoul real-time city snapshot/archive where location matches | minutes; archive starts at launch | today / tomorrow | same weekday last week, four-week weekday average | DEMO → FAST |
| `TARGET_B FOREIGN_PRESENCE` | Short-stay foreign living-population signal in the documented administrative-dong mapping | persons, area × hour/day/month | Seoul short-stay foreign living population | recent API/file; legacy series ended 2026-07 pending grid migration | tomorrow / monthly | same weekday/month, four-week/seasonal naive | OFFICIAL HISTORY; prospective not started |
| `TARGET_C FOREIGN_SHOPPING_MOVEMENT` | Officially classified foreign shopping-purpose movement, where permitted | movement count/index, official area × hour/day | Seoul/KT official release after licence and mapping review | batch / delayed | tomorrow | seasonal naive, recent comparable periods | CONDITIONAL / DEEP |
| `TARGET_D FOREIGN_RETAIL_PROXY` | Versioned combination of permitted public foreign-retail signals | 0–100 proxy, area × industry × day | matched proxy components; never sales | component-dependent | tomorrow | same weekday, four-week weekday average | DEMO; no accuracy claim |

## Target-match rule

Scores are compared only when definition, unit, geographic grain, time grain, industry grain and availability policy match. An official whole-city population forecast cannot be used to claim accuracy for a Myeongdong beauty-retail proxy.

## Area mapping

- Myeongdong: official Myeong-dong administrative unit used by the bundled history.
- Hongdae: Seogyo-dong proxy; “Hongdae” is not itself one administrative-dong boundary.
- Seongsu: documented sum of four Seongsu administrative dongs in the current historical aggregate.

Mapping versions must be stored as `areaMappingVersion`; a boundary change creates a new version and no silent restatement.
