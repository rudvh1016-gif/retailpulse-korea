# Zero-Cost Runtime Policy

RetailPulse Korea targets zero paid runtime API, data and LLM cost beyond a separately approved domain.

- Paid API: prohibited.
- Paid data: prohibited.
- Runtime OpenAI/Anthropic/Gemini/Workers AI: prohibited.
- Automatic paid overage: prohibited.
- Paid fallback: prohibited.
- Free trial requiring later payment: prohibited.

On the Workers/D1 Free plan, usage caps should fail closed rather than bill automatically. D1 free-limit exhaustion returns errors until reset; collectors then reduce frequency or enter degraded mode. The initial data model stores normalized features and hashes, not unlimited raw payloads.

Quota response: 80% warning, 90% reduce noncritical frequency, 95% stop nonessential collection, 100% serve cached/official historical data with DEGRADED status. Enabling a paid Cloudflare plan requires a separate explicit user decision.
