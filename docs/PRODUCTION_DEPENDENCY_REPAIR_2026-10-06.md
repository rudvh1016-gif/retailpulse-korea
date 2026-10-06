# Production dependency audit repair — 2026-10-06

PR277 merged as `6ff277b9d0b227b00f6606c80209c28ada7d83e7`, but its main
[CI37412079225](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/37412079225)
failed the existing production dependency audit with one moderate and one high
finding. The resulting [deployment37412376895](https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/37412376895)
was skipped. Merging code did not establish that the gate illustrations were public.

The CI script retained only counts and removed its temporary JSON report.
The attached before report is a new `npm audit --omit=dev --json`
response against that exact main lockfile and the public npm registry, not a
recovered historical CI JSON. Its values are unchanged; Windows line endings
are normalized to LF for Git. It reproduces the same counts and identifies
`source-map-js 1.2.1` as the direct high finding, with
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

The targeted normal `npm update` stays within existing dependency ranges:

| Dependency | Before | After | Reason |
| --- | --- | --- | --- |
| source-map-js | 1.2.1 | 1.2.2 | Official fix for the high audit finding |
| baseline-browser-mapping | 2.10.30 | 2.11.27 | Resolve the reported moderate finding within existing 2.x ranges |
| next's optional sharp | 0.35.4 | 0.35.5 | Independently confirmed [official sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) |

The matching production sharp binaries move to 0.35.5 and their libvips packages
to 1.3.4. The npm before report did **not** list sharp as its high finding; the
official advisory was checked separately. Development-only miniflare/wrangler
sharp constraints remain unchanged; this is not a claim that every development
tool or every advisory is clean.

The attached after report has zero production vulnerabilities in all
reported severities. No `npm audit fix --force`, version override, test weakening,
audit exclusion, new authentication, paid service or runtime source change is
used. `package.json`, the audit script, workflows and UI lock records are unchanged.

Raw registry reports:
- [Before](evidence/production-dependency-audit-2026-10-06/before.json)
- [After](evidence/production-dependency-audit-2026-10-06/after.json)

Local checks and exact remote CI/release evidence are recorded in the PR.
The site is considered updated only after current main CI, its deployment, and
the actual public UI/assets are separately confirmed. PR267/276/278 and the
PR266 local conflict repair are not included in this dependency-only change.
