import type { PaymentRequirements } from "@payai/x402/types";

/**
 * Context passed to beforePaymentCreation after PayAI selects the exact
 * Solana requirement it intends to satisfy, and before wallet signing.
 */
export interface BeforePaymentCreationContext {
  selectedRequirements: PaymentRequirements;
  resourceUrl: string;
  protocolVersion: 1 | 2;
}

export type BeforePaymentCreationResult =
  | { abort: true; reason: string }
  | { abort?: false }
  | void;

export type BeforePaymentCreationHook = (
  context: BeforePaymentCreationContext,
) =>
  | Promise<BeforePaymentCreationResult>
  | BeforePaymentCreationResult;

/**
 * When beforePaymentCreation throws (transport/TWZRD outage), not a deliberate
 * `{ abort: true }` result:
 * - fail-open: proceed to signing (observability-first default)
 * - fail-closed: rethrow and block payment
 */
export type HookFailurePolicy = "fail-open" | "fail-closed";