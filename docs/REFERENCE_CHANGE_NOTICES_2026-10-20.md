# General calendar / allowance change notices — isolated follow-up

Base: `bf25317cbcd68c8d848ce98b70f6263a27c9b01a` (PR #411 candidate). This follow-up is isolated from that release and is not authorized for publication/deployment until root review.

## Authorized request

The owner's recovered instructions explicitly requested notices when newly changed information is found (`Sentinel_e1eb6677969c8191ad6c0d819611fa62`) and `[공지]` for updated destination customs information (`Sentinel_3a70fc8a6ad48191955569f7bd453ae8`). The exact source messages were checked in the overnight request audit, not inferred from assistant promises.

## Narrow implementation

- The existing general notice modal includes at most six deduplicated reference-change entries, with `[공지]`, topic/scope, the actual reflection/check date, and the existing preparation/detail destination. No separate product redesign or general notification permission.
- Verified JP/US calendar changes store one optional `lastChange` entry inside their existing canonical JSON payload. The single SQL upsert commits payload and its notice metadata together; no migration/table/new history is needed. The existing two-row cap stays unchanged.
- First calendar receipt is a baseline, not a claimed holiday change. Poll/check timestamps, source row order, translated display names, and expiry of retained old years do not produce a new calendar notice. The semantic payload is sorted before hashing. Existing order-sensitive hashes may normalize once (at most the two current rows), without announcing a factual change. A compare-and-swap check prevents a concurrent semantic mutation from being overwritten using an outdated before-image.
- Existing Japanese customs `changed_at` and previous/current numeric values identify published numeric changes. This does not broaden the four allowlisted numeric values or approve any other legal text.
- Existing customs `SOURCE_CHANGED_REVIEW_REQUIRED` rows generate **pending review**, never “the regulation changed.” The notice identity is the unresolved source + reviewed baseline, not every raw-page hash or poll time, so a changing view counter cannot create repeated review episodes. Current calendar cancellation/review status is similarly labeled unconfirmed. A pending review takes precedence over an older published notice for that topic/country. Published Japanese numeric notices also require a current successful country status, so stale/failed checks cannot resurrect an older confirmed announcement after an unresolved review; last-good detail values are not removed.
- Outages, missing baselines, first import, unchanged checks and stale source checks do not fabricate change notices. Existing last-good and 14-day calendar-expiry behavior stays intact. An unavailable request does not claim that all sources are unchanged.
- The modal keeps the current preference keys/version, Close, Escape, keyboard trap and exact one-week hide. Fetch arrival does not open/reopen the dialog. There is no polling or timer in the new component. Already-dismissed or week-hidden modal triggers no allowance-notice request.
- The component loads only when the general modal is visible: it shares the existing five-minute in-flight calendar client/cache and adds at most one cached allowance-status read per genuine dialog opening. A same-page reopening after the one-week hide refreshes once, while ordinary focus on an already-open dialog does not refetch. A generation guard prevents earlier reads from replacing the reopened dialog's newer result. Both are existing bounded D1-only APIs. No upstream call, AI, paid dependency/service, credential, account permission or scheduler is added.
- The Korean/focus notice path receives the new entries; existing English/Japanese/Chinese non-focus release copy is unchanged. This patch does not claim translated dynamic notices or a new persistent notice-history page.

## Scope truth and limitations

JP means national public holidays; US means OPM observed holidays for covered federal employees, not all businesses or schools. China, Korea/KASI activation, other countries, regional schools, amendment/new-year source discovery and source-license reviews are not expanded here. Facts must already have passed the existing source's publication boundary.

This is a **latest change** notice, not an exhaustive historical ledger. Only one latest calendar transition per country and the already-retained latest Japanese numeric transition are available. Review dates are labeled latest check because an existing observation row does not preserve first detection. No effective legal date is inferred from a collection time. A dismissed modal is not force-opened for background changes; one-week preference has priority. Existing detail views remain the places to inspect dates and applicable conditions.

## Validation / review

Post-review local verification on 2026-10-20 UTC:

- `npm run typecheck`: passed.
- Changed-file ESLint: passed.
- `node --experimental-sqlite --import tsx --test --test-concurrency=2 $(ls tests/*.test.mjs tests/*.test.ts | grep -v 'tests/rendered-html.test.mjs')`: **1,823/1,823 passed** (497.428 s); pre-existing test assertions were not relaxed.
- `npm run build`: passed.
- `node --experimental-sqlite --import tsx --test tests/rendered-html.test.mjs`: **50/50 passed** (161.498 s).
- Calendar/notice focused tests: **22/22 passed**.
- `playwright test e2e/reference-change-notices.spec.ts --list`: **8 tests discovered**; not executed successfully.
- `git diff --cached --check`: passed.
- Independent read-only review: two P2 edge cases fixed and re-reviewed; no remaining actionable findings.

**Browser validation is pending CI.** The first local batch failed at Chromium startup before assertions because its singleton IPC `socket()` was denied (`Operation not permitted (1)`). No screenshots/UI assertions passed. After observing this blocker, no browser launch was repeated or security/permission change attempted; root explicitly required deferral to the authorized CI runner. The later same-page expiry test has only been typechecked/discovered locally. The duplicate local reachable-history secret scan was cancelled on root instruction (exit 130); it is not claimed as passed. The bounded staged changed-file secret check passed. Full scanning of this new commit remains pending CI after root-authorized publication; no release CI was cancelled.

New tests cover baseline quietness; actual date changes; unchanged/reordered checks; year-retention rollover; cancellation/stale/malformed metadata; stale-before-image concurrency; pending review rather than legal auto-approval; source-review deduplication; response bounds; actual general notice markup; 360/390/430/1440 layout; focus wrap; Close/Escape; one-week hide; no repeated reads on focus; and late network responses not reopening the dialog.

No production migration, collector run, production D1 row, public deployment or GitHub publication is asserted. Production activation evidence remains a separate post-review task.
