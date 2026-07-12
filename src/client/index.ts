import type { X402ClientConfig } from "../types";
import { getDefaultRpcUrl } from "../utils";
import { createPaymentInterceptor } from "./payment-interceptor";

/**
 * x402 Solana Client (v2)
 * Handles automatic payment for x402-protected endpoints
 */
export class X402Client {
  private paymentFetch: ReturnType<typeof createPaymentInterceptor>;

  constructor(config: X402ClientConfig) {
    const rpcUrl = config.rpcUrl || getDefaultRpcUrl(config.network);
    const fetchFn = config.customFetch || globalThis.fetch.bind(globalThis);

    const interceptorConfig = {
      fetch: fetchFn,
      wallet: config.wallet,
      rpcUrl,
      maxValue: config.amount || BigInt(0),
      verbose: config.verbose || false,
      ...(config.beforePaymentCreation
        ? { beforePaymentCreation: config.beforePaymentCreation }
        : {}),
      ...(config.hookFailurePolicy
        ? { hookFailurePolicy: config.hookFailurePolicy }
        : {}),
    };
    this.paymentFetch = createPaymentInterceptor(interceptorConfig);
  }

  /**
   * Make a fetch request with automatic x402 payment handling.
   */
  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    return this.paymentFetch(input, init);
  }
}

/**
 * Create an x402 client instance
 */
export function createX402Client(config: X402ClientConfig): X402Client {
  return new X402Client(config);
}

export {
  createPaymentFetch,
  createPaymentInterceptor,
  type BeforePaymentCreationContext,
  type BeforePaymentCreationHook,
  type BeforePaymentCreationResult,
  type HookFailurePolicy,
} from "./payment-interceptor";

export type {
  X402ClientConfig,
  WalletAdapter,
  PaymentInterceptorConfig,
} from "../types";