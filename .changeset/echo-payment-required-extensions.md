---
"x402-solana": patch
---

v2 client now echoes the 402 response's `extensions` and `resource` object into the payment payload, as required by the x402 v2 specification. Without the echo, facilitators never received Bazaar discovery declarations, so resources paid through this client were never catalogued (#40, #36). `createPaymentPayload` gains an optional fourth parameter carrying the parsed `PaymentRequired`; existing three-argument callers keep the previous behavior.
