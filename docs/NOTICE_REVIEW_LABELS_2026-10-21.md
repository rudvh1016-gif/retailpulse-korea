# Requested notice heading and arrival review dates

Stacked on #417 `c51f9119224c87a4226d789c317f86d282cc04ea`. Draft only; no merge/deployment.

- Shared `UPDATE_NOTICE_TITLE` is exactly `new update!` for ko/en/zh/ja and future notices. Badge, body, notice release date, preferences and accessible title identity are unchanged.
- Move the existing arrival source-date line outside the collapsed sources, below the selected country's result, using existing small `focus-source` typography. No duplicate date or new CSS/box.
- Use only static `verifiedAt`, not collection-attempt `checkedAt` or API `lastCheckedAt`. CN/VN/TH manual review 2026-10-21 is documented in PRIORITY_COUNTRY_REVIEW_2026-10-21.md. JP/US/TW/HK/SG/AU/CA remain 2026-10-20. PH/MY have no verifiedAt and explicitly show 미확인 · 검토 필요. Invalid/missing review dates fail closed.
- Dates are limited review evidence, not a blanket guarantee of current law. Existing country notes and effective-date labels remain unchanged. Japan's automatic numeric update stays separately scoped to alcohol/cigarettes/perfume; its changedAt/updatedAt never refreshes the manual date for general goods or exceptions. Source-byte equality is not legal re-verification.
- All quantities, conditions, sources, dataset, collectors, schedulers, migrations, dependencies, fonts and protection fixtures unchanged. No live source request or production write.

Validation: focused date/notice/allowance/runtime/font tests 39/39; related preparation/reference-notice/manual-review/Owner UI Lock tests 68/68 (3 shared tests overlap); typecheck and scoped lint pass; diff check pass. UI guideline review: accessible dialog label/focus/ESC and semantic small text preserved. Added normal CI browser assertions for four locale headings and six country dates, visibility, small font and newer-attempt non-promotion. Local browser launch is not attempted due to prior denial; full build/browser verification is required from exact-head normal CI, not claimed here.
