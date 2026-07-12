/**
 * TWZRD beforePaymentCreation adapter for x402-solana.
 *
 * Insertion point (owned by payment-interceptor):
 *   initial request -> 402 -> select requirement -> TWZRD hook -> sign -> retry
 *
 * Install: npm install x402-solana twzrd-x402-gate@0.5.3
 */

import type { BeforePaymentCreationHook } from "../src/client/payment-interceptor";

export type TwzrdBeforePaymentOptions = {
  gateOnCanSpend?: boolean;
  /** Alias: refuseWash */
  refuseWashFlagged?: boolean;
  refuseWash?: boolean;
  failOpen?: boolean;
  intelBase?: string;
  onDecision?: (detail: {
    approved: boolean;
    reason: string;
    verdict: string;
    payTo?: string;
  }) => void;
};

/**
 * Returns a PayAI beforePaymentCreation hook backed by twzrd-x402-gate@0.5.3.
 *
 * Default: decision-only (`gateOnCanSpend: false`) + wash refuse (`refuseWashFlagged: true`).
 */
export function installTwzrdBeforePaymentHook(
  options: TwzrdBeforePaymentOptions = {},
): BeforePaymentCreationHook {
  return async (context) => {
    const { twzrdBeforePaymentCreation } = await import("twzrd-x402-gate");
    const result = await twzrdBeforePaymentCreation(
      context.selectedRequirements,
      {
        gateOnCanSpend: options.gateOnCanSpend ?? false,
        refuseWashFlagged:
          options.refuseWashFlagged ?? options.refuseWash ?? true,
        failOpen: options.failOpen ?? false,
        intelBase: options.intelBase,
        onDecision: options.onDecision,
      },
    );

    if (result && "abort" in result && result.abort) {
      options.onDecision?.({
        approved: false,
        reason: result.reason,
        verdict: "block",
        payTo: context.selectedRequirements.payTo,
      });
    }

    return result;
  };
}

/** README alias — same hook factory for PayAI beforePaymentCreation. */
export const installTwzrdX402ClientHook = installTwzrdBeforePaymentHook;