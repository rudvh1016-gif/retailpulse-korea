# Demand and airport UX implementation plan

1. Add failing contract tests for demo score bands and airport physical-flight pressure rules.
2. Implement the pure demand-index and airport-pressure modules.
3. Make comparison and detail views explicitly sample-only; remove fake history and duplicate explanations.
4. Replace live-looking airport demo claims with a localized unavailable/readiness state.
5. Clarify that official S1/S3 signals are separate and do not currently calculate the sample index.
6. Add rendered/E2E coverage for truth labels, four locales, disclosures and 390px overflow.
7. Run safety, static, unit, rendered, build and browser tests, then review desktop/mobile visuals.
8. Commit, push, open PR, wait for green CI, merge, deploy using the existing production workflow and smoke-test production.
