---
"x402-solana": minor
---

Add optional `beforePayment` hook to the client. It runs after a 402 response is parsed and a payment requirement is selected, before the payment transaction is built and signed. Return `{ abort: true, reason }` to refuse the payment - the wallet's `signTransaction` is never invoked and the wrapped fetch throws. Enables drop-in payment policy such as spend rules, allow/deny lists, velocity caps, or a seller reputation preflight. An unhandled throw inside the hook aborts the payment (fail-closed). See the README and `examples/before-payment-guard.mjs`.
