# Device-local travel records review

The departure preparation guide links to `/{ko,en,zh,ja}/travel-records`. A new visitor sees an empty collection with the existing Blender departure illustration. Adding a record saves its date, airports, short note and optional photo in this browser's IndexedDB. The record can be reopened, edited, exported to JSON and restored after preview and explicit confirmation.

Base inspected: `6ff277b9d0b227b00f6606c80209c28ada7d83e7` (main, PR #277). Branch: `feat/travel-records-local-20261006`. Implementation uses an independent worktree. No code from PR #267, #276 or #278 was fetched or incorporated. The protected app shell, global fonts/styles, UI Lock fixture and its 52 protected files are unchanged. Entry was added inside the existing unprotected departure preparation component, without a new passenger/staff switch.

## Storage and privacy

- Existing validated local MVP core is reused in `lib/travel-records/`; no new package dependencies, remote storage, account, API route, scheduler, collector or D1 writes.
- The four locales share database `koretail-travel-local-v1`. Record navigation uses URL fragments. Record text, identifiers and photo bytes are not put in a query string, server action, upload or analytics event by this feature.
- New collections are empty. Synthetic QA records are created only in isolated test browser contexts. No seed/demo mode is exposed in the actual app.
- Revision checks reject stale edits; duplicate records and import IDs are skipped/rejected without overwriting. Restore is atomic and abortable. Cancel after asynchronous preview is checked before showing a pending import. Storage failures retain inputs and do not claim success.
- Source photos: JPG/PNG/WebP, at most 5 MB and 20 million pixels; normalized on-device to a maximum 1600-pixel edge and 2 MB. Standard image-element decoding and PNG encoding fallback are supported. HEIC is rejected with localized JPG/PNG guidance while retaining an existing photo.
- Private photos use native browser `img` with a locally created blob URL, revoked on cleanup. This avoids the image wrapper's generated placeholder `srcset` and server optimization. Only the public concept illustration uses unoptimized Next Image.
- Limits retained from the MVP: 300 records, 16 MB total stored photos, 32 MB JSON backup. Backup validation checks schema/version, image headers, dimensions and SHA-256 before import.
- Device storage is not durable cloud storage: browser reset, private mode, a different device or a different origin may lose or separate records. The UI asks users to keep a JSON backup. Download creation is reported without claiming that a file picker or durable save was confirmed.

## Appearance and asset provenance

The page reuses KORETAIL's existing shared safe-area header classes, locale font stacks and type/weight tokens. Styles are scoped. All copy is supplied for Korean, English, Simplified Chinese and Japanese; no record text or locale labels are baked into the image.

Default illustration is design A, the previously completed actual Blender departure scene. The user has not selected A/B/C; this is the delegated recommended default. `travelConcept` in `app/travel-records-copy.ts` is the replacement point.

`public/visuals/travel-records/v1/departure.webp`: 960 × 720, 25,566 bytes, SHA-256 `2e99e0d0920b1ae5b7abef26158d460295a4cd089332e559006ba6c11ae75164`. Original verified Library file: `libfile_26961b86ed1c81918afc04b05e56ef3c`; design archive: `libfile_c68b0a0f919c8191adcd6c6765ef1f12`. The `.blend` files and rerunnable Blender scripts remain preserved separately in `travel_airport_alternatives_v1`, outside this application repository. The illustration is labelled as a concept image, not a real trip photograph or navigation map.

## Local validation

Executed in Windows with the actual installed Node/Vite application and installed Chrome. POSIX wrapper scripts were not altered; their underlying tools were called directly. Existing successful checks were reused where unchanged, as the owner requested.

| Check | Evidence |
| --- | --- |
| Full ESLint | Exit 0; seven pre-existing image warnings, no new warnings. Final changed media/test files also pass targeted lint. |
| TypeScript `tsc --noEmit` | Exit 0, including the final native photo change and new E2E source. |
| Full unit suite | 1,160/1,160 pass, including nine travel storage/backup tests, font coverage and Owner UI Lock. Pure modules were unchanged after this run. |
| `vinext build` | Exit 0; `/:locale/travel-records` present in the built route table. Final photo rendering change is included in the updated build. |
| Rendered HTML suite | 42/42 pass. The later native photo change affects the private client-only photo branch; these unchanged server assertions were not repeated. |
| New travel E2E | All 27 distinct cases pass across initial run plus targeted corrections. Initial failures: entry click before hydration and actual private photo display. Entry now waits for hydration; native photo fix passes loaded-image, retention and privacy assertions. No full repeat of the 25 passing cases. |
| Existing departure preparation E2E | 16/16 pass: four locales × 320/390/430/1280 px; no overflow or missing font glyphs. |
| Secret scan | Exit 0 on working tree and the reachable history in this shallow checkout. This is not a claim to have rescanned the complete repository history. |
| Operational health | Harness PASS; actual system UNKNOWN without production credentials. Runtime LLM calls 0 verified. |
| Visual review | Actual 390 px empty screen reviewed; final saved-photo screen captured in a fresh synthetic-only context. |

The new E2E suite covers empty/noindex/overflow states, the existing keyboard entry, add/edit/reopen/reload/localization, private photo display, invalid and HEIC replacement retention, fallback decoder/encoder, quota and storage denial, backup preview/cancel/duplicate/tamper handling, fresh-context restore, read cancellation, Escape, stale revision and unsaved-navigation cancellation. `e2e/travel-records.spec.ts` runs with the repository's standard Chromium configuration in CI. A Windows-only local configuration and screenshots are kept outside the repository under `koretail_travel_integration_v1/checks`.

## Remaining release limits and handoff

Actual iPhone/Safari and real iPhone file picker/HEIC behaviour remain unverified. Mobile viewport emulation and the standard decoder fallback do not establish actual iPhone compatibility. HEIC import is intentionally unsupported. Do not publicly release before the coordinator obtains the required device verification.

The coordinator separately owns the current main security dependency fixes. This branch does not duplicate or weaken that work. Those updates and final required CI must be considered when integrating. Merge and deployment are reserved to coordinator thread `01a101be-fb83-73e3-bd7e-8bf81904100c`; this worker only supplies a reviewable PR and does not merge or deploy.
