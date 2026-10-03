# App release readiness — 2026-10-03

This is a readiness record, not a native app release. No store submission, payment, account creation, signing credential or tracking SDK was added.

- Existing web app: manifest, icons, installation guide, device-local settings and sharing are implemented. Installation still requires network access for data; observation, official forecast and historical-statistic timestamps remain distinct.
- Native app work is not started: no Capacitor/native project or service worker. Current rendering and data access depend on SSR/Worker/D1. A wrapper alone would not establish production readiness.
- Before native implementation: define the client entry and API base, then validate CORS, CSP, routing and deep links. `server.url` in Capacitor is for development and must not become an unreviewed production shortcut.
- Device verification remains required: real iOS/Android sharing, back navigation, setting persistence, installation removal and network failure. Desktop Chromium emulation does not prove these.
- Privacy/support blockers: confirm actual device storage, conditional analytics and optional email collection; obtain owner-approved operator contact and retention policy. Privacy/support routes are not currently defined. Do not publish a guessed policy or personal email address.
- Owner stages: developer accounts, terms, identity, fees, signing credentials and store submission. Recheck the current store requirements and fees immediately before submission; this task does not authorize payment.

Official references: [Capacitor getting started](https://capacitorjs.com/docs/getting-started), [configuration](https://capacitorjs.com/docs/config), [Apple minimum functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality), [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Google Play account requirements](https://support.google.com/googleplay/android-developer/answer/10144311).
