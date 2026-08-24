# RetailPulse Korea — Outcome Contract

```json
{
  "predictionId": "uuid",
  "targetId": "TARGET_A|TARGET_B|TARGET_C|TARGET_D",
  "outcomeType": "FAST|DEEP|STORE",
  "eventDate": "instant/date",
  "availableAt": "instant",
  "collectedAt": "instant",
  "actualValue": 0,
  "actualUnit": "documented unit",
  "source": "official or consented source",
  "sourceVersion": "string",
  "verificationLevel": "FAST|DEEP|STORE",
  "qualityStatus": "VALID|PARTIAL|REVISED|MISSING"
}
```

FAST outcomes arrive within days (actual weather, operations, permitted city activity). DEEP outcomes arrive later but are closer to foreign presence or shopping movement. STORE outcomes are separate consented aggregates such as visits, transactions or sales index; current count is zero. No personal customer identifiers are required.
