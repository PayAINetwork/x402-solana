import type { PaymentRequirements, PaymentRequired } from "@payai/x402/types";
import { safeBase64Decode } from "@payai/x402/utils";
import type { BeforePaymentHook, WalletAdapter } from "../types";
import { isSolanaNetwork } from "../types";
import { createSolanaPaymentTransaction } from "./transaction-builder";
import { createPaymentPayload, createPaymentPayloadV1 } from "../utils";

/**
 * x402 Response structure (v1 body format)
 */
interface X402ResponseV1 extends PaymentRequired {
  accepts: PaymentRequirements[];
}

/**
 * Decode a base64-encoded PAYMENT-REQUIRED header
 */
function decodePaymentRequiredHeader(header: string): PaymentRequired {
  const decoded = safeBase64Decode(header);
  return JSON.parse(decoded) as PaymentRequired;
}

/**
 * Create a custom fetch function that automatically handles x402 payments (v2)
 *
 * @param fetchFn - Base fetch function to use
 * @param wallet - Wallet adapter for signing transactions
 * @param rpcUrl - Solana RPC URL
 * @param maxValue - Maximum payment amount in atomic units (0 = no limit)
 * @param verbose - Enable verbose logging (default: false)
 * @param beforePayment - Optional hook run after requirement selection, before signing
 * @returns Wrapped fetch function with automatic payment handling
 */
export function createPaymentFetch(
  fetchFn: typeof fetch,
  wallet: WalletAdapter,
  rpcUrl: string,
  maxValue: bigint = BigInt(0),
  verbose: boolean = false,
  beforePayment?: BeforePaymentHook,
) {
  const log = (...args: unknown[]) => {
    if (verbose) console.log("[x402-solana]", ...args);
  };

  return async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.url;
    log("Making initial request to:", url);

    // Make initial request
    const response = await fetchFn(input, init);
    log("Initial response status:", response.status);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    log("Got 402, parsing payment requirements...");

    // Parse payment requirements from 402 response
    // v2: Read from PAYMENT-REQUIRED header (base64-encoded)
    // v1 fallback: Read from response body
    let paymentRequired: PaymentRequired;
    let protocolVersion: 1 | 2;

    const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");
    if (paymentRequiredHeader) {
      // v2: Decode from header
      log("Found PAYMENT-REQUIRED header (v2 protocol)");
      paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
      protocolVersion = 2;
    } else {
      // v1 fallback: Parse from body
      log("No PAYMENT-REQUIRED header, falling back to body (v1 protocol)");
      const rawResponse = (await response.json()) as X402ResponseV1;
      paymentRequired = rawResponse;
      protocolVersion = 1;
    }

    log("Payment requirements:", JSON.stringify(paymentRequired, null, 2));
    log("Protocol version:", protocolVersion);

    const parsedPaymentRequirements: PaymentRequirements[] =
      paymentRequired.accepts || [];

    // Select first suitable payment requirement for Solana
    // Supports both simple format ("solana", "solana-devnet") and CAIP-2 format ("solana:chainId")
    const selectedRequirements = parsedPaymentRequirements.find(
      (req: PaymentRequirements) =>
        req.scheme === "exact" && isSolanaNetwork(req.network),
    );

    if (!selectedRequirements) {
      console.error(
        "❌ No suitable Solana payment requirements found. Available networks:",
        parsedPaymentRequirements.map((req) => req.network),
      );
      throw new Error("No suitable Solana payment requirements found");
    }

    // Check amount against max value if specified
    // v2 uses `amount`, but we also support legacy `maxAmountRequired` for backwards compatibility
    const paymentAmount = BigInt(
      selectedRequirements.amount ||
        (selectedRequirements as unknown as { maxAmountRequired?: string })
          .maxAmountRequired ||
        "0",
    );

    if (maxValue > BigInt(0) && paymentAmount > maxValue) {
      throw new Error("Payment amount exceeds maximum allowed");
    }

    // Get the resource URL for the payment payload
    const resourceUrl = typeof input === "string" ? input : input.url;

    // Run the beforePayment hook (if configured) BEFORE building/signing.
    // An abort here guarantees the wallet's signTransaction is never called.
    if (beforePayment) {
      log("Running beforePayment hook...");
      const decision = await beforePayment(selectedRequirements, {
        resourceUrl,
        protocolVersion,
      });
      if (decision && decision.abort === true) {
        const reason = decision.reason || "beforePayment hook aborted payment";
        log("Payment aborted by beforePayment hook:", reason);
        throw new Error(`Payment aborted by beforePayment hook: ${reason}`);
      }
      log("beforePayment hook approved, continuing...");
    }

    log("Creating signed transaction...");

    // Create signed transaction
    const signedTransaction = await createSolanaPaymentTransaction(
      wallet,
      selectedRequirements,
      rpcUrl,
    );
    log("Transaction signed successfully");

    // Create payment payload based on protocol version
    let paymentHeader: string;
    let headerName: string;

    if (protocolVersion === 2) {
      // v2: Use PAYMENT-SIGNATURE header with full payload.
      // Pass the parsed 402 response so its `resource` object and declared
      // `extensions` (e.g. bazaar discovery) are echoed into the payload,
      // as the v2 spec requires.
      paymentHeader = createPaymentPayload(
        signedTransaction,
        selectedRequirements,
        resourceUrl,
        paymentRequired,
      );
      headerName = "PAYMENT-SIGNATURE";
    } else {
      // v1: Use X-PAYMENT header with simpler payload
      paymentHeader = createPaymentPayloadV1(
        signedTransaction,
        selectedRequirements,
      );
      headerName = "X-PAYMENT";
    }

    log("Payment header created, length:", paymentHeader.length);
    log("Using header:", headerName);

    // Retry with appropriate payment header
    const newInit = {
      ...init,
      headers: {
        ...(init?.headers || {}),
        [headerName]: paymentHeader,
      },
    };

    log(`Retrying request with ${headerName} header...`);
    const retryResponse = await fetchFn(input, newInit);
    log("Retry response status:", retryResponse.status);

    return retryResponse;
  };
}
