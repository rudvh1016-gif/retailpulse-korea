# Departure-hall observation status

The public summary projects the already-read A4 observation and source-health rows without additional SQL or provider calls. `collectionStatus` is LIVE only when the terminal's health is LIVE and the observation, retrieval and health clocks are valid and non-future, and the observation is no more than 20 minutes old at summary generation. Source failures retain the last observation as FAILED, and unknown health or future/invalid clocks remain UNKNOWN. Raw counts, times, source dates and persisted health are unchanged. Only LIVE rows can supply the summary's current busiest checkpoint.

The browser also evaluates age against its presentation clock (updated once a minute without fetching). Past and failed values remain visible with explicit text and neutral color; future/unverified readings are withheld from the prominent numeric display while their original evidence remains available in the source disclosure. None supplies a longest-current highlight or people animation. Public response status describes its `generatedAt` snapshot; cached delivery is not a new observation.

Counts describe departure-hall queues, while time combines the hall, security and immigration and includes estimates. These measures must not be derived from each other. Existing source links and terminal observation clocks are retained. Official airport reference: https://www.airport.kr/ap_ko/6651/subview.do ; API contracts are linked by `lib/airport-checkpoint-layout.ts`.

## Collection and free-operation review

No collection interval, scheduler, retry, cache or account setting changes are included. The authoritative Worker cron remains `7,22,37,52 * * * *`, or 96 cycles/day. The existing realtime workflow documents about one normal request per terminal per cycle, with separate T1/T2 services. It also collects four Seoul areas in the same group. Changing this entire group to five minutes would mean 288 cycles/day and approximately three times the normal requests and stored observations, including Seoul; these are scenarios, not actual account usage. Retries and pagination add to normal requests.

The workflow records a T1 development allowance of 1,000/day, but the currently approved account quotas for both services and authenticated D1 usage have not been verified here. Neither the current D1 utilization nor a safe five-minute budget can be inferred from this repository. Keep the existing interval until authenticated service limits, retry bounds, storage and read/write usage have been checked.

## Protection scope

Three exact reversible API-source exceptions cover the new pure projection import, the current-busiest input and the returned congestion array. Reversing those pairs must reproduce the existing canonical protected file byte-for-byte. Protected hashes, cron checks and other source invariants remain active. No operational records are manually changed.
