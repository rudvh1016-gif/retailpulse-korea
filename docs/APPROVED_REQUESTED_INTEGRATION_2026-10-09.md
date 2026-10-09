# Approved retained-day and model integration

Base main: `71b88933866222e5ba4f3e491a2feca8ce982319`.
The candidate consolidates the previous Seoul-model and retained-observation
drafts with the stored-airport-weather preparation in PR323. Merge remains
owner-controlled; no merge or deployment is performed by the agent.

Retained past KST days now read their own bounded observed interval rather than
returning forced null. Today keeps its existing six-hour/73-point query;
future/missing days do not fall back to current data. Comparison/forecast
contracts, quality/zero distinctions and the batched read strategy are preserved.

The requested arrival sentence is removed in all four languages, with the
expected-arrival heading revised and its source/collection timestamp retained.
The approved Seoul Blender models now consume the caller's existing summary
in all four districts. They add no fetch, collection, 3D engine, or hardcoded
production count. Statistical values, periods and units stay in HTML; geometry
is conceptual. Existing category labels/shares use the requested adjacent
layout. Canonical T1 checkpoint IDs now match the existing queue-color rules.

Specific owner approval is recorded in
`approvals/requested-integration-20261009.json`; the normal update command
reads that file and carries no approval transcript in its command arguments.
The update was accepted by normal approval review.

- `app/api/live/summary/route.ts`: `b450bb04e4adb3bd388ebf5c29dc5fbf9d8a4cd0d8cb8a573b04f3710d6b34f8`
  to `147b9c17727c1041e424fe89e9305878c8a9d794e7c531a36c49f81ae24b99b1`.
- `app/live-signals.tsx`: `75888c628f76c15fe6a0c71501742aa74462d5541cb5d2b113e6a9816e82c2a4`
  to `ea7bf2f25b0563eb40d4e1b9cc489c2fe41ef19fc94cd393ac53f016c63fe680`.

All61 protected paths, other59 source hashes, previous approval records,
cron locks and original enforcement are preserved. The original Owner UI Lock
test passed after the normal update. Earlier rejected unrelated changes are not
copied or retried through another route. This approval does not expand METAR
request allowance, keys, permissions, continuous collection or release scope.

METAR actual provider evidence and prepared storage/API/UI limitations are in
`METAR_VERIFIED_BOUNDARY_2026-10-09.md`. Full checks and exact remote head belong
to the final PR record; earlier PR323 CI success applies to its earlier head only.

The first expanded CI on e91f39d passed1238 units and failed4. Two imported
components attempted to load CSS modules in Node. They now use scoped classes
delivered through the already imported unprotected composition stylesheet;
the original CSS review sources remain. The official documentation link is
returned as source metadata by the stored API. The original provider guard is
unchanged, and the browser still fetches only the same-origin stored endpoint.
The existing read-budget diagnostic now guards the complete conditional
realtime query template. Its TODAY measurement SQL and all29 statement guards
remain; no production diagnostic is executed or past-day cost claimed.
The original four failing checks pass after these scoped integration fixes,
without another protected source/hash change or any original test edit.
