# First-screen preparation entry split — 2026-11-05

Base: `78eaba65` (`origin/main`). Separate checkout/branch; no collector or DB mutation.

## Diagnosis and change

The Korean home T2 cold-load waterfall fetched the arrival allowance calculator,
its reviewed snapshot and CSS although the home never renders that calculator.
The shared `airport-focus-production` client entry exported both the home and
preparation page, with a static calculator import. The preparation page now has
its own client entry. Its server page still supplies it synchronously, including
the visible reviewed guide. Shared live data logic was moved without changing
requests, validation, calculations, freshness, midnight behavior or UI markup.

## Measurements

Public production: three fresh Chromium contexts, 390x844, no artificial throttle,
2026-11-05. Network variability was substantial; this is diagnosis, not an A/B
claim. A separate curl request returned 45,929 HTML bytes, TTFB 1.331s, total 3.028s.
The waterfall included the unused calculator (about 21.7KB transferred) and CSS.

Matched local frontend lab: three fresh contexts per width, captured public
2026-10-19 API fixtures, production builds, returning-reader notice state, 10s
after DOMContentLoaded. Mobile 390x844 / 4x CPU and desktop 1440x1000 / 1x CPU.
The existing script configured 150ms/1.6Mbps mobile and 20ms/20Mbps desktop.
Windows vinext returned 404 for static files under this workspace path, so both
runs served identical built static bytes through Playwright route fulfillment.
Those static responses bypass network throttling and are uncompressed: byte
counts and paint timings are frontend-only, not production network estimates.
The local copy also used `path.dirname(output)` for Windows output compatibility.

| Median metric | Mobile before | Mobile after | Desktop before | Desktop after |
|---|---:|---:|---:|---:|
| FCP ms | 860 | 876 | 388 | 232 |
| LCP ms | 912 | 876 | 388 | 232 |
| CLS | .00952 | .00952 | .02445 | .02270 |
| Observed blocking ms (not Lighthouse TBT) | 304 | 360 | 7 | 0 |
| Initial transfer bytes | 2,497,321 | 2,364,050 | 2,844,049 | 2,710,778 |
| Image transfer bytes | 61,602 | 61,602 | 408,330 | 408,330 |

Both lab reports were valid and the repository comparison budget passed.
The measured reduction is 133,271 bytes (5.34% mobile / 4.69% desktop).
Mobile first paint did not improve and observed blocking increased; do not
advertise a general loading-time improvement from these small lab samples.

## Environment limitations

The requested Library screenshot could not be installed: the supported transfer
helper failed after the permitted retry because Windows Python lacks
`os.setxattr`. No bypass or unsupported download was used. Its pixels remain
unverified; the live Korean home and T2 selected UI were inspected separately.

Windows Git initially checked out LF files as CRLF, producing 22 failures in
2,860 unit tests and two raw-source/render tests. `core.autocrlf=false` and original
LF source restored the render suite to 53/53. No repository-wide newline changes
are included. Full required results and release status belong in the PR record.

## Validation at PR preparation

- Production build before/after: passed.
- Typecheck: passed. Whole-repository lint: 0 errors / 25 existing warnings.
- Focused performance/preparation/monthly-country tests: 17 passed.
- Rendered HTML: 53 passed.
- Chromium hydration/passenger forecast/week comparison: 39 passed.
- Chromium canonical preparation/briefing navigation/personal briefing: 47 passed.
- Full unit run after LF restoration: 2,853/2,860 passed. The seven remaining
  failures were subsequently retested: immutable SQL hashes fixed by original
  blob bytes; moved-wrapper expectations and exact protected-import reversal
  updated; affected 76-test group and operational phase 2 rerun passed.
- Full reachable-history secret scan: passed. Health: UNKNOWN (no production
  credentials), no ERROR; this is not a production health or quota claim.
- Original protected hashes remain unchanged; exact two import substitutions
  are reversed before existing canonical patches. No broad lock weakening.

Release requires green remote CI and the normal deployment workflow. No runtime
collection, DB migration, key creation, security change or paid service is part
of this change.
