# Airport glance — incomplete artwork preview

This isolated preview route is not linked from the production home. It preserves the earlier implementation for review, with an explicitly empty approved-artwork slot. It is not the final airport design and must not be merged or deployed before artwork integration and owner review.

Latest requested artwork: `libfile_59815a4d20bc8191abc8b10d52ef2e49`, 1448x1086, latest resolved file `file_00000000ca408206920caee591390fae`. Metadata was resolved, but actual pixels remain unavailable. The supported Library transfer helper requires unavailable native-Windows os.setxattr; the helper was not patched and provenance handling was not bypassed. No authenticated browser-control connector is available; an unauthenticated standard download endpoint did not yield the file. Older artwork was not substituted. The earlier approval record is historical; this paragraph identifies the latest resolved file.

## Actual partial captures

- [Desktop 1440px](screenshots/airport-glance-partial-20261012/glance-partial-recorded-1440.png)
- [Mobile 390px](screenshots/airport-glance-partial-20261012/glance-partial-recorded-390.png)

These captures use retained public API snapshots from 2026-10-11T14:34:54.058Z with the clock fixed to that source time. They show 576 scheduled physical departures, 8 at the current hour, and T1 main 161 / concourse 146 / T2 269. Those are API values, not production constants. Building zone shares use the entire building denominator, including unknown locations. Flights are not people, queue measurements or certified actual operations. The country table keeps the existing included-date daily means and excludes zero/missing previous baselines. Official coordinates remain separate from the conceptual drawing.

## Verification and remaining work

TypeScript passed. Two glance unit tests and ten browser tests passed again on October 12: 360/390/430/1440px, date and terminal selection, keyboard controls, failed requests, unavailable dates, Chinese/Japanese labels and reduced motion. UI-lock passed unchanged. Scoped ESLint has no errors and one existing pending-static-image warning. Native vinext build passed. No new dependency, request type, data collector or storage write was introduced.

Still required: supported materialization and pixel inspection of the latest artwork, responsive image generation and connection, final PC/mobile visual review and same-condition performance comparison. No performance improvement or final visual match is claimed. The Library upload connection also remains unavailable, so these review images have no Library IDs. CI status and final rendered checks are recorded in the draft PR.
