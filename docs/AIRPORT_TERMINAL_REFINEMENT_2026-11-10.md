# Airport terminal selector refinement

## Approved scope

The owner rejected the heavy navy-filled terminal selector mockup, reviewed the
lighter second mockup, and explicitly authorized deployment on 2026-11-10.
This supersedes the older underline-only control rule **only for the airport
status terminal selector**. Information tabs, the existing approved day rail,
news, bottom navigation, data, collection, and all other selectors stay intact.

## Design

- Keep Pretendard, the existing compact scale, and the white page.
- A pale neutral shared rail (#f6f7f9), four equal choices, 5px gaps and padding.
- White selected surface, 1px #b4c1cd outline, navy #193b57 text and a checkmark.
- Scope labels: All / T1 / T2 / Concourse; secondary localized building names.
- 52px minimum choice height, 12px/13px primary type, 10px/11px secondary type.
- No new dependency, large filled button, animation, gradient, shadow or API call.
- The English Concourse check uses a small corner position to avoid crowding
  its longer label on a 320px viewport. Other checks sit beside the label.

## Interaction and compatibility

Keep the shell's terminal, concourse, URL, date and preference behavior.
Store the current scope in browser history so Back restores All instead of
substituting the newer saved T2 preference. Initial entry still uses preferences,
explicit query scopes still win, and date/language navigation carries its scope.
Preserve existing accessible primary names; expose added subtitles
as descriptions. One selected choice and one keyboard tab stop. Left/Right
wrap between choices; Home/End move to the first/last. Native Enter/Space and
pointer activation remain. Re-selecting the current scope does not add history.
Focus outline and forced-colors styles are explicit; selection is not color-only.

## Verification

Baseline: origin/main 2273f4f8da4bb8bce0df48bbb36e07171dc2ee71; 2,853 unit tests passed.
The new 16-case render test failed first on missing descriptions, then passed.
The existing All-history bug was reproduced with a failing regression test and
fixed without changing URL formats. The protected-UI gate now reverses exactly
two selector extraction hunks and five shell history hunks before checking the
unchanged canonical hashes. Wrapped selected labels reserve 15px for the check.
Browser cases cover all four locales at 320/390/1280px, keyboard, browser history,
repeated activation, enlarged text, forced colors and screenshots. Existing
date, plain-surface and desktop-density assertions are updated only for the
new terminal design. Local browser startup is blocked by socket EPERM even
with the permitted escalated launch; CI browser evidence is required before release.

Zero-cost audit: presentational-only changes. No provider, D1, scheduler,
credentials, runtime permission, migration, dependency or paid-service changes.
Final local validation: npm test passed (build, 2,871 unit tests and 54 rendered
HTML checks); typecheck passed; lint has 0 errors/25 pre-existing warnings and
changed-file lint has no findings. Browser inventory is complete with 2,357
cases and no duplicate/missing shards. The health harness ran successfully via
node --import tsx; its Production/system verdict remains UNKNOWN, not a live
health claim. CI, PR, merge and deployment evidence belongs in the PR.

The first remote Chromium run rendered the selected rail as approved. Its
airport-period group passed 86 cases and caught four stale expectations for the
previous underline/left-aligned terminal design. Those assertions now check the
new outline, checkmark, centered labels and 52px touch height. A related static
compatibility sweep updates the old menu name/hover, one-line label assumptions
and two text-only T1 locators to stable accessible primary names. Non-terminal
navigation, data and date assertions are retained. A fresh exact-head CI run is
required; the first failed run is not release evidence.

The second run passed all 498 bounded browser cases and 2,352 of 2,357 full
browser cases. Four new forced-colors assertions incorrectly expected
`:focus-visible` after pointer/programmatic focus; they now enter keyboard
modality with Home and require actual focused state before the same outline
assertion. The remaining Chinese overview case raced the fixture response:
the trace shows its fixed clock was installed only after navigation, and the
scroll target detached during the subsequent data render. Its fixture now
sets time before navigation and waits for the real seven-flight model before
the glyph/scroll assertions. No product code or assertion is disabled.
