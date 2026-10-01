import type { PaymentRequirements } from "@x402/core/types";

/** Largest value an SPL Token u64 amount field can hold. */
const U64_MAX = BigInt("18446744073709551615");

/**
 * Read and strictly validate the payment amount from payment requirements.
 *
 * v2 uses `amount`; legacy v1 uses `maxAmountRequired`. The value must be a
 * plain base-10 string of ASCII digits that parses to an integer in
 * (0, u64::MAX]. Anything else (negative, zero, hex, whitespace, decimals,
 * out-of-range) is rejected before it can reach a cap check or a signer:
 * `BigInt()` alone accepts several of those forms, and SPL Token's u64
 * encoder silently turns negative or oversized values into a different
 * positive amount.
 */
export function getValidatedPaymentAmount(
  requirements: PaymentRequirements,
): bigint {
  const raw =
    requirements.amount ||
    (requirements as unknown as { maxAmountRequired?: unknown })
      .maxAmountRequired;

  if (raw === undefined || raw === null || raw === "") {
    throw new Error("Missing amount in payment requirements");
  }
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) {
    throw new Error(
      "Invalid amount in payment requirements: expected a positive integer string in atomic units",
    );
  }

  const amount = BigInt(raw);
  if (amount <= BigInt(0) || amount > U64_MAX) {
    throw new Error(
      "Invalid amount in payment requirements: must be greater than 0 and fit in a u64",
    );
  }
  return amount;
}
