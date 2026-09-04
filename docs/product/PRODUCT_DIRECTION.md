# KORETAIL — Product direction

**Recorded:** 2026-09-04 KST
**Scope:** what KORETAIL is for, what gets built next, and what deliberately does not.

Engineering rules live in `docs/ENGINEERING_DIRECTION.md`; this file does not
repeat them. This one answers a different question: given limited time and a
zero-cost constraint, **where does effort go**.

## What KORETAIL is

> 관광객과 상권의 흐름을 여러 공식 데이터에서 모아, 현장 근무자가 지금
> 무엇을 확인해야 하는지 한눈에 보여주는 운영 인텔리전스 서비스.

The reader is a **person at work** — an airport retail or operations worker, a
tourism-information staffer — not a consumer planning a trip. The product has
moved past "can we collect and display these datasets" to "can a real field
worker understand exactly what the data means and use it during a shift".

## Three modes, unequal by design

| Mode | Status | Why |
|---|---|---|
| **Airport operations** | **FLAGSHIP** | Deepest data, a real daily user need, and the only mode where KORETAIL already replaces checking several official sites |
| **Myeongdong tourism desk** | **PILOT** | One area, one worker type, built entirely from existing data to test whether the format is useful at all |
| **Myeongdong / Hongdae / Seongsu retail** | **MAINTAIN** | Works, is truthful, has no evidence of repeat use yet. Keep it correct; do not expand it |

**These are not developed equally.** Airport stays the flagship. Tourism desk
gets whatever the pilot proves it needs. Retail gets correctness fixes only.

## What "done" looks like for Airport

Functionally complete as of 2026-09-04:

- A1 flights and gate ranking · airline ranking with a registered-country roll-up
- T1/T2 departure-hall congestion · A5 passenger forecast
- A2 official facility directory (1,221 facilities, four languages)
- A3 verified facility-to-zone mapping (459 proven, 762 honestly ambiguous)
- A4 per-facility operations briefing with a printable sheet

**No more Airport features.** Remaining Airport work is integrity and honesty
only — the kind that removes a wrong reading, not the kind that adds a screen.

## What is deliberately NOT being built

Not because they are hard, but because nothing yet shows they would be used:

- more Seoul areas — a larger area count is not evidence of a better product
- more APIs — "an official API exists" is not a reason
- nationwide rollout
- native iOS / Android — responsive web is enough for validation
- login, payment, subscription, advertising
- AI scoring, runtime LLM, any generated recommendation
- a B2B admin dashboard
- automated marketing

## What counts as success

Not API count. Not feature count. Not commit count.

> **Does a real worker voluntarily open KORETAIL again?**

The gate before any further expansion: **3–5 real users tested, and at least
1–2 of them come back without being asked.** That is a product heuristic, not
statistical proof, and it is written down so it cannot be quietly lowered.

See `docs/product/PILOT_VALIDATION.md` for how that is measured.

## Where future B2B value would come from

Not from "we collect public data" — anyone can. If repeat use is proven, the
things worth charging for are the ones that save a shift's time:

- the per-store operations briefing
- a team briefing one person prepares for several staff
- multi-location comparison
- a recurring operations report
- alerts on a threshold the worker chose
- fewer official sites to check before a shift

None of that is built until repeat use exists.

## The stop rule

After the 2026-09-04 continuation, **major feature development stops.**

| What pilot users do | What happens next |
|---|---|
| Come back on their own | Improve only what they actually used |
| Praise it, never return | Find out why. Do not add APIs |
| Ask for one specific thing | Evaluate that one thing |
| Do not use it | Reduce spend; keep it as a portfolio piece |

The next big feature must come from user evidence, not from an available
dataset.
