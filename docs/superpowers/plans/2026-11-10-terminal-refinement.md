# Terminal Refinement Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded approved UI change, with a fresh whole-branch reviewer.

**Goal:** Deploy the owner's approved light terminal-selector mockup without changing airport data or surrounding UI.
**Architecture:** Extract the existing selector into a small React component. Keep all existing shell callbacks and URL ownership; scope CSS to the single top-level control.
**Tech Stack:** React 19, TypeScript, existing Pretendard CSS, Node tests, Playwright, existing GitHub CI/Cloudflare deployment.
**Spec:** docs/AIRPORT_TERMINAL_REFINEMENT_2026-11-10.md

## Global Constraints

- Preserve all four choices and all four locales, existing accessible primary names, URL/date/history behavior.
- Minimum 52px targets, compact text, light rail, white selected tile, thin outline and check.
- No API, dependency, data, source, scheduler, migration or unrelated UI changes.
- User already reviewed the visual design and requested deployment; continue the authorized implementation.

## Review Focus

- Long English/Japanese labels at 320px must not overlap the check or escape their targets.
- Enlarged text must wrap without horizontal overflow.
- Re-selecting the selected scope must not create redundant history entries.
- Browser back/forward must restore the single selected choice and keyboard tab stop.
- Concourse selection must keep its distinct data scope and restore information tabs on exit.

## Task 1: Implement and validate the terminal rail

**Files:** app/airport-terminal-selector.tsx, app/airport-view.tsx, app/airport-status-controls.css; tests/airport-terminal-refinement.test.ts; e2e/airport-terminal-refinement.spec.ts and the three existing layout tests named in the spec.
**Interfaces:** Consume existing Lang, Terminal, terminal/concourse state and callbacks; produce unchanged AirportView state behavior with a refined selector.

- [x] Write render/browser tests for selected scopes, localized descriptions, non-color marker and input behavior.
- [x] Run the render tests and confirm missing-description failures on the unchanged product.
- [x] Implement the scoped component/CSS and rerun the 16 render cases.
- [x] Run full local tests, lint, typecheck, build, rendered HTML and health. Browser execution remains blocked locally; exact-head CI is mandatory.
- [x] Obtain a fresh code review and fix the protected-UI gate, All-history restoration, and wrapped-check overflow findings with regression coverage.
- [ ] Finish secret scan, commit and push a draft PR, then run browser gates in CI.
- [ ] Verify exact-head CI, merge only if safe, monitor existing deployment and verify the live revision and terminal UI.

## Rulings

The approved terminal mockup is a local exception to old underline-only guidance,
not permission to alter other controls. Browser execution is blocked locally by
the environment; no security bypass is attempted and passing CI is required.
The review exposed an existing All-history restoration bug. Preserve terminal
scope in history state, leaving URL formats and fresh-entry preferences intact.
This is required for the selector's Back/Forward acceptance test to pass.
