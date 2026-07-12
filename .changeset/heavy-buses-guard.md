---
"x402-solana": minor
---

Add optional `beforePayment` hook to the client. It runs after a 402 response is parsed and a payment requirement is selected, before the payment transaction is built and signed. Return `{ abort: true, reason }` to refuse the payment - the wallet's `signTransaction` is never invoked and the wrapped fetch throws. Enables drop-in payment policy such as spend rules, allow/deny lists, or a seller trust preflight (see the twzrd-x402-gate example in the README and `examples/twzrd-guard.mjs`).
