# Outcome Contract

Outcomes never overwrite predictions. Each record stores prediction ID, target ID, event time, official availability time, collection time, actual value/unit, source/version, verification level and quality status.

## Levels

- `FAST`: operational results available within days, such as actual flight operation, observed weather, stored Seoul snapshot or delayed short-stay foreign presence when target-matched.
- `DEEP`: slower outcomes closer to shopping/tourism movement, subject to reuse approval and stable mapping.
- `STORE`: future voluntary, aggregate-only partner data such as visitors, transactions, sales index, conversion or stockout. No store outcome currently exists.

The system must not call a weather actual an actual for foreign retail demand, or compare an airport flight target against an area retail proxy. Unmatched outcomes remain context, not accuracy evidence.
