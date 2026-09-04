# KORETAIL — Real-user validation plan

**Recorded:** 2026-09-04 KST
**Purpose:** decide whether to keep developing KORETAIL, and if so, what.

Development stops after this round (see `docs/product/PRODUCT_DIRECTION.md`).
This document is how that decision gets made from evidence instead of from
enthusiasm.

## Who

| Group | Target | Screen |
|---|---|---|
| Airport retail / operations workers | 3–5 people | `/{lang}/airport`, especially 내 매장 |
| Tourism guides / information-desk staff | 3–5 people | `/{lang}/tourism-desk/{area}` (Myeongdong, Hongdae, Seongsu pilot) |

Small on purpose. Eight people who actually work a shift tell you more than a
hundred who click once.

## How long

**2–4 weeks.** Long enough that the novelty wears off and a second visit means
something.

## How data is collected

- A short interview at the start (10 minutes) and at the end (20 minutes).
- A paper or message diary the participant keeps in their own words.
- Voluntary. No account, no tracking pixel, no analytics SDK.

**No unnecessary personal data.** No names in the notes, no employer, no
shift schedules, no customer information. A participant is "airport-3" or
"desk-2". Anything a participant says about their workplace stays out of the
repository — that rule already cost one code comment on 2026-09-04 and it
applies here too.

## What to ask

### Comprehension — did the screen explain itself?

1. Could you understand the first screen without anyone explaining it?
2. Was there any label you read one way and later found meant something else?
3. When a number was old, could you tell whether that was the source or us?

### Actual use — what did they use, not what they liked

4. Which information did you actually use during a shift?
5. Which screen did you open first?
6. Which feature did you ignore completely?
7. What task did KORETAIL replace?
8. Did it reduce the number of official sites you check before a shift?

### Return — the only metric that decides anything

9. Did you open it again without being asked? How many times this week?
10. What one missing thing would make you open it again tomorrow?

### Trust — where honesty helped or hurt

11. Did stale official data make you trust the whole product less?
12. Did saying the reference period ("자료 기준 2026년 7월") make you trust
    it more, or did it just look out of date?
13. Did any line make you tell a customer something you later had to correct?

Question 13 matters most. A guide repeating a KORETAIL line to a visitor is
the highest-consequence use, and a wrong reading there is worse than a blank
screen.

## What to record per participant

- Which screens were opened, and in what order (from the diary, not tracking)
- Number of voluntary returns in the period
- Any label misread, quoted exactly
- The one feature they asked for, in their words
- Whether they would notice if KORETAIL disappeared

## The decision gate

**Continue major development only if 3–5 real users were tested AND at least
1–2 returned voluntarily.**

If that gate is not met:

- Do not add datasets to try to fix it.
- Find out what the first screen failed to say.
- Reduce spend and keep KORETAIL as a portfolio piece until there is a reason.

## What this validation is NOT

- Not a beta launch. No signup, no waitlist, no marketing.
- Not statistically significant, and it does not pretend to be.
- Not a reason to build the top item on the data-gaps list. That list is
  ordered by guesswork; participants are not.
