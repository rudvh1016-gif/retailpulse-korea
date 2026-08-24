# RetailPulse Korea · Seoul

RetailPulse Korea (RPK) is an experimental foreign-visitor retail intelligence product. The current scope is Seoul: Myeongdong, Hongdae and Seongsu.

It combines permitted official public signals—airport flow, short-stay foreign presence, tourism, weather and events—to present a today/tomorrow **foreign shopping demand signal**, explain why it changed and turn it into a deterministic store opening brief.

## Important truth

- The foreign shopping signal is a proxy, not foreign sales.
- Foreign presence is not the same as tourists or purchasers.
- Airport passengers, flights, routes and airlines do not identify visitor nationality or store demand.
- Official historical data is not a forecast captured at that past date.
- Public accuracy stays unavailable until immutable prospective forecasts are matched to later outcomes.
- The current Work site contains official historical aggregates and clearly labelled Demo current/forecast values. It calls zero external public-data APIs at visitor runtime.

## Product surfaces

- TODAY: area ranking, brief, airport context and what changed.
- AIRPORT: all/T1/T2, flight wave/search, gate/check-in/status Demo and official history.
- BUSINESS: six industries, tomorrow signal, why, opening brief, actions and history.
- INSIGHTS: seven-day Demo, Forecast Lab, Track Record, baselines and historical highlights.
- MORE: data sources, methods, readiness, preferences and error-state previews.
- Languages: Korean, English, Simplified Chinese and Japanese.

## Local checks

Requires Node.js `>=22.13.0`.

```bash
npm run install:ci
npm run lint
npm test
```

The project targets zero paid runtime API/data/LLM cost beyond a separately approved domain. Secrets must remain in production secret stores and never enter frontend code or Git history.

## Production handoff

Start with:

- [`public/production-handoff.md`](public/production-handoff.md)
- [`public/data-source-matrix.md`](public/data-source-matrix.md)
- [`public/forecast-target-registry.md`](public/forecast-target-registry.md)
- [`public/forecast-contract.md`](public/forecast-contract.md)
- [`public/outcome-contract.md`](public/outcome-contract.md)
- [`public/no-leakage-policy.md`](public/no-leakage-policy.md)
- [`public/zero-cost-policy.md`](public/zero-cost-policy.md)
- [`public/30-60-90-plan.md`](public/30-60-90-plan.md)
- [`public/qa-report.md`](public/qa-report.md)

No licence is granted for third-party data or images merely because the repository is public. Verify source terms before reusing any bundled data or asset.
