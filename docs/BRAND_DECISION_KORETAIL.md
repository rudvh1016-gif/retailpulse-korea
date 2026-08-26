# KORETAIL — Canonical Brand Decision

**Decision date:** 2026-08-26 KST  
**Status:** APPROVED by owner  
**Canonical product brand:** `KORETAIL`

## Brand meaning

`KORETAIL` is a coined brand built from **Korea + Retail**.

It represents a Korea-focused retail-demand intelligence product that turns airport, tourism, visitor, weather, population and commercial-area data into understandable forward-looking demand signals.

## Canonical public presentation

Primary wordmark:

`KORETAIL`

Preferred descriptive line:

`Retail Demand Signals for Korea`

Alternative Korean explanatory line when needed:

`한국 리테일 수요 신호`

## Product direction

KORETAIL should be positioned as a modern data-intelligence product, not a generic tourism dashboard or raw public-data viewer.

Core promise:

- tell users what is happening now
- estimate what is likely to happen next
- explain why
- clearly distinguish official history, proxy signals, forecast and actual outcome

Initial focus remains Seoul-first:

- Myeongdong
- Hongdae
- Seongsu
- Incheon Airport T1/T2
- foreign-visitor / shopping-demand signals

Long-term geographic expansion can extend beyond Seoul without changing the KORETAIL brand.

## Naming rules for agents

From this decision onward:

- Public-facing brand should be `KORETAIL`.
- Do not introduce `Korea Retail Signal` as the final brand.
- `RetailPulse Korea` is a legacy name and should be migrated out of public-facing UI, SEO metadata, marketing copy and documentation when safe.
- Keep `Retail Demand Signals for Korea` as the preferred descriptive subtitle unless the owner later changes it.

## Technical identifier migration rule

Brand migration must not break active Cloudflare, GitHub Actions, D1, DNS, deployment, or secret configuration.

Therefore distinguish:

1. **Public brand identifiers** — migrate to `KORETAIL` immediately where safe.
2. **Technical resource identifiers** such as repository name, Cloudflare Worker name, D1 database name, environment variables, secret names and deployment IDs — migrate only with an explicit compatibility-safe plan.

If a technical identifier is already referenced by active infrastructure, preserve it temporarily and document it as a legacy internal identifier rather than breaking production preparation.

## Brand style direction

KORETAIL should feel:

- modern
- editorial
- restrained
- data-driven
- premium but not luxury-for-luxury's-sake
- useful to both visitors and retail/business users

Avoid:

- generic AI gradients
- excessive cards
- overuse of bright colors
- overly cute tourism-app styling
- visual clichés that make it look like an AI-generated dashboard

## Truth and trust

Branding must never overstate data certainty.

KORETAIL must continue to label clearly:

- official data
- proxy signal
- forecast
- actual outcome
- stale / missing / degraded data

The brand promise depends on evidence and transparent uncertainty, not on exaggerated confidence.
