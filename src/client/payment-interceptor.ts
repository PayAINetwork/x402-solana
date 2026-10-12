import type { PaymentRequirements, PaymentRequired } from "@x402/core/types";
import { safeBase64Decode } from "@x402/core/utils";
import type {
  BeforePaymentContext,
  BeforePaymentHook,
  BeforePaymentRequirements,
  WalletAdapter,
} from "../types";
import { isSolanaNetwork } from "../types";
import { createSolanaPaymentTransaction } from "./transaction-builder";
import { getValidatedPaymentAmount } from "./payment-amount";
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

function isRequest(input: RequestInfo | URL): input is Request {
  return (
    typeof input !== "string" &&
    "clone" in input &&
    typeof input.clone === "function"
  );
}

function getRequestSignal(
  input: RequestInfo | URL,
  init?: RequestInit,
): AbortSignal | undefined {
  return init?.signal ?? (isRequest(input) ? input.signal : undefined);
}

function createBeforePaymentSnapshot(
  requirements: PaymentRequirements,
  amount: bigint,
): BeforePaymentRequirements {
  const snapshot = structuredClone(requirements) as Omit<
    PaymentRequirements,
    "amount"
  > & {
    maxAmountRequired?: string;
  };
  // Expose only the validated amount that will actually be signed, including
  // in the legacy field so policy code cannot read a different raw value.
  const validatedAmount = amount.toString();
  return {
    ...snapshot,
    amount: validatedAmount,
    ...(snapshot.maxAmountRequired === undefined
      ? {}
      : { maxAmountRequired: validatedAmount }),
  };
}

/**
 * Create a custom fetch function that automatically handles x402 payments (v2)
 *
 * @param fetchFn - Base fetch function to use
 * @param wallet - Wallet adapter for signing transactions
 * @param rpcUrl - Solana RPC URL
 * @param maxValue - Maximum payment amount in atomic units. 0 (the default) means
 *   no limit; negative values are rejected.
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

  if (typeof maxValue !== "bigint" || maxValue < BigInt(0)) {
    throw new Error("maxValue must be 0 (no limit) or a positive amount");
  }

  const fetchWithPayment = async (
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    retryInput: RequestInfo | URL,
  ): Promise<Response> => {
    const requestUrl = isRequest(input) ? input.url : input.toString();
    const signal = getRequestSignal(input, init);
    signal?.throwIfAborted();
    log("Making initial request to:", requestUrl);

    // Make initial request
    const response = await fetchFn(input, init);
    signal?.throwIfAborted();
    log("Initial response status:", response.status);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // A one-shot body in init cannot be resent. Reject before wallet signing;
    // streams wrapped in a Request can be replayed using the retained clone.
    if (
      typeof ReadableStream !== "undefined" &&
      init?.body instanceof ReadableStream
    ) {
      throw new TypeError(
        "Cannot retry a ReadableStream passed as init.body. Pass a Request or a replayable body instead.",
      );
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
    const matchedRequirements = parsedPaymentRequirements.find(
      (req: PaymentRequirements) =>
        req.scheme === "exact" && isSolanaNetwork(req.network),
    );

    if (!matchedRequirements) {
      console.error(
        "❌ No suitable Solana payment requirements found. Available networks:",
        parsedPaymentRequirements.map((req) => req.network),
      );
      throw new Error("No suitable Solana payment requirements found");
    }

    // Work on a private copy so the requirements that are validated and
    // capped are exactly the ones that get built, signed, and echoed.
    const selectedRequirements = structuredClone(matchedRequirements);

    // Validate the amount strictly before any cap check or signing.
    // v2 uses `amount`, but we also support legacy `maxAmountRequired` for backwards compatibility
    const paymentAmount = getValidatedPaymentAmount(selectedRequirements);

    // Check amount against max value if specified

    if (maxValue > BigInt(0) && paymentAmount > maxValue) {
      throw new Error("Payment amount exceeds maximum allowed");
    }

    // Run the beforePayment hook (if configured) BEFORE building/signing.
    // Give policy code a detached snapshot so it cannot mutate the canonical
    // requirements used to build the transaction and payment payload.
    if (beforePayment) {
      log("Running beforePayment hook...");
      signal?.throwIfAborted();
      const context: BeforePaymentContext = {
        requestUrl,
        responseUrl: response.url || requestUrl,
        protocolVersion,
        ...(paymentRequired.resource === undefined
          ? {}
          : { declaredResource: paymentRequired.resource }),
        ...(signal === undefined ? {} : { signal }),
      };
      const decision = await beforePayment(
        createBeforePaymentSnapshot(selectedRequirements, paymentAmount),
        context,
      );
      signal?.throwIfAborted();
      if (decision && decision.abort === true) {
        const reason = decision.reason || "beforePayment hook aborted payment";
        log("Payment aborted by beforePayment hook:", reason);
        throw new Error(`Payment aborted by beforePayment hook: ${reason}`);
      }
      log("beforePayment hook approved, continuing...");
    }

    // Validate retry headers before asking the wallet to sign. init.headers
    // replaces Request headers, matching native fetch semantics.
    const originalHeaders =
      init?.headers ?? (isRequest(input) ? input.headers : undefined);
    const retryHeaders = new Headers(originalHeaders);
    // Preserve plain-object key casing for existing customFetch adapters.
    const originalNames = new Map(
      Object.keys(originalHeaders ?? {}).map(
        (name) => [name.toLowerCase(), name] as const,
      ),
    );

    log("Creating signed transaction...");
    signal?.throwIfAborted();

    // Create signed transaction
    const signedTransaction = await createSolanaPaymentTransaction(
      wallet,
      selectedRequirements,
      rpcUrl,
      signal,
    );
    signal?.throwIfAborted();
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
        requestUrl,
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
    // Remove any existing spelling before adding the new payment header.
    retryHeaders.delete(headerName);
    const headerEntries: [string, string][] = [[headerName, paymentHeader]];
    retryHeaders.forEach((value, name) => {
      headerEntries.push([originalNames.get(name) ?? name, value]);
    });
    const newInit = {
      ...init,
      headers: Object.fromEntries(headerEntries),
    };

    log(`Retrying request with ${headerName} header...`);
    signal?.throwIfAborted();
    const retryResponse = await fetchFn(retryInput, newInit);
    log("Retry response status:", retryResponse.status);

    return retryResponse;
  };

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    getRequestSignal(input, init)?.throwIfAborted();
    // Native fetch consumes a Request's body. Keep a copy before sending it,
    // unless init.body replaces that body or there is no body to consume.
    const retryInput =
      isRequest(input) && input.body !== null && init?.body == null
        ? input.clone()
        : input;
    try {
      return await fetchWithPayment(input, init, retryInput);
    } finally {
      // Drop the unread branch on non-402, policy rejection and other errors.
      // Do not await tee cancellation: its promise can wait for the other body.
      if (
        isRequest(retryInput) &&
        retryInput !== input &&
        !retryInput.bodyUsed
      ) {
        void retryInput.body?.cancel().catch(() => {});
      }
    }
  };
}
