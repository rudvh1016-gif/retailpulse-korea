# Requested EN/ZH 30-second brief localization

Original base: PR #417 `09037800d72466f9ff63763ab8eecb68b0feb0b6`.
Publication integration base: #417 `53cab29bed12025ce6e6993f3a6363fc168ecfa8`.
The 11 intervening date-picker/helper, tooltip and compiled-blur files are
unchanged by the conflict-free integration.
Scope: the owner's screenshot of a Chinese shell surrounding a Korean 30-second
brief. No unrelated feature, layout, font, dependency, collector, calendar source,
scheduler, API, database or GAEO change.

- Thread the existing locale through the production/preview brief and its children.
- Translate headings, counts/units, comparison completeness, next-week/month plans,
  return-planning and source/basis disclosures, including loading/missing states.
- Deterministic display dictionary covers all 178 current seed events: 81 unique
  names, 43 meanings and 60 institutional/national scope strings, plus the runtime
  JP/US normalized holiday names and federal-employee applicability strings.
- Preserve canonical country labels used for joins, source URLs, exact dates,
  region identity, numerical calculations and incomplete-baseline withholding.
- Unknown future source wording stays verbatim rather than inventing a translation
  or silently replacing institutional scope with a nationwide holiday claim.
- Korean screenshot static markup matches the exact parent baseline byte-for-byte.
  The Japanese text fallback is unchanged; this is not a site-wide localization claim.

Validation (local, not deployment):
- `npm run typecheck`: PASS.
- Focused ESLint across changed TS/TSX/MJS files: 0 errors, one existing internal
  navigation warning in `airport-focus-production.tsx`.
- Focused unit/render/font suite: 27 passed, including EN/ZH rendering of every seed
  event, runtime-name coverage, 22/30 incomplete comparison and sign/zero states.
- Original patch `b8e3381`: final serial full unit suite 1,965 passed; focused
  suite 27 passed, typecheck and reachable-history secret scan passed. These are
  historical checks, not a full-suite claim for the newly integrated commit.
- New integration: 84 focused tests passed, including translation/render/font,
  protected-path/owner locks, monthly chart and compiled preparation-glass tests.
- Browser regression added for KO/EN/ZH at 390/1440 pixels, details open/close,
  numeric truth, no Hangul in EN/ZH brief and overflow/font safety. NOT executed:
  local Vite startup was killed with exit 137 before a browser test could run.
- Full lint also exited 137 under concurrent workload; focused lint passed.
- Build/browser/remote CI and release still need the normal authorized pipeline.

Publication is a separate draft PR targeting the existing #417 preparation branch.
No merge, deployment or live translation is established. The exact remote-head
normal CI is authoritative; integration/release waits for #417 and required checks.
