import type { PaymentRequirements, PaymentRequired } from "@payai/x402/types";
import { safeBase64Decode } from "@payai/x402/utils";
import type {
  BeforePaymentCreationHook,
  HookFailurePolicy,
  PaymentInterceptorConfig,
} from "../types";
import type { WalletAdapter } from "../types";
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

type PaymentFetch = (
  input: RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

function buildPaymentFetch(config: {
  fetchFn: typeof fetch;
  wallet: WalletAdapter;
  rpcUrl: string;
  maxValue: bigint;
  verbose: boolean;
  beforePaymentCreation?: BeforePaymentCreationHook;
  hookFailurePolicy: HookFailurePolicy;
}): PaymentFetch {
  const {
    fetchFn,
    wallet,
    rpcUrl,
    maxValue,
    verbose,
    beforePaymentCreation,
    hookFailurePolicy,
  } = config;

  const log = (...args: unknown[]) => {
    if (verbose) console.log("[x402-solana]", ...args);
  };

  return async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.url;
    log("Making initial request to:", url);

    const response = await fetchFn(input, init);
    log("Initial response status:", response.status);

    if (response.status !== 402) {
      return response;
    }

    log("Got 402, parsing payment requirements...");

    let paymentRequired: PaymentRequired;
    let protocolVersion: 1 | 2;

    const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");
    if (paymentRequiredHeader) {
      log("Found PAYMENT-REQUIRED header (v2 protocol)");
      paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
      protocolVersion = 2;
    } else {
      log("No PAYMENT-REQUIRED header, falling back to body (v1 protocol)");
      const rawResponse = (await response.json()) as X402ResponseV1;
      paymentRequired = rawResponse;
      protocolVersion = 1;
    }

    log("Payment requirements:", JSON.stringify(paymentRequired, null, 2));
    log("Protocol version:", protocolVersion);

    const parsedPaymentRequirements: PaymentRequirements[] =
      paymentRequired.accepts || [];

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

    const paymentAmount = BigInt(
      selectedRequirements.amount ||
        (selectedRequirements as unknown as { maxAmountRequired?: string })
          .maxAmountRequired ||
        "0",
    );

    if (maxValue > BigInt(0) && paymentAmount > maxValue) {
      throw new Error("Payment amount exceeds maximum allowed");
    }

    const resourceUrl = typeof input === "string" ? input : input.url;

    if (beforePaymentCreation) {
      let hookResult;
      try {
        hookResult = await beforePaymentCreation({
          selectedRequirements,
          resourceUrl,
          protocolVersion,
        });
      } catch (err) {
        if (hookFailurePolicy === "fail-closed") {
          throw err;
        }
        log(
          "beforePaymentCreation hook threw (fail-open), proceeding:",
          err instanceof Error ? err.message : err,
        );
      }

      if (hookResult && "abort" in hookResult && hookResult.abort === true) {
        throw new Error(
          hookResult.reason ?? "Payment blocked by beforePaymentCreation hook",
        );
      }
    }

    log("Creating signed transaction...");

    const signedTransaction = await createSolanaPaymentTransaction(
      wallet,
      selectedRequirements,
      rpcUrl,
    );
    log("Transaction signed successfully");

    let paymentHeader: string;
    let headerName: string;

    if (protocolVersion === 2) {
      paymentHeader = createPaymentPayload(
        signedTransaction,
        selectedRequirements,
        resourceUrl,
      );
      headerName = "PAYMENT-SIGNATURE";
    } else {
      paymentHeader = createPaymentPayloadV1(
        signedTransaction,
        selectedRequirements,
      );
      headerName = "X-PAYMENT";
    }

    log("Payment header created, length:", paymentHeader.length);
    log("Using header:", headerName);

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

/**
 * Create a payment interceptor with optional beforePaymentCreation hook.
 */
export function createPaymentInterceptor(
  config: PaymentInterceptorConfig,
): PaymentFetch {
  const built: Parameters<typeof buildPaymentFetch>[0] = {
    fetchFn: config.fetch,
    wallet: config.wallet,
    rpcUrl: config.rpcUrl,
    maxValue: config.maxValue ?? BigInt(0),
    verbose: config.verbose ?? false,
    hookFailurePolicy: config.hookFailurePolicy ?? "fail-open",
  };
  if (config.beforePaymentCreation) {
    built.beforePaymentCreation = config.beforePaymentCreation;
  }
  return buildPaymentFetch(built);
}

/**
 * Create a custom fetch function that automatically handles x402 payments (v2)
 */
export function createPaymentFetch(
  fetchFn: typeof fetch,
  wallet: WalletAdapter,
  rpcUrl: string,
  maxValue: bigint = BigInt(0),
  verbose: boolean = false,
  options?: Pick<
    PaymentInterceptorConfig,
    "beforePaymentCreation" | "hookFailurePolicy"
  >,
): PaymentFetch {
  const interceptorConfig: PaymentInterceptorConfig = {
    fetch: fetchFn,
    wallet,
    rpcUrl,
    maxValue,
    verbose,
  };
  if (options?.beforePaymentCreation) {
    interceptorConfig.beforePaymentCreation = options.beforePaymentCreation;
  }
  if (options?.hookFailurePolicy) {
    interceptorConfig.hookFailurePolicy = options.hookFailurePolicy;
  }
  return createPaymentInterceptor(interceptorConfig);
}

export type {
  BeforePaymentCreationContext,
  BeforePaymentCreationHook,
  BeforePaymentCreationResult,
  HookFailurePolicy,
} from "../types/before-payment";