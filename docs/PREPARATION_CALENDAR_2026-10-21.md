# Preparation calendar — 2026-10-21

Base: `4f7f803` (integrated morning-interface branch). This is a separate local
UI change; no push, PR, collector activation, database write, or deployment.

## Owner-requested scope

- `/ko/airport-prepare`: native country/region select inside a compact translucent
  border pill. White page, no gray page backdrop.
- Compact month calendar below the filter, using already reviewed official
  dates. Korean Oct 3/5/9 and existing Christmas/New Year dates are included.
- Flags and small event names appear on each inclusive date of a multiday event.
  Two chips per cell; `+N` opens all full names, original descriptions,
  applicability, source links and review dates for the day.
- Previous/next/today are native keyboard-operable buttons with 44px targets.
- Country filter controls both calendar and existing upcoming-90-day detailed
  list. Month navigation does **not** remove/replace that original list.
- Larger arrival-allowance action keeps `#arrival-allowances`, reuses the existing
  plane icon, and has only finite, reduced-motion-aware interaction animation.
- The airport date-card change is outside this commit.

## Truth boundary

No new dates or school schedules are invented here. The calendar combines the
existing reviewed seed and official-calendar response, retaining source scope,
review dates, replacement boundaries and stale/unverified withholding. A blank
day is explicitly unknown, not proof of no holidays. Korean static review is not
represented as KASI automatic-collection success. Public annual KR dataset
expansion is a separate data-only task.

## Verification

- 33 focused tests passed: `preparation-calendar`, `official-calendar-runtime`,
  `airport-calendar-summary`, `holiday-flight-brief`, `holiday-period-comparison`.
- Targeted ESLint: 0 errors; existing image and `window.location.assign` warnings.
- TypeScript and secret scan results are recorded in the parent handoff.
- Added `e2e/preparation-calendar.spec.ts` for 320/390/1440 widths, shared filter,
  past Korean sources, keyboard month navigation, preserved 90-day prose,
  overflow expansion/collapse, 44px navigation, no horizontal overflow,
  reduced-motion CTA and exact destination anchor.
- Browser/E2E and visual screenshots were not run locally: the previously denied
  browser IPC path was not retried. Parent owns centralized CI/browser checks.
