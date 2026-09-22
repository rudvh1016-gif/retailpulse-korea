# Vendored SEO / AEO / GEO skill provenance

`.claude/skills/` holds third-party Claude Code skills, checked in so that any
agent working on KORETAIL discoverability starts from the same published
guidance instead of re-deriving it. They are documentation and prompts: none of
them is imported by the product, bundled into the Worker, or executed at
request time. Removing the directory cannot change what the site serves.

Every skill below is MIT licensed. Each vendored directory carries the
upstream `LICENSE.txt`; the copyright lines are repeated here so the provenance
survives a directory move.

## Selection

Downloaded 2026-09-22 KST, ranked by GitHub stars, keeping only what applies to
a Next.js App Router site on Cloudflare Workers Free that must rank in Korea.
Anything needing a paid API (DataForSEO, Firecrawl), a backlink-outreach
programme, or an e-commerce product feed was left out — see the zero-cost rule
in `docs/ENGINEERING_DIRECTION.md`.

| Vendored as | Upstream | Stars at download | Commit |
|---|---|---|---|
| `seo-geo`, `seo-schema`, `seo-technical`, `seo-hreflang` | [`AgriciDaniel/claude-seo`](https://github.com/AgriciDaniel/claude-seo) | 17,388 | `92795530b4cc92c6bf7a2435b82c15b003e71181` (2026-09-11) |
| `audit-website-aeo`, `improve-aeo-geo` | [`onvoyage-ai/gtm-engineer-skills`](https://github.com/onvoyage-ai/gtm-engineer-skills) | 1,308 | `3777930184a10b25ab36bb2fc4da6c0f6cfcc187` (2026-06-07) |
| `web-seo-aeo-geo-google-naver` | [`gunheeaug/web-seo-aeo-geo-google-naver-skill`](https://github.com/gunheeaug/web-seo-aeo-geo-google-naver-skill) | 41 | `d14ac7d8afc5a3e829883b300c108093402518ad` (2026-06-26) |

The last one is small and low-starred but is the only downloaded skill written
for exactly this stack — Next.js App Router plus Naver Search Advisor — and
Naver is where most Korean human traffic to this site has to come from.

## Copyright

- `AgriciDaniel/claude-seo` — MIT, Copyright (c) 2026 agricidaniel
- `onvoyage-ai/gtm-engineer-skills` — MIT, Copyright (c) 2025 OnVoyage AI
- `gunheeaug/web-seo-aeo-geo-google-naver-skill` — MIT, Copyright (c) 2026

## Read, not obeyed

These skills are outside advice. Where one conflicts with `CLAUDE.md`,
`AGENTS.md`, `docs/ENGINEERING_DIRECTION.md` or `docs/ZERO_COST_HYBRID_AUDIT.md`,
the repository documents win. Two conflicts are already known and resolved in
`docs/GEO_SEO.md`:

- the Naver 80-character description ceiling versus the Google minimum-snippet
  floor that `lib/discoverability.ts` enforces;
- schema types (`Review`, `aggregateRating`, `Restaurant`) that the skills
  recommend and KORETAIL must not emit, because it holds no such data and the
  truth boundaries in `AGENTS.md` forbid inventing it.

## Evaluated and not vendored

- [`Auriti-Labs/geo-optimizer-skill`](https://github.com/Auriti-Labs/geo-optimizer-skill)
  (872 stars) — a Python CLI plus Docker service. Useful reading, but it is a
  runtime dependency rather than guidance, and its `SCORING_RUBRIC.md` scores
  the skill's own codebase, not a website.
- [`leopard627/fire-your-seo-agency`](https://github.com/leopard627/fire-your-seo-agency)
  (517 stars) — covers Naver (NEO) and LLMO, but overlaps
  `web-seo-aeo-geo-google-naver` on everything KORETAIL needs.
