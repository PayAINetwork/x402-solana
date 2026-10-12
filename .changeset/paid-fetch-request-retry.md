---
"x402-solana": patch
---

Preserve Request bodies and all HeadersInit forms during v1/v2 payment retries,
replace existing payment headers case-insensitively, and accept URL inputs.
Cancel unused Request clones and reject non-replayable init.body streams before
wallet signing after a 402. Preserve plain-object header casing for custom fetch
adapters and document the body replay limitations.
Validate retry headers before requesting a wallet signature, using native
Headers semantics for custom fetch adapters as well.
