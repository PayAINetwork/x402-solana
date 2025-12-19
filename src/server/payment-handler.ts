import type {
  PaymentRequirements,
  PaymentRequired,
  VerifyResponse,
  SettleResponse,
} from '@x402/core/types';
import type { X402ServerConfig, RouteConfig, TokenAsset } from '../types';
import { toCAIP2Network } from '../types';
import type { Network } from '@x402/core/types';
import { getDefaultRpcUrl, getDefaultTokenAsset } from '../utils';
import { FacilitatorClient } from './facilitator-client';

/**
 * Internal configuration with defaults resolved
 */
interface InternalConfig {
  network: string; // CAIP-2 format
  treasuryAddress: string;
  facilitatorUrl: string;
  rpcUrl: string;
  defaultToken: TokenAsset;
  defaultDescription: string;
  defaultTimeoutSeconds: number;
}

/**
 * x402 Payment Handler for server-side payment processing (v2)
 * Framework agnostic - works with any Node.js HTTP framework
 */
export class X402PaymentHandler {
  private facilitatorClient: FacilitatorClient;
  private config: InternalConfig;

  constructor(config: X402ServerConfig) {
    const defaultToken = config.defaultToken || getDefaultTokenAsset(config.network);

    this.config = {
      network: toCAIP2Network(config.network),
      treasuryAddress: config.treasuryAddress,
      facilitatorUrl: config.facilitatorUrl,
      rpcUrl: config.rpcUrl || getDefaultRpcUrl(config.network),
      defaultToken,
      defaultDescription: config.defaultDescription || 'Payment required',
      defaultTimeoutSeconds: config.defaultTimeoutSeconds || 300,
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
      return headers.get('X-PAYMENT') || headers.get('x-payment');
    }

    // Handle plain object (Express, Fastify, etc.)
    const xPayment = headers['X-PAYMENT'] || headers['x-payment'];
    return Array.isArray(xPayment) ? xPayment[0] || null : xPayment || null;
  }

  /**
   * Create payment requirements for a protected resource
   *
   * @param routeConfig - Route-specific configuration
   * @param resourceUrl - URL of the protected resource
   * @returns Payment requirements object
   */
  async createPaymentRequirements(
    routeConfig: RouteConfig,
    resourceUrl: string
  ): Promise<PaymentRequirements> {
    // Get fee payer from facilitator
    const feePayer = await this.facilitatorClient.getFeePayer(this.config.network);

    const paymentRequirements: PaymentRequirements = {
      scheme: 'exact',
      network: this.config.network as Network,
      amount: routeConfig.amount,
      payTo: this.config.treasuryAddress,
      maxTimeoutSeconds: routeConfig.maxTimeoutSeconds || this.config.defaultTimeoutSeconds,
      asset: routeConfig.asset.address,
      extra: {
        feePayer,
        description: routeConfig.description || this.config.defaultDescription,
        mimeType: routeConfig.mimeType || 'application/json',
        resource: resourceUrl,
      },
    };

    return paymentRequirements;
  }

  /**
   * Create a 402 Payment Required response body (v2)
   * Use this with your framework's response method
   *
   * @param requirements - Payment requirements (from createPaymentRequirements)
   * @param resourceUrl - URL of the protected resource
   */
  create402Response(
    requirements: PaymentRequirements,
    resourceUrl: string
  ): {
    status: 402;
    body: PaymentRequired;
  } {
    return {
      status: 402,
      body: {
        x402Version: 2,
        resource: {
          url: resourceUrl,
          description: (requirements.extra?.description as string) || '',
          mimeType: (requirements.extra?.mimeType as string) || 'application/json',
        },
        accepts: [requirements],
        error: 'Payment required',
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

  /**
   * Get the network in CAIP-2 format
   */
  getNetwork(): string {
    return this.config.network;
  }

  /**
   * Get the treasury address
   */
  getTreasuryAddress(): string {
    return this.config.treasuryAddress;
  }
}
