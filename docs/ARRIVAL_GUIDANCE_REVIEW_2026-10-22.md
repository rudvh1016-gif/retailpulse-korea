# Arrival allowance guidance — scoped manual review, 2026-10-22

## Review scope

- Reviewed jurisdictions: China, Vietnam, Thailand and Japan. This is **not a claim about today's flight ranking**.
- All official URLs below were actually opened on **2026-10-22**. Dates mean scoped human source review, not automatic success or a new effective date. No claim of exhaustive amendment/special-region coverage.
- Other country review dates are unchanged; PH/MY remain without a verified date.

## Diagnosed behavior and correction

The previous selector correctly withheld ordinary China limits for repeat-entry/minor/unsupported combinations, but fell through to the same generic message. It did not explain the applicable exception or practical declaration/return options. It also treated automatic access-review blocking like an actual failed fetch.

The patch adds condition-specific reasons/actions, China declaration/approved-return/temporary-import detail, Japan child guidance, Vietnam occupational scope, and a separate gift choice for China/Thailand. Unknown is never zero. Switching residence/purpose clears hidden eligibility answers. Numeric Japan publication remains bound to the unchanged approved Japanese dataset hash.

The scoped manual-review date and short automatic status remain visible above traveler selectors; detailed manual scope, attempt/status date, current known automatic-success date and official links are collapsible. A current-row store cannot reconstruct a previous automatic success after a failed row: it explicitly says that date cannot be established, rather than promoting a manual date.

The collector's `verifiedAt ?? checkedAt` fallback was a confirmed metadata defect. Only a valid explicit `verifiedAt` now enters `last_good_verified_at`. This correction does **not** establish that production rows were affected and does not repair or query production.

## China — verified law and practical limits

1. **Tariff Commission announcement 2024 No.11**, published 2024-11-29, effective **2024-12-01**. [Official announcement](https://gss.mof.gov.cn/gzdt/zhengcefabu/202411/t20241129_3948540.htm), [official PDF](https://gss.mof.gov.cn/gzdt/zhengcefabu/202411/P020241129682518318359.pdf).
   - Articles 7–11, 20–21 and appendix 2: ordinary resident CNY5,000/nonresident CNY2,000 distinction; nonresident goods to remain in China versus re-exported personal goods; minor/repeated-entry exceptions; inclusive 12-degree boundary.
   - Repeat entry means **two or more entries within 15 days, including this entry**. Travel-necessary articles replace the ordinary value allowance. Adult repeat-entry tobacco alternatives are 40 cigarettes/heated sticks, 2 cigars or 40g leaf tobacco, once per day; alcohol at least12 degrees has no duty-free allowance. This is not a general import ban or a zero-value allowance.
   - Exact day/time counting and whether an individual item is travel-necessary remain customs determinations.
2. **GACC Order276**, promulgated 2025-02-17, effective **2025-04-01**. [Official Ministry of Commerce republication](https://www.mofcom.gov.cn/zcfb/zgdwjjmywg/art/2025/art_2412b6f8868b4034bf55a1261158e544.html).
   - Articles9/11/12: excess goods require written/electronic declaration; red channel for declarable goods or uncertainty. Articles19/20: permitted import follows tax/security, permits and applicable quarantine.
   - Article13: temporary import/export is a registration/security/approval process, distinct from leaving goods in customs custody for return. Articles23–27: customs-approved return of handled unpaid-tax goods is possible, not automatic; ordinary unresolved procedures generally3months, some dangerous/perishable/public-health goods7days; missed deadlines can lead to disposal.
   - Nationwide pickup airport/counter/hours, cross-airport transfer, receipt form and fees are **not established by this source**. Ask the entry customs office before leaving goods; obtain/retain the custody paperwork and confirm the return deadline and arrangements. Do not promise free storage or pickup at any airport.
3. **GACC announcement2025 No.43**, published2025-03-31, effective2025-04-01. [Official government republication](https://app.www.gov.cn/govdata/gov/202504/05/526129/article.html): declaration implementation and temporary-import registration support.
4. **Hong Kong/Macao origin concession**, announcement2024-06-27; initial ports2024-07-01, expansion2024-08-01. [Official government text](https://app.www.gov.cn/govdata/gov/202406/28/516692/article.html). Its adult resident-traveler conditions are not automatically satisfied by transiting Hong Kong/Macao; repeat-entry restrictions remain separate.
5. **Gift uncertainty:** [MOJ official administrative-penalty regulation PDF](https://xzfg.moj.gov.cn/law/download?LawID=1457&t=1736353755890&type=pdf), amended2022-03-29, Article64 includes gifts to friends/relatives in its own-use definition. MOF2024-11 Article20(5) uses personal-use wording. The nationwide relationship for blanket gift exemption was not resolved; the UI requests customs confirmation, not “gifts prohibited/no allowance.” [Hengqin official FAQ,2026-07-23](https://www.hengqin.gov.cn/macao_zh_hans/hdjl/cjwt/content/post_3926756.html) supports the supervision definition but is special-region guidance, not a nationwide exemption ruling.
6. [Shenzhen government-hosted customs reply,2024-11-21](https://szjgdj.sz.gov.cn/home/ztzl/mxq/jmlb/content/post_1419250.html) describes original custody paperwork and the entry customs office's departure counter. It predates Order276 and is **not promoted to a current nationwide pickup guarantee**.

## Vietnam — existing values confirmed, proposal kept separate

- [Official consolidated Gazette PDF](https://congbaocdn.chinhphu.vn/CongBaoCP/CongBao/2023/6/39609/45447-1-787-788.pdf), consolidation2023-06-16/Gazette2023-06-29, pp.53–54, Article6. [134/2016 decree record](https://vanban.chinhphu.vn/?docid=186707&pageid=27160), enacted/effective2016-09-01.
- Confirms other-goods VND10,000,000; appropriate personal articles separate; alcohol1.5L at20degrees or above/2L below20degrees/beer etc3L; tobacco200cigarettes/250g leaf/20cigars. Under18 alcohol/tobacco exclusion does not remove all general-goods eligibility.
- The90-day rule applies to the **listed occupational groups**, not every frequent tourist.
- [167/2025 official Gazette](https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2025/6/45351/57292-1-2025883-884167-2025-nd-cp.pdf), promulgated2025-06-30, relevant provision effective2025-08-15, pp.45/86: excess declaration and same-trip family baggage exception to pooling restrictions. Not a new minor alcohol/tobacco entitlement.
- [182/2025 signed decree](https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/182nd.signed.pdf), enacted/effective2025-07-01: all4pages visually inspected; amends Articles24/30, repeals19, consequential31/40 changes; **does not amend Article6**. PDF SHA256 `7d40bb6ad447f9661b471e97ccb31deba06fec42049cfafc4865ba9874f061f5`.
- [Government electronic/heated-tobacco prohibition explanation](https://xaydungchinhsach.chinhphu.vn/cam-san-xuat-kinh-doanh-nhap-khau-chua-chap-van-chuyen-su-dung-thuoc-la-dien-tu-thuoc-la-nung-nong-tu-nam-2025-119241214164955394.htm), published2024-12-17, explains Resolution173/2024/QH15 restrictions from2025.
- [2026-10-14 proposal](https://xaydungchinhsach.chinhphu.vn/de-xuat-dinh-muc-mien-thue-voi-hanh-ly-cua-nguoi-xuat-canh-nhap-canh-dinh-muc-mien-thue-qua-bieu-tang-119261014164626593.htm) is expressly a **draft**, not a newly effective allowance.

## Thailand — own-use scope, no invented age or storage rule

- [Current official passenger guide](https://www.customs.go.th/list_strc_simple_neted.php?ini_content=individual_160503_03_160905_01&lang=en&left_menu=menu_individual_submenu_01_160421_01): reasonable own-use accompanied articlesTHB20,000, alcohol1L, cigarettes200 or tobacco250g; mixed total250g with cigarettes not above200. Food/prohibited/restricted goods are separate. No basic effective date displayed.
- [Customs FAQ](https://apps.customs.go.th/cont_strc_faq.php?current_id=142328324146505f47&ini_menu=menu_pbc&lang=en&left_menu=menu_pbc_03&top_menu=menu_homepage), published2018-02-08/updated2018-05-28: commercial use is not covered merely by being below the value threshold.
- [Official traveler chart, p.28](https://brussels.customs.go.th/data_files/d18e9419dbac9d72347ecd281d76550b.pdf), as of2020-01-20, references Notice60/2561. Excess alcohol/tobacco has surrender guidance, not guaranteed admission by tax payment.
- [Customs2025 annual report, p.228](https://www.customs.go.th/data_files/e8805f7710fe5246124b46cc868d3b98/files/basic-html/page230.html) cites electronic-cigarette/equipment/liquid prohibition dated2014-12-12. No extension to every heated-tobacco classification.
- No verified general age threshold, repeat-entry interval, family pooling or storage/re-export guarantee was added.

## Japan — existing numeric baseline retained

- [Japanese Customs allowance guide](https://www.customs.go.jp/kaigairyoko/menzei.htm), [English FAQ7105](https://www.customs.go.jp/english/c-answer_e/keitaibetsuso/7105_e.htm): JPY200,000; alcohol3×760mL; cigarettes200; perfume2oz≈56mL. Under20 alcohol/tobacco exclusion; under6 only clearly child-use articles; no blanket zero. Per-item/set overJPY200,000 and item-category total≤JPY10,000 distinctions remain.
- [Official tobacco leaflet](https://www.customs.go.jp/kaigairyoko/cigarette_leaflet_j.pdf), issued2021-09/current tobacco allowance effective2021-10-01. General allowance first effective date remains unknown.
- [Official declaration guide](https://www.customs.go.jp/english/summary/passenger.htm): declaration and declarable/restricted-item channels; no inferred storage rights.

## Validation and remaining boundary

Validation results:

Manual reference links are checked for a nonempty single-line label and an absolute HTTPS URL without embedded credentials. These display references do not authorize automatic source access.

- 63 focused unit tests across `arrival-allowance-guidance`, `arrival-allowances-preview`, `customs-allowance-runtime`, `customs-allowance-check`, `customs-japan-numeric`, `notice-review-labels`, `priority-country-review` and `reference-change-notices`.
- Targeted ESLint on all changed code/tests.
- Scoped component TypeScript: `tsc --noEmit --strict --skipLibCheck --esModuleInterop --resolveJsonModule --moduleResolution bundler --module esnext --target es2022 --jsx react-jsx app/arrival-allowances-preview.tsx` (not the full project).
- Secret scan of working tree and reachable Git history; `git diff --check`.
- The unchanged Owner UI Lock/no-recurring-schedule test (1) with `CLOUDFLARE_CF_FETCH_ENABLED=false`, plus `approved-copy-symbols` and `approved-color-assets` tests (4).
- `playwright test e2e/arrival-allowance-refresh.spec.ts --project chromium --list`: 7 registered cases, including 4 locale routes; **listing only, no browser execution**.

The guidance remains Korean and is marked `lang="ko"`. The four locale-route cases verify selection behavior and content language, not translated legal guidance. Full-project build/typecheck and rendered browser behavior are not established by these focused checks. Automatic-source access, collector permissions, source baselines and database records are unchanged.
