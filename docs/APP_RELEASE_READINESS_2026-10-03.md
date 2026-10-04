# App release readiness — 2026-10-03

This is a readiness record, not a native app release. No store submission, payment, account creation, signing credential or tracking SDK was added.

## Read-only verification on 2026-10-04

- Repository inventory has no Android project, gradle/AndroidManifest, APK/AAB, signing keystore or Digital Asset Links file.
- The public manifest returns 200 `application/manifest+json` with standalone mode, scope `/`, start URL `/ko`, 192/512 and maskable icons. There is no service worker registration or offline shell in source.
- Actual public `/ko/privacy`, `/privacy`, `/ko/support`, `/support` and `/.well-known/assetlinks.json` each returned 404. No operator support address was established; none was invented.
- Desktop Chromium viewport emulation has been exercised; no real Android device or signed Android build has been tested.
- A Trusted Web Activity wrapper is the smallest technical path that preserves the existing HTTPS SSR/API origin. It still requires a native build, signing and verified Digital Asset Links before it is a release candidate; failed origin verification falls back to a Custom Tab. Network failure/stale-data messages exist in the web UI, but they are not an offline installed shell. No wrapper or account setup was started.

Technical basis: [Chrome TWA quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start). Current Play policy, account eligibility and submission requirements are being reviewed independently; this record only reports inspected project/web facts.

## Passenger tax refund follow-up: prepared, awaiting official facts

`lib/airport-tax-refund-guide.ts` defines the narrow T1/T2 guide shape and an empty dataset. No location, hours or eligibility claim has been published. The compact section belongs in passenger airport guidance alongside stores/facilities, after choosing a terminal; it should keep its own terminal selector when opened from all mode. Search keys will cover verified terminal, process and location. Customs export confirmation and refund collection have different records; checked/carry-on baggage and pre/post-security steps remain separate. Every claim retains its official URL, source update date (nullable when undisclosed), and actual verification timestamp. Blender imagery is a conceptual process visual, not an official-coordinate overlay. This preparation adds no visible empty UI, account workflow or refund transaction feature.

- Existing web app: manifest, icons, installation guide, device-local settings and sharing are implemented. Installation still requires network access for data; observation, official forecast and historical-statistic timestamps remain distinct.
- Native app work is not started: no Capacitor/native project or service worker. Current rendering and data access depend on SSR/Worker/D1. A wrapper alone would not establish production readiness.
- Before native implementation: define the client entry and API base, then validate CORS, CSP, routing and deep links. `server.url` in Capacitor is for development and must not become an unreviewed production shortcut.
- Device verification remains required: real iOS/Android sharing, back navigation, setting persistence, installation removal and network failure. Desktop Chromium emulation does not prove these.
- Privacy/support blockers: confirm actual device storage, conditional analytics and optional email collection; obtain owner-approved operator contact and retention policy. Privacy/support routes are not currently defined. Do not publish a guessed policy or personal email address.
- Owner stages: developer accounts, terms, identity, fees, signing credentials and store submission. Recheck the current store requirements and fees immediately before submission; this task does not authorize payment.

Official references: [Capacitor getting started](https://capacitorjs.com/docs/getting-started), [configuration](https://capacitorjs.com/docs/config), [Apple minimum functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality), [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Google Play account requirements](https://support.google.com/googleplay/android-developer/answer/10144311).
