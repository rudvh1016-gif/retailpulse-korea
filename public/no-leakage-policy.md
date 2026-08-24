# RetailPulse Korea — No-Leakage Policy

Three clocks are mandatory: `eventTime` (when it happened), `availableTime` (when the source published it), and `ingestionTime` (when RPK collected it). A forecast may use a record only when its available time is no later than the forecast data cutoff.

Prohibited:

- using D-4 actuals as same-day knowledge;
- using a final month value before publication;
- using a later-revised value as if it were the first release;
- editing a forecast after the actual arrives;
- relabelling backfill as prospective;
- tuning and reporting on the same evaluation window;
- using an official forecast as a feature and also claiming it as an independent baseline;
- comparing different targets or grains as accuracy competition.

Backtests must reconstruct source availability and keep train, validation and final report windows separate. Promotion requires forward shadow evidence, not historical fit alone.
