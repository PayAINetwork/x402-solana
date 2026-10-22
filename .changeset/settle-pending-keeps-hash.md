---
"x402-solana": patch
---

fix(server): keep the facilitator's errorReason and transaction hash when /settle returns non-2xx, so `settlement_pending` can be reconciled instead of re-challenging the buyer. Adds `isSettlementPending`, `SETTLEMENT_PENDING` and `PendingSettleResponse`.
