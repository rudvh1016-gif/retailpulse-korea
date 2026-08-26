# KORETAIL — Public Brand Migration Checklist

**Decision:** KORETAIL is the final public brand.  
**Descriptor:** `Retail Demand Signals for Korea`  
**Legacy public brand:** `RetailPulse Korea` / `RetailPulse`  
**Date:** 2026-08-26 KST

This checklist is for Codex, Claude Code, and future coding agents. Read `docs/BRAND_DECISION_KORETAIL.md` and `docs/SHARED_PROJECT_STATE.md` first.

## Goal

Complete the public-facing migration from RetailPulse Korea to KORETAIL without breaking the Cloudflare staging/production bridge, D1 bindings, GitHub Actions, environment variables, secrets, URLs or deployment configuration.

## Already migrated

At the time this checklist was written, the following public-facing surfaces were already changed to KORETAIL:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/SHARED_PROJECT_STATE.md`
- `docs/BRAND_DECISION_KORETAIL.md`
- `docs/BRAND_RESEARCH.md`
- `package.json` `displayName` only
- `app/seo-config.ts` public metadata/site name
- `app/layout.tsx` metadata/OpenGraph/Twitter/JSON-LD
- `app/not-found.tsx`
- `app/[locale]/not-found.tsx`
- `public/manifest.webmanifest`
- rendered HTML title test

## Completed P0 public UI migration

### `app/retailpulse-app.tsx`

This is a large file and must be edited with a minimal diff, not replaced from a stale copy.

The public-facing legacy strings below were migrated to KORETAIL equivalents on the dedicated brand branch:

- `RetailPulse Pro 미리보기` -> `KORETAIL Pro 미리보기`
- `RetailPulse Pro preview` -> `KORETAIL Pro preview`
- `RetailPulse Pro 预览` -> `KORETAIL Pro 预览`
- `RetailPulse Pro プレビュー` -> `KORETAIL Pro プレビュー`
- `RetailPulse에서 할 수 있는 것` -> `KORETAIL에서 할 수 있는 것`
- `WHAT YOU CAN DO WITH RETAILPULSE` -> `WHAT YOU CAN DO WITH KORETAIL`
- `RetailPulse可以做什么` -> `KORETAIL可以做什么`
- `RetailPulseでできること` -> `KORETAILでできること`
- header aria-label `RetailPulse Korea Seoul home` -> `KORETAIL home`
- visible header `RETAILPULSE KOREA` -> `KORETAIL`
- visible secondary header `SEOUL · RPK` -> use a restrained descriptor such as `RETAIL DEMAND SIGNALS · KOREA` or a shorter responsive equivalent after checking mobile width
- audience labels containing `RetailPulse` -> `KORETAIL`
- footer aria-label `RetailPulse sections` -> `KORETAIL sections`
- share text/title `RetailPulse Seoul` -> `KORETAIL`
- FAQ `RetailPulse 점수` / `What is the RetailPulse score?` / Chinese/Japanese equivalents -> KORETAIL equivalents
- methodology paragraph beginning with `RetailPulse` -> `KORETAIL`
- `MY RETAILPULSE` -> `MY KORETAIL`

TypeScript type names, CSS class names, file names, storage keys and internal IDs remain unchanged for compatibility. Public text and accessibility labels were the P0 target.

## Tests that must be synchronized

After the large UI file is migrated, update public-brand assertions in tests, including any literal `RetailPulse` UI strings in:

- `tests/rendered-html.test.mjs`
- any Playwright/E2E assertion that matches public branding

Do not weaken tests just to obtain green CI. Replace old expected brand text with the new expected brand text.

## Asset audit

Inspect public assets for old visible branding:

- `/assets/retailpulse-korea-og.jpg`
- favicon / PWA assets
- any social preview or screenshot containing `RetailPulse`

The existing `favicon.svg` has no visible text and remains compatible with the KORETAIL visual direction.

The old OG filename remains as a technical path. The 1200×630 image was inspected and contains only the Seoul photograph, with no old wordmark.

## Legacy technical identifiers — DO NOT blindly rename

The following may remain temporarily for compatibility:

- GitHub repository slug `retailpulse-korea`
- npm/package internal name `retailpulse-korea`
- file names such as `app/retailpulse-app.tsx` and `app/retailpulse-data.ts`
- environment variable prefix `RPK_`
- Cloudflare Worker names already prepared
- D1 names/IDs already prepared
- secret names and GitHub Environment configuration
- asset paths referenced by deployed code

These are not public-brand failures if users do not see them.

Rename technical identifiers only after checking all references and deployment impact.

## Repository rename

A GitHub repository rename from `retailpulse-korea` to a KORETAIL-oriented slug can be considered later, but only after checking:

- Cloudflare Git integration
- GitHub Actions references
- external links
- clone URLs used by agents
- deployment hooks
- README/docs links
- any external automation

Do not rename the repository in the middle of infrastructure setup merely for cosmetic consistency.

## Brand presentation rule

Preferred public presentation:

```text
KORETAIL
Retail Demand Signals for Korea
```

Do not use `Korea Retail Signal` as the final product name.

Use KORETAIL in uppercase for the primary wordmark/name. Normal prose may still say `KORETAIL` consistently.

## Design direction

The brand should remain:

- modern
- restrained
- editorial
- data-driven
- premium without looking like a luxury brand
- useful to visitors and retail/business users

Avoid:

- generic AI gradients
- excessive card UI
- excessive bright blue
- cute tourism-app styling
- adding new visual clutter just because the brand changed

A brand rename must not trigger an unrelated redesign.

## Verification before merge/push

Run at least:

```bash
npm run secret:scan
npm run lint
npm run typecheck
npm run test:unit
npm run build
node --test tests/rendered-html.test.mjs
npm audit --omit=dev --audit-level=high
npm run test:e2e
```

Also verify:

- ko / en / zh / ja
- mobile 320 / 375 / 390 / 430 widths
- header does not overflow
- PWA install name is KORETAIL
- document title is KORETAIL
- OpenGraph `siteName` is KORETAIL
- JSON-LD name is KORETAIL
- 404 title is KORETAIL
- no public-facing `RetailPulse` remains except intentionally documented legacy/history text

## Final search requirement

Before declaring the public brand migration complete, search the repository for case-insensitive occurrences of:

- `RetailPulse`
- `RetailPulse Korea`
- `RETAILPULSE`
- `RPK Seoul`

Classify every remaining occurrence as either:

1. public-facing -> must migrate
2. historical documentation -> may remain if clearly labeled legacy
3. technical identifier -> may remain temporarily with compatibility rationale

Do not claim migration complete until this classification is reported.

## Current source result

The current brand branch has no legacy public-brand literal in application or public asset source. Remaining matches are limited to:

- historical brand decision, research, audit and archived Work documents that explicitly describe the former name;
- technical identifiers such as repository/package/Worker/D1 names, file and import names, local-storage keys, asset paths and tests that protect compatibility or assert the former public strings stay absent.

Final completion still requires the branch test suite, pull-request CI and post-merge `main` verification.
