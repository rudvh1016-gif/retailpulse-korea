# RetailPulse Korea — Zero-Cost Runtime Policy

RetailPulse Production targets **0 KRW in API, data and runtime-LLM charges beyond the separately approved domain cost**.

Prohibited: paid APIs, paid data, pay-as-you-go, free trials that can become paid, automatic overage billing, credit packages, paid fallback, and runtime OpenAI/Anthropic/Gemini calls.

Allowed only after terms verification: official free APIs/files, free-tier GitHub Actions, Cloudflare free storage/Worker/Pages, deterministic templates and local/offline model training.

When a quota nears its limit, the system must not buy capacity automatically. It increases cache TTL, reduces refresh frequency, drops noncritical collectors, or enters degraded mode. Each collector defines calls/day, interval, cache TTL, timeout, retry cap, exponential backoff and a quota reserve.

Secrets live only in GitHub/Cloudflare secret stores. They never enter frontend JavaScript, HTML, public Git history or client logs.
