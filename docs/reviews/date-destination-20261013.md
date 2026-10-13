# Compact date control and clear destination availability

Owner approvals: Sentinel_f30294521f9c8191ba81a4d739722130 (compact rounded date surface) and Sentinel_f4df5971256481918f139f2b502b6502 (short, accurate missing-information text)

Base dbf900ffb8ac5911e2b7c279c3f314de63c67764 includes latest reviewed main fea8249c3bcef134077684cb5c92049ea83bb477 and Claude date/time/data safeguards

Date editing remains native type=date with existing change handling, calendar picker, Today reset, visible keyboard focus and 44px targets
The approved exception is scoped to the home glance date control only: neutral rounded surface, restrained ink-blue text and selected Today state
No font or dependency was added and no animation or additional network request was introduced

Destination statuses distinguish request failure, no available time-window information, partial records, missing comparison data, confirmed zero departures in both windows, and missing next-day comparison
Existing time boundaries, unknown countries, all ties, counts and available zone records remain unchanged
Korean midnight message is shortened to 자정 이후 비교 자료 없음

No protected path changed and tests/fixtures/phase2-locks.json remains byte-identical with all 65 protected paths and approval records preserved
No collector, database, API contract, scheduler, deployment or access settings changed

Validation
- TypeScript check passed
- ESLint 0 errors, 2 pre-existing img optimization warnings
- 14 airport-glance unit tests passed
- 3 selected operational/UI lock tests passed using tsx
- Native vinext build passed and 49 rendered HTML tests passed
- Browser checks and screenshots use isolated synthetic fixtures, not live passenger counts
- Main first-run browser failure was wrong local port 4233 occupied by another server; corrected to actual 4234 and reran
- Initial UI lock invocation omitted tsx and failed on TypeScript parameter syntax; correct invocation passed

Design review used vendored frontend-design and latest https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
No new guideline violations found in changed date controls or status messages
Native picker appearance remains browser-dependent and actual iOS Safari is not verified
Parent reviewed supplied reference image pixels; this child did not independently materialize the two reference Library files

Draft only — no merge or deployment performed
32 related E2E passed in Chromium at 360/390/430/1440 including 4 languages, rapid dates, keyboard, true zero, missing/failed/partial and midnight boundaries

Library images: date390 libfile_189a831bf928819182966d9f4f34512a, date1440 libfile_a104c21536208191ac52b1015fd0cec1, destination390 libfile_2b432330e7048191835fde2eaba3fc2b, destination1440 libfile_a23db33313148191b5d8bb6e9483ca28
Library upload succeeded for all 4 files; Windows xattr helper failed because os.setxattr is unavailable, so identities are preserved in library.json
Additional state screenshot capture rerun: 4 passed

Repository-equivalent batched secret scan passed over working tree and all 1235 reachable revisions with identical patterns/path exclusions

CI correction after run 38410751560
- The full CI passed 1338 E2E and failed 24 pure-white checks because the approved neutral date background was still expected to be white
- Adjusted only the exact native date-control selector to assert RGB 241/243/246 plus radius 14px, minimum height 44px and width 148px
- All other input, page and surface white checks remain unchanged and no test is skipped or disabled
- Existing owner approval Sentinel_f30294521f9c8191ba81a4d739722130 authorizes this scoped neutral date surface
- No runtime, style or protected-manifest change in this correction

Correction validation: combined 57 E2E passed, then final exact-color-and-geometry pure-white suite 25/25 passed across 4 locales and 6 widths, TypeScript and targeted lint passed, Owner UI Lock passed, identical full-history secret patterns passed over 1250 revisions
