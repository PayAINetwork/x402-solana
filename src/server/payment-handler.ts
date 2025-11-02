import { X402ServerConfig, PaymentRequirements, RouteConfig, SPLTokenAmount, VerifyResponse, SettleResponse } from "../types";
import { getDefaultRpcUrl, getDefaultTokenAsset } from "../utils";
import { FacilitatorClient } from "./facilitator-client";

/**
 * x402 Payment Handler for server-side payment processing
 * Framework agnostic - works with any Node.js HTTP framework
 */
interface InternalConfig {
  network: X402ServerConfig['network'];
  treasuryAddress: string;
  facilitatorUrl: string;
  rpcUrl: string;
  defaultToken: SPLTokenAmount['asset'];
  middlewareConfig?: X402ServerConfig['middlewareConfig'];
}

export class X402PaymentHandler {
  private facilitatorClient: FacilitatorClient;
  private config: InternalConfig;

  constructor(config: X402ServerConfig) {
    const defaultToken = getDefaultTokenAsset(config.network);

    this.config = {
      network: config.network,
      treasuryAddress: config.treasuryAddress,
      facilitatorUrl: config.facilitatorUrl,
      rpcUrl: config.rpcUrl || getDefaultRpcUrl(config.network),
      defaultToken: config.defaultToken || defaultToken,
      middlewareConfig: config.middlewareConfig,
    };

    this.facilitatorClient = new FacilitatorClient(config.facilitatorUrl);
  }

  /**
   * Extract payment header from request headers
   * Pass in headers object from any framework (Next.js, Express, etc.)
   */
  extractPayment(headers: Record<string, string | string[] | undefined> | Headers): string | null {
    // Handle Headers object (Next.js, Fetch API)
    if (headers instanceof Headers) {
      return headers.get("X-PAYMENT") || headers.get("x-payment");
    }

    // Handle plain object (Express, Fastify, etc.)
    const xPayment = headers["X-PAYMENT"] || headers["x-payment"];
    return Array.isArray(xPayment) ? xPayment[0] || null : xPayment || null;
  }

  /**
   * Create payment requirements object from x402 RouteConfig
   * @param routeConfig - x402 standard RouteConfig (price, network, config)
   * @param resource - Optional resource URL override (uses config.resource if not provided)
   */
  async createPaymentRequirements(
    routeConfig: RouteConfig,
    resource?: string
  ): Promise<PaymentRequirements> {
    const feePayer = await this.facilitatorClient.getFeePayer(this.config.network);

    // Extract SPLTokenAmount from price (supports Price union type)
    const price = routeConfig.price as SPLTokenAmount;

    // Merge config: routeConfig.config overrides server middlewareConfig defaults
    const config = { ...this.config.middlewareConfig, ...routeConfig.config };

    // Resource: use override if provided, otherwise use config.resource
    const finalResource = resource || config.resource;
    if (!finalResource) {
      throw new Error("resource is required: provide either as parameter or in RouteConfig.config.resource");
    }

    // Always include outputSchema field (required for facilitator discovery)
    const paymentRequirements: PaymentRequirements = {
      scheme: "exact",
      network: routeConfig.network as typeof this.config.network,
      maxAmountRequired: price.amount,
      resource: finalResource,
      description: config.description || "Payment required",
      mimeType: config.mimeType || "application/json",
      payTo: this.config.treasuryAddress,
      maxTimeoutSeconds: config.maxTimeoutSeconds || 300,
      asset: price.asset.address,
      outputSchema: config.outputSchema || {},
      extra: {
        feePayer,
      },
    };

    return paymentRequirements;
  }

  /**
   * Create a 402 Payment Required response body
   * Use this with your framework's response method
   * @param requirements - Payment requirements (from createPaymentRequirements)
   */
  create402Response(requirements: PaymentRequirements): {
    status: 402;
    body: {
      x402Version: number;
      accepts: PaymentRequirements[];
      error?: string;
    };
  } {
    return {
      status: 402,
      body: {
        x402Version: 1,
        accepts: [requirements],
        error: "Payment required",
      },
    };
  }

  /**
   * Verify payment with facilitator
   * @returns VerifyResponse with isValid and optional invalidReason
   */
  async verifyPayment(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    return this.facilitatorClient.verifyPayment(paymentHeader, paymentRequirements);
  }

  /**
   * Settle payment with facilitator
   * @returns SettleResponse with success status and optional errorReason
   */
  async settlePayment(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    return this.facilitatorClient.settlePayment(paymentHeader, paymentRequirements);
  }
}

