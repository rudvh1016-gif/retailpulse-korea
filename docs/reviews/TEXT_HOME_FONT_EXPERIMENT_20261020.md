# Korean text-led home: same-font preload experiment

## Evidence

CI 39473347408 compared deployed `26474d048885a642550d1196a55586b1b5f9fe60`
with PR merge `f87ce5aef7b4abf514e57aa0f5da51e224efe2c7`; the latter tree is
identical to PR413 head `15ed3e92fe33c1ceca167c00f4899b200b455e36`.
The integration itself was neutral: mobile median LCP 7,024 → 6,988ms,
FCP 6,232 → 6,224ms, observed shift sum .094324 → .094324.

In all three candidate mobile runs, .093245 of the shift sum occurs 124–129ms
after `/fonts/koretail-sans-variable.woff2` responseEnd. Earlier hydration and
holiday note insertion contribute about .00108. This strongly implicates the
late same-font swap rather than missing placeholder height. The font request
starts around 5.94s after the render-blocking stylesheet completes. It finishes
around 7.84–8.09s. The face already uses `font-display: swap`.

Desktop has a different main shift (.07325): the tall right-side preparation
brief expands the spanning grid and moves left-side summary rows. This candidate
does not redesign that grid or increase permanent whitespace.

## Candidate, not a measured improvement

Call the existing `preloadShellFont('ko')` helper only on `/ko`. This preserves
font files, family, size, weight, swap policy, all approved content and data.
Other home locales and image-led/detail routes retain their current policy.
The existing helper keeps `crossOrigin: anonymous`, avoiding duplicate requests.

The October 13 image-led-home decision deliberately removed preload because
it competed with hydration. The now text-led page presents a different tradeoff,
not a reason to erase that evidence. This experiment may improve stability while
hurting paint/hydration. **Do not promote it on assumption.** Compare the existing
three-run, same-fixture, same-throttle lab against deployed26474 with unchanged
FCP/shift/transfer budgets, and inspect LCP/content identity separately (LCP is
not currently budget-gated). If the experiment regresses user-visible timing,
remove it; do not weaken the budget or change fixtures to obtain a pass.

No local browser was launched after the prior IPC denial. The strengthened
browser typography test checks one correct Korean-home font hint, none for
other home locales, and unchanged travel-records hints. Final matched CI and
live verification remain required. No improvement or deployment claim is made.
