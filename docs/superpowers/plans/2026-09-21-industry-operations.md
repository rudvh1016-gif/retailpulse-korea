# Industry operations implementation plan

**Goal:** Make essential information immediately available and give every store sector concrete operating decisions, including airport-specific guidance.
**Architecture:** Existing summary and preferences; static typed localized guidance; no backend or dependency changes.
**Tech Stack:** React, TypeScript, existing CSS tokens, node:test, Playwright.

## Constraints

Preserve white-first UI, exact official figures and dates, personal preferences and zero-paid-runtime architecture. Recommendations are editorial operating guidance, never forecasts. Keep airport area selection explicitly separate from the terminal/data scope.

## Tasks

- [ ] Integrate reviewed #202 first-visit flow and existing browser regressions; preserve current main recovery fixes.
- [ ] Add `lib/industry-playbooks.ts`: localized practical priorities and airport notes for all six existing `IndustryId` values; independent location guidance with no numerical forecasts.
- [ ] Add `app/industry-guide.tsx`: accessible sector selector, visible three priorities and expandable rationale/checks, existing phase checklist. Airport variant includes explicit store-location selector and official references.
- [ ] Replace business checklist rendering and connect airport departure/arrival guides in `app/retailpulse-app.tsx`; scoped CSS in `app/globals.css`. Remove unjustified causal claims in `lib/industry-guidance.ts`.
- [ ] Add browser scenarios in `e2e/industry-guide.spec.ts`: six-sector switching, airport context reset, four locales, sparse summary, mobile overflow and screenshots. Execute against old implementation first where practical.
- [ ] Update only changed UI lock entries, document trial scope and upstream PR overlap. Run checks, review diff, commit/push and create reviewable PR with exact results.
