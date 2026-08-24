# RetailPulse Seoul V5.8 — Pessimistic QA Report

Date: 2026-08-23 KST  
Scope: forecast evidence, acquisition, information architecture, code, D1, multilingual copy

## Result summary

- Build: **PASS**
- ESLint: **PASS**
- TypeScript `tsc --noEmit`: **PASS after one fix**
- Automated regression tests: **14 / 14 PASS**
- Desktop primary-flow browser check: **PASS**
- Mobile CSS regression: **PASS by source/test; physical iPhone recheck still required after deployment**
- Anonymous user acquisition: **BLOCKED — current Sites access is custom owner-only**
- Real forecast accuracy: **BLOCKED — 0 prospective dates and 0 resolved outcomes**
- Email delivery: **BLOCKED — signup storage exists, sender workflow does not**

## Bugs found and fixed

### 1. Fabricated-looking forecast performance

**Severity: Critical**  
The UI showed a Demo scoreboard with 30 results, 21 good, 6 fair, 3 misses, and MAE values. Even with a Demo label, it could be read as real evidence.

**Fix:** Removed the full scoreboard and all sample MAE numbers. Replaced it with 0 captured target days, 0 resolved outcomes, 0 published metrics, explicit publication gates, baselines, and leakage rules.

### 2. Fake confidence percentages

**Severity: Critical**  
Area details, seven-day forecast, and Business displayed 74% or 71% confidence despite no prospective validation.

**Fix:** Removed those percentages. They now say `NOT VERIFIED`, `DEMO ONLY`, or `미검증`. Business signal health is labeled `DEMO · NOT LIVE`.

### 3. No durable acquisition path

**Severity: High**

Share and local preferences existed, but there was no way for an interested user to leave a durable contact.

**Fix:** Added consented D1 beta signups with email normalization, interest segmentation, locale, path, timestamps, duplicate upsert, loading/success/error states, and honeypot.

### 4. No actionable deletion path

**Severity: High**  
The first beta form draft mentioned deletion but had no user-facing method.

**Fix:** Added self-service deletion using the same email. The endpoint does not disclose whether an address existed.

### 5. Duplicate Home discovery sections

**Severity: Medium**  
Quick Actions and the Product Map repeated similar links and made Home longer.

**Fix:** Kept Quick Actions on Home and moved the fuller Product Map to More. No feature was deleted.

### 6. Async D1 type regression in example code

**Severity: Medium**  
Changing the D1 helper to lazy dynamic import fixed Node-render tests but made example route calls return a Promise type.

**Fix:** Updated both example calls to await `getDb()`. `tsc --noEmit` then passed.

### 7. Node HTML regression test failed with `cloudflare:` import

**Severity: Medium**  
The server bundle imported `cloudflare:workers` while the Node test loaded the home route.

**Fix:** Lazy-load the Workers environment only when a D1 request executes. SSR shell tests now pass without weakening the test.

### 8. Custom period appeared editable but applied the old range

**Severity: High**

The month fields visibly changed, but submitting the form kept the previous six-month state. The earlier source-only test verified that controls existed and therefore produced a false PASS.

**Fix:** Replaced browser-dependent month inputs with explicit month selects, read submitted values from the form itself, and pass those exact values into Airport and Business history filters. A browser regression selected 2026-04 through 2026-06 and confirmed that KPIs and chart labels changed to exactly those three months. Mobile period controls now use a visible three-column grid instead of hiding the custom action beyond a horizontal scroll.

## Data-truth checks

- Official history is not presented as prospective evidence: **PASS**
- Backfill is not presented as captured forecast: **PASS**
- T1/T2 proportional allocation is absent: **PASS**
- Flight count is not passenger count: **PASS**
- Destination is not nationality: **PASS**
- Demo/Official labels retained: **PASS**
- K/M/B count abbreviations: **PASS**; period labels such as `6M` remain only as month selectors in English.

## Acquisition reality

The signup code is real, but the site cannot acquire users while anonymous visitors face login. This was not changed because changing Site access is an external permission change requiring explicit owner approval. SEO cannot compensate for a private site.

## Remaining risks

1. No rate limiter beyond honeypot and D1 email deduplication.
2. No email provider, unsubscribe link, suppression list, or sender domain.
3. No scheduled forecast capture or outcome resolver.
4. No real performance metric may be published yet.
5. Physical iPhone and Android checks should be repeated after deployment.
6. Public access must be explicitly approved and then verified signed out.
7. A single large client page remains a maintainability risk; split by domain during Production handoff without changing routes.

## Required next gates

- Owner approval for public access.
- Anonymous signed-out test.
- D1 table existence and invalid-request API smoke test.
- First 30 prospective outcome days before any initial public accuracy.
- 90 days plus baseline advantage before model promotion review.
