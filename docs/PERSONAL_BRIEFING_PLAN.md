# Personalized briefing implementation plan — 2026-09-08

Baseline: freshly fetched origin/main 04b0e2f51ac3c41c0245e0e93477896398ec9f13.

User approved the product specification and requested audit → short plan → implementation in this session.

- [x] Audit existing summary contract, routes, preferences, PWA, security headers and deployment workflow.
- [x] Add versioned, validated device preferences and a pure evidence-only briefing builder; test invalid storage, date boundaries, partial airport coverage, concourse and historical labels.
- [x] Add four-step localized onboarding, editable settings, optional analytics choice, personal briefing and deduplicated feedback. Preserve public detail content and existing summary cache. Reuse current fonts and white/ink visual system; use a compact four-step progress line and a readable briefing sheet.
- [x] Add optional GA4 public configuration, allowlisted parameters, deferred loading and minimal CSP hosts; wire existing PWA guide events. No user identifiers or arbitrary URL/query data in custom events.
- [x] Update truthful localized SEO copy, optional verification metadata and deployment variable wiring. Audit public redirects/robots/sitemap/404.
- [x] Run unit/lint/type/build/render/secret/browser checks, including 390/768/1280/1920 and ko/en/zh/ja; inspect diff and open PR, await CI.
- [x] Report setup steps and Web Push feasibility with official sources.

Data boundaries: airport daily forecast only for COMPLETE coverage and exact target date; concourse uses flight scope only and never inherits T1 passengers. Seoul forecasts span rolling hours, not guaranteed full tomorrow. Weather/events filtered by target KST day; foreign presence explicitly historical. No new provider, server data write, migration, scheduler or paid runtime.

Audit notes: shared state contains historical pre-activation statements; current production/engineering docs and code describe active hybrid collectors and five trigger-only Crons. This change leaves all of them unchanged. Manifest and install guide exist; no service worker/push subscription/sender found. Actual push deferred as explicitly required.

PR 생성 및 자동 검사 결과는 PR과 운영 보고서에서 확인합니다.

