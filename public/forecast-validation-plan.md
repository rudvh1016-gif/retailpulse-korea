# RetailPulse Korea — Forecast Validation Plan

## Evidence ladder

1. Historical walk-forward: research only, availability-aware.
2. Forward shadow: immutable forecasts saved before outcomes.
3. FAST verification: match rapidly available same-target outcomes.
4. DEEP verification: match delayed foreign-presence/shopping-movement outcomes.
5. STORE verification: optional consented aggregate business outcomes.

## Baselines first

Compare same weekday last week, four-week same-weekday average and seasonal naive. Use an official forecast only when it predicts exactly the same target and was not used as a model feature.

## Metrics

Target-appropriate MAE, direction accuracy, rank correlation, coverage, calibration and improvement over baseline. Never publish a single context-free “accuracy 87%”.

## Publication gates

- Fewer than 30 unique prospective target dates: `COLLECTING`, no accuracy claim.
- 30+ dates and four continuous weeks: `PRELIMINARY`, with coverage and target shown.
- Fewer than 90 days: no long-term stability or auto-promotion claim.
- Candidate promotion: forward shadow performance, baseline advantage, subgroup safety, data-quality stability and rollback plan required.

Good/Fair/Miss thresholds must be frozen per target before scoring begins. If the model does not beat a simple baseline, it remains shadow or is retired.
