# RetailPulse Seoul — Forecast Validation & User Acquisition Plan

Updated: 2026-08-23 KST  
Status: **IMPLEMENTED IN WORK WHERE POSSIBLE / PUBLIC ACCESS BLOCKED**

## 1. Cold assessment

RetailPulse currently has no evidence that its own forecast is accurate. Official airport and foreign-living-population history is useful for description and offline research, but it is not a forecast captured before the outcome. The previous Demo scoreboard (`30`, `21`, `6`, `3`, and sample MAE values) could be mistaken for real performance and has been removed.

The second critical problem is acquisition. The current Sites project access policy is owner-only custom access. Search engines and ordinary users cannot enter, so SEO, sharing, a custom domain, and a signup form cannot create real demand until the owner explicitly approves public access. This is the single largest acquisition blocker.

## 2. Forecast evidence contract

Every prospective record must contain:

- `forecastIssuedAt`
- `targetDate`
- `area` or `terminal`
- `metric`
- `predictedValue`
- `modelVersion`
- `featureSnapshotVersion`
- `sourceUpdatedAt`
- `recordOrigin: FORECAST_CAPTURED`

After the target period closes, connect:

- `actualValue`
- `outcomeResolvedAt`
- `actualSource`
- `publishedStatus`

Never relabel `OFFICIAL_HISTORICAL` or `BACKFILLED` records as `FORECAST_CAPTURED`.

## 3. Publication gates

No public accuracy number before both of these are true:

1. at least 30 distinct resolved target dates;
2. at least four continuous calendar weeks.

Even after the first publication gate, label the result “initial evidence.” Model promotion requires at least 90 prospective days, stable source health, no leakage, and a documented advantage over simple baselines. Do not automatically promote a challenger.

Required baselines:

- same weekday last week;
- recent four-week same-weekday average;
- seasonal average when enough history exists.

Metrics should include MAE, bias, threshold-band hit rate, coverage, missing-outcome rate, and performance by area. A single overall hit rate is insufficient.

## 4. Acquisition loop implemented in this build

The Home flow now uses:

1. audience choice;
2. Today Brief;
3. today/tomorrow area comparison;
4. airport summary;
5. What Changed;
6. quick actions;
7. a real beta signup form;
8. detailed area evidence.

The beta form stores only email, interest segment, locale, source path, consent version, and timestamps in Cloudflare D1. It includes consent, validation, a honeypot, deduplication by normalized email, loading/success/error states, a self-service deletion endpoint, and no public GET endpoint. Deletion returns the same response whether or not an address existed to avoid membership disclosure. No payment or sensitive data is collected.

The form creates a contact list but does not send mail. Production still needs a transactional email provider, unsubscribe handling, suppression list, and a sender domain. Until that exists, the UI says only that the request is stored.

## 5. Acquisition priorities for a solo operator

### P0 — unblock access

- Owner explicitly changes Sites access from custom owner-only to public.
- Re-test anonymous browser access.
- Submit sitemap only after anonymous HTML and canonical URLs work.

### P1 — build one repeatable habit

- Weekly “What Changed in Seoul” email, not a daily promise.
- One useful share card per area and airport terminal.
- Focus on one user group first: airport/duty-free operators or Seoul visitors, not both in the same campaign.

### P2 — measure intent

- `beta_signup_submit`
- `share_pulse`
- `returning_user`
- `opening_brief_view`
- `flight_search`
- `history_view`

Do not add analytics before a privacy-respecting provider and consent policy are selected.

## 6. Failure conditions

Stop expanding features if any of these remain true for 30 days:

- fewer than 20 real beta signups;
- fewer than 10 returning users per week;
- no one uses Search, Airport Next, or Opening Brief twice;
- no prospective outcomes are resolving;
- the public site remains behind login.

In that case, narrow the product to the most-used journey instead of adding regions, airlines, or charts.

## 7. Current blockers

- `HANDOFF_REQUIRED`: explicit owner approval to make the Sites access policy public.
- `HANDOFF_REQUIRED`: live public-data credentials and server collectors.
- `HANDOFF_REQUIRED`: scheduled forecast capture and outcome resolver.
- `HANDOFF_REQUIRED`: email delivery provider, sender domain, unsubscribe workflow.
- `HANDOFF_REQUIRED`: privacy-respecting analytics and Search Console.

## 8. Next Claude Code tasks

1. Add `forecast_records`, `actual_outcomes`, `source_snapshots`, and `evaluation_runs` tables.
2. Schedule forecast capture before each target date and make records immutable.
3. Resolve outcomes only from validated official sources.
4. Compute baselines and metrics with leakage tests.
5. Add an internal, non-indexed evidence review page.
6. Export D1 beta signups securely; never expose a public list endpoint.
7. Connect an email provider only after unsubscribe and privacy text are ready.
8. After explicit approval, change the site access policy to public and verify anonymous access.
