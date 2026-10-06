# RKSI METAR schema review — 2026-10-06

This is an offline parser repair and a separately authorized, manual contract confirmation. It does not activate METAR as a production source or complete a weather feature.

## Problem and behavior

The second server request returned HTTP 200, provider code 00 and one JSON item, but the flat parser could not establish station or observation time. No raw response was retained. A successful transport therefore did not establish a valid data contract.

The bounded adapter supports flat legacy JSON, nested IWXXM JSON and an XML report embedded in JSON. It follows the actual observation's `OM_Observation.phenomenonTime.TimeInstant.timePosition`; result, issue and trend times cannot substitute. Station must come from an actual airport identifier or the report's METAR/SPECI message, with conflicts rejected. Unknown units and nil measurements are withheld; actual zero remains zero. Public measurements retain their reported unit and safe field path. Ground wind does not produce a turbulence-risk label.

XML processing is restricted and non-validating: DTD/entity declarations, malformed nesting and excessive work are rejected. Only local phenomenon-time references resolve. There is no external XML fetch or XSD-validation claim. Paths and types are allowlisted; unknown keys become `[OTHER]`. The original message, unknown values, raw response, credentials and authenticated URL are never emitted.

## Primary references and limits

- Official service and parameter table: https://www.data.go.kr/data/15059455/openapi.do
- Official WMO IWXXM 2.0 example: https://raw.githubusercontent.com/wmo-im/iwxxm/v2.0/IWXXM/examples/metar-A3-1.xml

The portal's downloaded response guide shows `response.body.items.item.iwxxm:METAR` with nested observation time and airport identifier. Its example is incomplete XML, and its output table is flattened. The guide alone cannot establish the current provider's JSON packaging. Offline fixtures use explicitly synthetic RKSI observations rather than invented production records.

## Manual confirmation boundary

The earlier two requests are complete. The owner authorized one additional normal GET to confirm the repaired response structure: maximum 30 seconds, zero retries, the same fixed endpoint and existing server credential. The separate `metar-schema-once` workflow mode requires `workflow_dispatch`, the production environment and `METAR_SCHEMA_ONCE=1`. Other collection/diagnostic jobs are excluded in this mode. Contents remain read-only; existing concurrency, schedules, credential names and environment protection are retained.

The command emits only safe transport metadata, paths/types and validated public observation values with their unit/time. It performs no D1 write, stores no raw payload and creates no recurring schedule. Any unverified result remains unverified; another request requires new authorization. No credential, account or persistent permission is changed.

## Validation and execution status

Affected parser/contract/manual-guard tests and focused lint must pass before push. Workflow structure, unchanged collector steps, protected hashes, repository secret patterns and diff checks are also verified. This change adds no dependency and touches no client/UI source, font or asset; a fresh UI build or repeated browser suite does not substantiate this server-only repair.

The additional GET has not been executed at the time of this source commit. Its exact run/head and safe result will be recorded in the draft PR. No merge, deployment or METAR production activation is performed by this work.
