# Confirmed multi-year priority-country calendars

Review date: **2026-10-21**. This is a manual official-source data expansion, separate from the JP/US monthly adapter change. No CN/VN/TH source was activated, no paid service/key/schema was added, and no workflow was manually dispatched.

## Stored scope, not a completeness promise

`data/official-calendar/priority-country-multiyear.json` stores **83** reviewed records in the bounded 2025–2027 range:

| Country | 2025 | 2026 | 2027 | Meaning |
|---|---:|---:|---:|---|
| China | 6 intervals | 7 intervals | 0 | Published national general-citizen annual rest arrangements; statutory, weekly and adjusted rest are not conflated. Makeup workdays are separate. |
| Vietnam | 5 records | 6 records | 2 approved intervals | Fixed statutory dates where evidenced and restricted public/weekly-rest arrangements. Not a complete universal private-employer calendar. |
| Thailand | 19 dates | 20 dates | 18 dates | Financial/specialized-financial institutions only. 2026 includes **Bangkok-only October 16**. |

KR 2026/2027's 22/24 dates remain in the independently reviewed existing context; this patch does not duplicate them. China 2024 was found in an official republication but deliberately excluded from application storage, since the requested useful window is bounded rather than all historical years.

No Chinese 2027 annual rest interval or makeup workday was verified. That is **not** proof no notice exists. No 2028 date, lunar calculation, or unannounced extension is synthesized. VN 2027's existing statutory fixed-date rules are documented by the research but deliberately not expanded into a new annual calendar here; only the two specifically approved periods are added. Existing previously reviewed fixed January 1 records remain untouched.

## Publication and effective-date evidence

Every source entry in the server data includes its exact URL, checked date and known issue/publication/effective dates. `null` means not verified, not “none.” Government republication is evidence of the notice's content, not a bypass of a blocked original endpoint.

### China

- **2025**: [Ningbo Haishu official republication, 2024-12-02](https://www.haishu.gov.cn/art/2024/12/2/art_1229825334_4569555.html). Six announced intervals include the combined National Day/Mid-Autumn period. Separate original notice issue date and commencement date were not established from this page.
- **2026**: [Beijing official State Council notice republication](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html?COLLCC=4100365600), 国办发明电〔2025〕7号, issued/published **2025-11-04**; no separate effective date displayed. Spring Festival is **2026-02-15–23**, with workdays **02-14/02-28**; National Day **10-01–07**, with workdays **09-20/10-10**. All seven intervals were read.
- The two previously reviewed CN September/October context IDs are preserved by exact identity when the new evidence replaces them; regional school calendars are not replaced.
- Earlier gov.cn direct 403 outcomes remain recorded in `PRIORITY_COUNTRY_REVIEW_2026-10-21.md`; this pass did not retry or evade those restrictions. Independently published local-government notices were read normally.

### Vietnam

- [2025 approved public-body notice](https://xaydungchinhsach.chinhphu.vn/chinh-thuc-bo-ldtbxh-thong-bao-lich-nghi-tet-nguyen-dan-at-ty-va-nghi-le-nam-2025-119241203175029893.htm): **6150/TB-BLĐTBXH, 2024-12-03**, displayed publication 2024-12-05. Tet, April/May and National Day intervals retain their public-body/Saturday–Sunday scope and separate makeup workday.
- [2026 Tet approved notice section](https://xaydungchinhsach.chinhphu.vn/de-xuat-phuong-an-nghi-tet-am-lich-nghi-le-quoc-khanh-nam-2026-119251002130522291.htm) and [2026 National Day announcement](https://xaydungchinhsach.chinhphu.vn/thong-bao-lich-nghi-le-quoc-khanh-2026-119260729092042494.htm): **9441/TB-BNV, 2025-10-16**. Living pages display 2026-02-24 / 2026-09-01 respectively. The old proposal words in a URL are not used as approval evidence; the approved text was read.
- [2026 New Year approved arrangement](https://xaydungchinhsach.chinhphu.vn/cong-chuc-vien-chuc-nghi-tet-duong-lich-2026-lien-tuc-4-ngay-119251225092146478.htm): **12729/VPCP-KGVX, 2025-12-25**, displayed publication 2025-12-29. Public-body **01-01–04**, with **01-10** makeup work; not four universal statutory days.
- [2027 approved public-body notice](https://xaydungchinhsach.chinhphu.vn/de-xuat-2-phuong-an-nghi-tet-nguyen-dan-2027-tet-dinh-mui-11926080513033257.htm): **11483/TB-BNV, 2026-10-09**, displayed publication **2026-10-20 09:55**. Tet **02-04–10 = five statutory days plus two compensatory weekly-rest days**; National Day **09-02–05 = two statutory plus two weekly-rest days**. Saturday/Sunday public-body schedule applies. Private employers choose permitted Tet and National Day options; their universal Gregorian interval is not asserted. No independent commencement date is stated for these annual arrangements.
- [Labour Code consolidation](https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/9/125-vbhn-vpqh.pdf), arts. 111–112, supplies the statutory/weekly-rest distinction; base code effective **2021-01-01**. [2025 Hung Kings date](https://tphcm.chinhphu.vn/tphcm-to-chuc-le-gio-to-hung-vuong-nam-2025-101250407133715752.htm) and [2026 statutory dates/conditions](https://xaydungchinhsach.chinhphu.vn/lich-nghi-le-gio-to-hung-vuong-30-4-1-5-quoc-khanh-2-9-nam-2026-119260222115822151.htm) establish the recorded historical dates. 2027 Hung Kings Gregorian date remains unverified.
- Culture Day **11-24** remains the one day established by [Resolution 28/2026/QH16](https://xdcs.cdnchinhphu.vn/446259493575335936/2026/5/8/nq28-phat-trien-van-hoa-17782247316352069707813.pdf), issued **2026-04-24**, effective **2026-07-01**. No November 23 bridge is added.

### Thailand

Normal public [BOT financial calendar](https://www.bot.or.th/th/financial-institutions-holiday.html) exposes a year selector. Its public page component and linked JavaScript explicitly request `holidaycalendar_copy.yearslist.json` and `holidaycalendar_copy.model.<Buddhist-year>.json`. The observed list contained 2568, 2569 and 2570; only those three relevant responses were read. This was ordinary public-page data retrieval, not a private endpoint, restriction bypass, or a newly activated automatic adapter. Exact response URLs and SHA-256 hashes are stored with the evidence.

- [2025 base notice สนส.5/2567](https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf): signed **2024-08-13**, gazette **09-05**, effective **09-06**, forwarding letter **09-10**. Scan rendered and visually read. Base notice lists **17** dates; the [current official 2025 calendar response](https://www.bot.or.th/content/bot/th/financial-institutions-holiday/jcr:content/root/container/holidaycalendar_copy.model.2568.json) explicitly adds **2025-06-02 and 08-11**, for **19**. Those two additions are attributed to the current calendar, not falsely to the older base notice; their separate amendment issue/effective dates remain unknown.
- [2026 notice 31/2568](https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf): signed **2025-08-05**, gazette **08-15**, effective **08-16**; **19** main dates verified against rendered PDF and current calendar.
- [Bangkok-only notice 26/2569](https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690116.pdf): signed **2026-06-04**, gazette **06-08**, effective/forwarded **06-09**. Adds **10-16** to Bangkok financial institutions only; necessary-service qualification retained. The separate **10-12/14/15 work-from-home recommendation is not a holiday**.
- [2027 notice 37/2569](https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf): signed **2026-08-17**, gazette **08-25**, effective **08-26**, forwarding letter **08-27**. All **18** dates checked in rendered PDF pp. 2–3 against the current public calendar. Observed/substitute dates remain the published dates, not their underlying weekend anniversaries.
- All three years retain financial-institution scope. Conditional additional Islamic Bank/Chinese New Year/Eid dates for specified southern provinces are not assigned unverified dates. This is not a universal Thai private-sector calendar.

## Integration and performance boundary

Only the existing server `/api/airport/calendar` imports the new evidence JSON. It merges reviewed display facts with the existing seed by country/kind/scope/region/start/end and preserves existing IDs. Schools, KR, other countries and old manual preview are untouched. Public responses omit source tables/hashes and include small `manualCalendarReview` coverage metadata. No provider request or write occurs on a visitor read.

Local API measurement with no D1 rows and existing KR data: 75 → 154 records; 40,300 → 87,451 uncompressed bytes, gzip 3,931 → 7,494 bytes. This is a local serialization/compression measurement, not production transfer evidence.

No new annual data is copied into client-imported `calendar-context.json`, `holidays.json` or `holidays-summary.json`; no UI code changes in this patch. The existing production calendar context can consume these API facts. The 90-day representative holiday card projection remains unchanged; this does **not** claim a full multi-year browsing interface or that offline preview has all new records. New check dates are not backdated to the frozen 2026-10-20 preview.

## Validation

- 39/39 focused tests passed: bounded years, exact country dates/scopes, makeup and compensatory rest, future withholding, institutional bank scope, API identity deduplication, KR/school preservation, server-only import, monthly runtime regressions and original priority-country review.
- An additional 24/24 tests passed for small calendar projection, monthly cadence, scheduler truth and multi-year regressions.
- Scoped ESLint and `git diff --check` passed.
- Full repository typecheck passed with `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck`; the earlier 2048 MiB run was killed with exit 137 during shared build load and was not counted as a pass. No full build/browser/deployment/production workflow was run by this isolated task.
