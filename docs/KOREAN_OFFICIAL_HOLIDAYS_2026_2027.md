# Korean official annual holiday evidence — 2026 / 2027

Checked on **2026-10-21**, against `origin/main` **26474d048885a642550d1196a55586b1b5f9fe60**.

## Result and boundary

- `data/airport-focus-preview/calendar-context.json` contains 46 reviewed KR
  national named holiday dates: **22 in 2026 and 24 in 2027**, including the
  published substitutes and the 2026 nationwide local-election day.
- These are named dates, not a count of all Sundays or all non-working days.
  The annual announcements' totals that include Sundays must not be compared
  directly with the 22/24 row counts.
- This is a **manually reviewed official annual dataset**, not a live feed or
  a new collector. No login, API key, data.go.kr subscription, provider probe,
  cron, D1 write, or runtime service change is required by this patch.
- The earlier KASI API 403 remains unresolved. Reading public annual documents
  does not establish API access or automatic freshness.
- Ordinary weekends, school vacations, regional government holidays, customary
  bridging leave, and unconfirmed temporary holidays are not added as national
  public holidays. No extra temporary-holiday date was confirmed in the
  reviewed 2026/2027 government publications and MPM announcement search.
- **2028 is intentionally absent.** KASI identifies its 2028 calendar data as
  preliminary, before official KASA publication; it is not an approved annual
  holiday arrangement. Do not extrapolate lunar/substitute dates into the seed.
- Government amendments and temporary holidays can change a published year.
  `verifiedAt` is the review date, not a promise of continual monitoring.

## Direct official sources

The Korea Policy Briefing copies of KASA's releases explicitly license their
text under **KOGL Type 1 (attribution)**. Only factual dates/names are used;
photos, logos, document layout and other graphical content are not copied.
The separate KASA announcement page displays Type 2, so it is not used as a
license for copying that document's presentation or imagery.

| Evidence | Publication | Public source / downloaded attachment | SHA-256 of downloaded HWPX |
|---|---|---|---|
| 2026 annual, including its full holiday table | 2025-06-30 | [KASA release on Korea Policy Briefing](https://www.korea.kr/briefing/pressReleaseView.do?newsId=156738544) · [HWPX](https://www.korea.kr/common/download.do?fileId=198321135&tblKey=GMN) | `9c457ece149779eed0c2d717207d9daa564503261fedc6d47a26112471e018b4` |
| 2027 annual, including its full holiday table | 2026-06-29 | [KASA release on Korea Policy Briefing](https://www.korea.kr/briefing/pressReleaseView.do?newsId=156768474) · [HWPX](https://www.korea.kr/common/download.do?fileId=198497802&tblKey=GMN) | `7f91729089b79610b3f5d4a392f8d4fff5cdd7f520e2d0bb8fd7eb9f59728560` |
| 2026 Labor Day / Constitution Day amendment, including substitute applicability | 2026-04-29 | [MPM: 올해부터 노동절, 제헌절 공휴일로](https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?boardId=bbs_0000000000000029&cntId=4250&mode=view) · [Decree No. 36290](https://www.law.go.kr/lsInfoP.do?lsiSeq=285779&viewCls=lsRvsDocInfoR) | HTML reviewed; no attachment hash claimed |
| Formal 2027 publication confirmation, notice No. 2026-0078 | 2026-06-29 | [KASA announcement](https://www.kasa.go.kr/bbs/BBSMSTR_000000000018/B000000003234Li6nD2.do?mno=sub01_03_03) | HTML reviewed; KASA attachment downloads returned an error HTML page, not valid document bytes |
| 2028 preliminary status | Generated 2026-06-30 | [KASI calendar data](https://astro.kasi.re.kr/life/post/calendarData) | HTML reviewed; not official annual publication |

The 2026 annual was published before the amendment: its original exclusion of
Constitution Day is superseded. MPM confirms Labor Day applies from 2026-05-01
and the Constitution Day amendment from 2026-05-11. Therefore 2026-05-01 and
2026-07-17 are included. The 2027 annual already includes both holidays and
their substitutes. The public KASI calendar tables were a cross-check, not a
substitute for the formally published annual attachments.

## Verified national dates

Every date below has `country: KR`, `scope: national`, `kind: public_holiday`,
`status: verified`, and `verifiedAt: 2026-10-21`. Source for 2026 is the 2026
annual except Labor Day and Constitution Day, which use the amendment; all
2027 dates use the 2027 annual.

| Holiday / observed holiday | 2026 | 2027 |
|---|---|---|
| New Year's Day (신정) | 01-01 | 01-01 |
| Seollal holiday / day / holiday | 02-16, 02-17, 02-18 | 02-06, 02-07, 02-08 |
| Seollal substitute | — | 02-09 |
| March 1st Movement Day | 03-01 | 03-01 |
| March 1st substitute | 03-02 | — |
| Labor Day | 05-01 | 05-01 |
| Labor Day substitute | — | 05-03 |
| Children's Day | 05-05 | 05-05 |
| Buddha's Birthday | 05-24 | 05-13 |
| Buddha's Birthday substitute | 05-25 | — |
| Ninth nationwide local-election day | 06-03 | — |
| Memorial Day | 06-06 | 06-06 |
| Constitution Day | 07-17 | 07-17 |
| Constitution Day substitute | — | 07-19 |
| Liberation Day | 08-15 | 08-15 |
| Liberation Day substitute | 08-17 | 08-16 |
| Chuseok holiday / day / holiday | 09-24, 09-25, 09-26 | 09-14, 09-15, 09-16 |
| National Foundation Day | 10-03 | 10-03 |
| National Foundation Day substitute | 10-05 | 10-04 |
| Hangul Day | 10-09 | 10-09 |
| Hangul Day substitute | — | 10-11 |
| Christmas (성탄절) | 12-25 | 12-25 |
| Christmas substitute | — | 12-27 |

UI names `신정` and `성탄절` correspond to the annual's `1월 1일` and
`기독탄신일`. Seollal/Chuseok ranges are expanded into their three inclusive
dates; the middle day is labeled separately. No weekend outside those official
ranges is silently included. There is **no Memorial Day substitute** in either
year and **no 2026-09-28 Chuseok substitute**.

## Integration and checks

- Existing KR event IDs are preserved. Christmas 2026 and New Year 2027 reuse
  their matching full-detail seed IDs to avoid duplicate month-grid chips.
- `holidays-summary.json` is regenerated with the existing offline command
  `node scripts/sync-airport-calendar-summary.mjs`; full-detail source evidence
  is not relabeled or backdated.
- `calendar-context.asOf` is 2026-10-21. The historical
  `snapshotCompletedThrough` value remains unchanged: adding annual holiday
  evidence is not a new completed operational snapshot.
- A preview frozen to 2026-10-20 correctly excludes rows verified on 10-21.
  Integration must use a current display-as-of date, not falsify verification.
- Run `node --test tests/korean-official-holidays.test.mjs
  tests/calendar-context.test.mjs tests/airport-calendar-summary.test.mjs`.
- No production build, push, PR, merge, deploy, collector activation or live API
  verification is implied by this data patch.

### Executed validation

- Focused annual/context/summary tests: **17 passed, 0 failed**.
- Existing `official-calendar-runtime.test.ts`: **8 passed, 0 failed**;
  validates provider-free read fallback and scoped official replacement.
- All 28 non-KR rows remain structurally identical to the base revision; all
  74 combined event IDs are unique.
- Changed-file high-confidence credential scan: **4 files passed**.
  The repository-wide reachable-history scan was started and stopped; it is
  **not claimed passed**. No build or aggregate suite was run for this
  data-only patch; final integration checks remain the integrating agent's job.
