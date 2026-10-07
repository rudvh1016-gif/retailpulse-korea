# Midnight flight refresh, airport copy and airport weather

Base: `bf9362466145c2f2e047b8c74daedac6fbd72e54` (latest fetched main, PR309). Branch: `fix/midnight-flights-weather-copy-20261008`. One review PR; no agent merge, deployment, provider request, collector dispatch, METAR activation or restoration of withheld hall-side passenger estimates.

The owner requested removal of two airport paragraphs throughout the site, repair of the new day's missing-looking figures after midnight, and airport weather immediately below current departure halls. Existing fonts, approved architectural renders, forecast values, destinations, concourse and denominator rules stay intact. No prior rejected core-card/header proposal was imported.

## Cause and resulting behavior

At 2026-10-07 17:51 UTC (2026-10-08 02:51 KST), the existing public flights GET returned the stored official schedule for October8:554 physical departures, T2 260, all T2 gates null. The summary independently reported T2 `NO_GATE:260`, with `NOT_IN_TABLE`, `CONFLICT` and `NO_TERMINAL` all zero. The terminal forecast coverage was COMPLETE. These records establish missing upstream gate locations, not a classification failure or missing official forecast. The previously displayed0% zones implied an established comparison despite no located flights.

The client also retained every fulfilled per-date promise for the whole visit. It now separates in-flight deduplication from a bounded eight-date response cache with120s TTL, refreshes visible mounted readers every120s and revalidates on focus/visibility return with a5s burst cooldown. Hidden pages do not poll. Failed/wrong-date responses are retryable. Effect cleanup and date-tagged state prevent a late old-date response from replacing a new selection. Requests use normal HTTP revalidation against the existing stored-data endpoint; no new scheduler or provider read was introduced.

With all locations unverified, the architectural model displays the actual total departure-flight count and a translated gate-location-pending label, without east/central/west0% comparisons. The destination list keeps unverified flights available. Passenger reference text identifies pending gates separately from missing forecast and mismatched flight sets; no passenger allocation is invented. Existing verified/mixed/confirmed-zero comparisons retain their established denominators and labels.

The two requested paragraphs were removed from the airport screen, home answer and airport share preview in all four languages. Official forecast chart numbers, time labels, sources and required truth notes remain. Airport weather is a separate section immediately after current departure halls. No verified airport observation exists in current main; it explicitly says unavailable and contains no Seoul weather substitution or guessed temperature. Restoring actual airport observations remains blocked on a verified source contract.

## Verification and limits

- Final native lint:0 errors,7 existing image warnings; typecheck and bounded production build passed.
- Relevant unit tests:87 passed, including the unchanged operational/UI-lock assertion; rendered Worker HTML/API checks:46 passed.
- Relevant browser scope:96 passed on the first97-case run; the refresh test caught a first-timer/TTL boundary mismatch. Visible interval refresh was fixed, and that same test passed on recheck. Four locales,360/390/430/1280px, additional320px, keyboard, reduced motion, missing gates, missing retrieval, confirmed zero, repeated terminal/time/date changes, late old-date response, official forecast preservation and the original priority lock were covered. No test was skipped, disabled or relaxed. Exact-head full CI is recorded in the PR when complete.
- Captured unchanged actual public payloads replayed in the local candidate at390 and1280px: T2 total260; no0% zone comparison; truthful pending reference; official peak4724 from the captured latest forecast retained. The user's earlier4749 was a different publication; neither value is hardcoded into product code. Image decoding was awaited before final screenshots. This is local candidate verification, not proof of public deployment.
- The normal approval review accepted only the exact hash/audit update for the newly requested changes in `app/live-signals.tsx` and `app/retailpulse-app.tsx`. All61 protection entries, the original enforcement test, every unrelated protected byte and all cron rules remain enforced.
- The unchanged canonical secret scanner hit the180s native wrapper timeout. A separate native equivalent scanned all978 reachable revisions and the working tree using all five unchanged canonical ERE alternatives/exclusions combined per Git invocation: no findings. The original repository scanner remains the CI check.
- Built app entry asset:741002→740142 bytes; local gzip263684→263255 bytes. This small entry-asset change does not establish a public LCP improvement. Public before/after mobile performance is pending approved merge/deployment; no speed-complete claim is made.

## Reviewed screenshots saved to Library

| Screenshot | Library ID |
| --- | --- |
| Actual stored T2 midnight payload,390px | `libfile_fa4027213e308191a2dfc6327e2166f4` |
| Airport weather below halls,390px | `libfile_558c0162c31c81919c3e318f1c7e613f` |
| Actual stored T2 midnight payload,1280px | `libfile_75404382723481919c1d86e228345db4` |
| Airport weather below halls,1280px | `libfile_f36cccef0db481919655266fb0892a5d` |

Library creates succeeded. The Windows official xattr helper cannot attach Unix extended attributes; local identity sidecars retain the returned server IDs/version metadata. No duplicate upload is required.

Local detailed receipts: `outputs/midnight-flights-weather-copy-20261008` in the task workspace. The PR is the authoritative GitHub handoff. Stop before any public merge/deploy; the owner’s separate approval is still required.
