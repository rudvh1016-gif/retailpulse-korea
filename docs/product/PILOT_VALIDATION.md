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

The two cohorts are evaluated independently. In particular, the Tourism Desk
gate means **3–5 actual guides or information-desk workers**, not a combined
total padded with Airport participants. Record which of Myeongdong, Hongdae
or Seongsu each participant used, while keeping their identity and employer
out of the notes.

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

For a Tourism Desk participant, observe the guide workflow in order rather
than prompting them toward a particular feature:

- Can they read **오늘 근무 브리핑** and state what matters in 10–30 seconds?
- Do they use **오늘 안내할 것** to answer what, where, when and where to
  verify an event officially?
- Is the station **alighting comparison** useful, and do they understand that
  it is a gate count rather than a visitor or tourist count?
- Do they use **관광객에게 보여주기** when helping an English-, Chinese- or
  Japanese-speaking visitor? Do they understand that an unchanged Korean
  proper name is intentional when no official translation is verified?
- Which of current area detail, background tourism context and source limits
  do they use, and which do they ignore?
- Does the whole page answer a real visitor question faster than their prior
  workflow?

### Return — the only metric that decides anything

9. Did you open it again without being asked? How many times this week?
10. What one missing thing would make you open it again tomorrow?

### Trust — where honesty helped or hurt

11. Did stale official data make you trust the whole product less?
12. Did saying the reference period ("자료 기준 2026년 7월") make you trust
    it more, or did it just look out of date?
13. Did any line make you tell a customer something you later had to correct?

14. Did "today falls within the official event period" stop you from reading
    it as "the event is operating now", or was the caveat still unclear?
15. Did a subway percentage ever make you say that tourists or area visitors
    increased? If so, quote the exact line that caused the mistake.
16. In visitor show, was any interface translation mistaken for an official
    translated event or place name?

Question 13 matters most. A guide repeating a KORETAIL line to a visitor is
the highest-consequence use, and a wrong reading there is worse than a blank
screen.

## What to record per participant

- Pilot cohort and Tourism Desk area used (never employer or shift location)
- Which screens were opened, and in what order (from the diary, not tracking)
- Whether the first 10–30 seconds produced a correct shift summary
- Whether event information, station comparison and visitor show were used
- Number of voluntary returns in the period
- Any label misread, quoted exactly
- Every instance where KORETAIL caused an incorrect statement to a visitor
- The one feature they asked for, in their words
- Whether they would notice if KORETAIL disappeared

## The decision gate

**Continue major Tourism Desk development only if 3–5 real Tourism workers
were tested for 2–4 weeks AND at least 1–2 returned voluntarily.** Praise,
stated intent to return and a researcher-requested second visit do not count
as a voluntary return.

Passing the return gate is necessary, not sufficient. Any case where KORETAIL
caused a worker to tell a visitor something incorrect must be understood and
fixed before expansion, even if the return threshold was met.

If that gate is not met:

- Do not add datasets to try to fix it.
- Find out what the first screen failed to say.
- Reduce spend and keep KORETAIL as a portfolio piece until there is a reason.

## What this validation is NOT

- Not a beta launch. No signup, no waitlist, no marketing.
- Not statistically significant, and it does not pretend to be.
- Not a reason to build the top item on the data-gaps list. That list is
  ordered by guesswork; participants are not.
- Not permission to add a fourth area, a new provider, runtime translation or
  an AI score before the evidence gate is met.
