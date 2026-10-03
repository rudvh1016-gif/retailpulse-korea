# Airport-first accuracy follow-up — draft

Base: `ef0ad56442d3ae7f9c60a38fd9dff612f6287937`, fetched and verified on 2026-10-03. This follow-up is not merged or deployed.

Implemented:

- Locale roots now open airport first. Airport is the first navigation item; Seoul's four district summaries and explicit deep links remain. My Briefing's entry and rendering wrapper are removed. Existing personal/local settings are retained.
- My Store's tab/rendering entry is removed. Its stored facility selection, facility APIs and mapping records are retained. Old `section=mystore` / `#mystore` airport bookmarks lead to the facility directory.
- Gate 215 is WEST by KORETAIL's calculated region, not an official text designation. Restore only 33 evidenced per-gate mappings from reviewed commit `c7f3eaf9ba3982015e2bd90191f5bf79777b5114`; its T2:291 addition is excluded because it conflicts with the published range. Sources are the official POI snapshot checked 2026-09-29. Fresh endpoint access returned 401; no fresh official coordinate confirmation is claimed. Side-table version changes so older side shares are not compared under the same definition. Passenger hall-side estimates remain withheld.
- Departure composition names selected date, terminal, KST and collected-record versus future-schedule basis in four languages. Holiday differences name the two dates, country and holiday name/status, including adjusted working days, substitute holidays and unpublished-calendar unknowns. Existing calendar sources and ranking algorithm remain unchanged.
- Unknown-terminal departures no longer receive an empty-airport claim. Failed/unavailable next-day records are not treated as complete zero data. A last-good summary straddling midnight cannot turn 00:02 into a false current-day (+1) window. Source/model explanations remain in expandable details.
- Compact hourly/monthly geometry and larger airport model presentation; pastel daily marks and dynamic airline/registration-country flight-count prisms. No font files, family, size or weight changes. Registration country remains distinct from passenger nationality.
- Installation guide corrects the claim that every metric is realtime, and avoids claiming icon removal clears stored data. Native store readiness remains a separate owner stage; see `APP_RELEASE_READINESS_2026-10-03.md`.

Verification evidence:

- Before final unknown-state tightening: lint/typecheck/build passed, unit 1110/1110 and rendered HTML 42/42 passed.
- Focused navigation/day-radar/departure-map suite: 37/37 passed, including 4 languages × 360/390/430/1280 root, stored settings, Seoul deep links, back navigation and language changes. The latest unknown-terminal regression plus gate/copy tests: 21/21 passed. Final broad checks still required after the latest changes.
- Matched fixture captures at 390 and 1280: eight common typography samples each are byte-equivalent as computed style records; overflow 0 before/after. Evidence lives in local `outputs/followup-typography.json`.
- Full E2E snapshot: 365 passed / 68 failed. Most failures assert the now-removed briefing UI or old navigation/root copy; not waived or skipped. Updating whole test files was rejected by automatic approval review because it risked losing unrelated coverage. A user approval question for narrowly replacing obsolete UI cases is pending. All remaining failures must be classified, fixed and rechecked before release.
- Production visual tests retain assertions and adapt only closed details interaction and approved black current marker. Their next production run has not happened.

Remaining: approved obsolete-test transition, final full CI/E2E, PR review/normal merge/deploy and public verification; new Blender assets integration, queue visual/tie review, Seoul forecast/consumption/weather visuals and font experiment are separate follow-ups. No paid service, collector/scheduler change, database deletion or protection bypass.
