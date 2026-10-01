---
"x402-solana": patch
---

Strictly validate the payment amount from a 402 response before the `amount` limit check, the `beforePayment` hook, or signing. The client now refuses any `amount` / `maxAmountRequired` that is not a positive base-10 integer string fitting in a u64 (for example negative, zero, hex, whitespace-padded, decimal, or oversized values). Previously some malformed values could pass the configured `amount` limit and be encoded as a different transfer amount. Numeric (non-string) amounts, which the x402 spec does not allow, are now refused too. The `beforePayment` hook always sees the validated amount, in both `amount` and (when present) `maxAmountRequired`. A negative or non-bigint client `amount` limit now throws instead of acting as "no limit".
