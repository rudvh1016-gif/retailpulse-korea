# Locale Font Consistency Design

Date: 2026-09-02
Starting SHA: `afa9cfc7678e1b577b73b5bbad275765cdac764b`
Branch: `fix/locale-font-consistency`

## Objective

Make the public KO, EN, ZH, and JA surfaces look typographically consistent without changing content, layout, data behavior, or the completed A5 arrival implementation.

## Evidence and Root Cause

Production already loads every declared font and the Korean business page's visible Hangul is covered by the bundled Pretendard subset. The visible inconsistency is therefore not a failed font download or a missing Korean glyph.

The inconsistency comes from two CSS policies:

1. The same page uses many intermediate weights (`420`, `500`, `550`, `600`, `620`, `650`, `700`, `750`, and `800`). This makes adjacent labels, tabs, headings, values, and checklist copy look as if they use different typefaces.
2. Japanese and Simplified Chinese have only local `400` and `600` font files, but the UI requests the same intermediate weights. Browsers must synthesize those weights. The locale classes also do not explicitly put the matching Noto family first, so the intended locale-specific typeface is not guaranteed consistently.

## Chosen Approach

Use one locale-aware UI font variable and a two-weight system.

- Korean and English: `Pretendard Variable` first.
- Japanese: `Noto Sans JP Variable` first.
- Simplified Chinese: `Noto Sans SC Variable` first.
- Regular text and metadata: weight `400`.
- Headings, labels, active controls, and emphasized values: weight `600`.

The existing self-hosted assets already provide these faces and weights, so the change adds no remote font dependency and no new font file.

## CSS Architecture

Define semantic tokens at the application boundary:

- `--font-ui`
- `--weight-regular: 400`
- `--weight-strong: 600`

The default `--font-ui` uses Pretendard. `.app.lang-ja` and `.app.lang-zh` override it with their matching Noto family. Body and application descendants inherit this variable.

Replace arbitrary numeric weights in the public stylesheet with the appropriate semantic token. The change preserves size, line height, spacing, color, layout, responsive rules, and information hierarchy. Active controls remain distinguishable through color and underline as well as the strong weight.

## Scope Boundaries

In scope:

- Global and locale-specific font-family precedence.
- Font-weight normalization across all public UI components.
- Regression coverage for KO, EN, ZH, and JA.
- Production visual verification of the business checklist and representative main/airport pages.

Out of scope:

- Copy, localization, layout, spacing, colors, or component redesign.
- New font downloads or third-party font CDNs.
- Data collectors, APIs, D1, Edge Cache, Crons, source health, or Demand Index.
- A5 arrival/departure behavior.
- Phase 2–5 data expansion.

## Failure and Fallback Behavior

Each locale stack keeps system UI and generic sans-serif fallbacks after the self-hosted family. A missing font asset therefore remains readable without a blank-text failure. Tests will continue to require the local assets and verify that the intended primary family loads.

## Testing

Add regression tests that fail before the CSS change and prove:

1. The locale classes select Pretendard for KO/EN, Noto Sans JP for JA, and Noto Sans SC for ZH.
2. Public CSS no longer requests unsupported or arbitrary UI weights; rendered UI weights are limited to `400` and `600`.
3. The existing bounded local font assets remain present.
4. KO, EN, ZH, and JA pages still render and hydrate.
5. The business checklist keeps its structure and active-state affordance.

Then run typecheck, lint, secret scan, unit tests, the full rendered suite, build, and Playwright at representative desktop and mobile widths.

## Delivery

Ship this as one focused PR before Phase 2. Merge only after green CI, deploy the merged `main`, run Production Site Smoke, and verify computed font family/weight on all four locales. Do not mix the preserved Edge Cache residual files or any Phase 2–5 work into this branch.
