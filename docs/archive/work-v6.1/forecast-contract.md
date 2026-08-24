# RetailPulse Korea — Immutable Forecast Contract

Every production forecast is append-only and must contain:

```json
{
  "predictionId": "uuid",
  "createdAt": "KST/UTC instant",
  "targetDate": "YYYY-MM-DD",
  "targetHour": "optional hour",
  "area": "myeongdong|hongdae|seongsu",
  "industry": "one of six supported industries",
  "targetId": "TARGET_A|TARGET_B|TARGET_C|TARGET_D",
  "forecastValue": 0,
  "forecastClass": "low|normal|high",
  "confidence": "low|medium|high",
  "modelVersion": "string",
  "proxyVersion": "string",
  "featureVersion": "string",
  "dataCutoff": "instant",
  "sourceVersions": {},
  "availableDataHash": "sha256",
  "predictionHash": "sha256",
  "recordOrigin": "PROSPECTIVE|BACKFILL"
}
```

Rules: write before the outcome is known; never update the forecast value after issue; new logic requires a new model/proxy/feature version; store only features whose `availableAt <= dataCutoff`; record missing/stale sources and confidence degradation. Backfill is never promoted to prospective evidence.
