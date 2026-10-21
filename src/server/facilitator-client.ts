import type {
  PaymentRequirements,
  PaymentPayload,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from '@x402/core/types';
import { getOrGenerateJwt } from '@payai/facilitator';
import { isSolanaNetwork } from '../types';

/**
 * Facilitator supported kind (from /supported endpoint)
 */
interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: {
    feePayer?: string;
    [key: string]: unknown;
  };
}

/**
 * errorReason for a settlement that was broadcast but is not confirmed yet.
 * Not terminal: the payment may still land, so do not ask the buyer to pay again.
 */
export const SETTLEMENT_PENDING = 'settlement_pending';

/**
 * A SettleResponse whose settlement is still unresolved
 */
export type PendingSettleResponse = SettleResponse & {
  success: false;
  errorReason: typeof SETTLEMENT_PENDING;
};

/**
 * Check whether a settle result is pending rather than failed.
 * `transaction` carries the broadcast hash when the facilitator sent one.
 */
export function isSettlementPending(result: SettleResponse): result is PendingSettleResponse {
  return !result.success && result.errorReason === SETTLEMENT_PENDING;
}

/**
 * Read a facilitator SettleResponse out of a non-2xx /settle body.
 * Returns null when the body is not a JSON object with a boolean `success`.
 */
function parseSettleErrorBody(body: string): Partial<Record<keyof SettleResponse, unknown>> | null {
  try {
    const data: unknown = JSON.parse(body);
    if (
      typeof data === 'object' &&
      data !== null &&
      !Array.isArray(data) &&
      typeof (data as { success?: unknown }).success === 'boolean'
    ) {
      return data as Partial<Record<keyof SettleResponse, unknown>>;
    }
  } catch {
    // Not JSON
  }
  return null;
}

/**
 * Configuration for the facilitator client
 */
interface FacilitatorClientConfig {
  url: string;
  /** PayAI API Key ID for JWT auth */
  apiKeyId?: string | undefined;
  /** PayAI API Key Secret for JWT auth */
  apiKeySecret?: string | undefined;
}

/**
 * Client for communicating with x402 facilitator service (v2).
 *
 * When `apiKeyId` and `apiKeySecret` are provided, all requests are
 * automatically authenticated with a JWT Bearer token (cached and refreshed).
 */
export class FacilitatorClient {
  private readonly facilitatorUrl: string;
  private readonly apiKeyId: string | undefined;
  private readonly apiKeySecret: string | undefined;

  constructor(config: FacilitatorClientConfig) {
    this.facilitatorUrl = config.url;
    this.apiKeyId = config.apiKeyId;
    this.apiKeySecret = config.apiKeySecret;
  }

  /**
   * Build auth headers when API keys are configured.
   * Returns an empty object when no keys are present.
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.apiKeyId || !this.apiKeySecret) {
      return {};
    }

    const jwt = await getOrGenerateJwt({
      apiKeyId: this.apiKeyId,
      apiKeySecret: this.apiKeySecret,
    });

    return { Authorization: `Bearer ${jwt}` };
  }

  /**
   * Get supported payment kinds from facilitator
   */
  async getSupported(): Promise<SupportedResponse> {
    const authHeaders = await this.getAuthHeaders();

    const response = await fetch(`${this.facilitatorUrl}/supported`, {
      headers: { ...authHeaders },
    });

    if (!response.ok) {
      throw new Error(`Facilitator /supported returned ${response.status}`);
    }
    return response.json();
  }

  /**
   * Get fee payer address for a Solana network
   * @param network - Network in any format (simple or CAIP-2)
   */
  async getFeePayer(network: string): Promise<string> {
    const supportedData = await this.getSupported();

    // Look for network support - match by CAIP-2 prefix for Solana networks
    const networkSupport = (supportedData.kinds as SupportedKind[])?.find(
      kind =>
        kind.scheme === 'exact' &&
        isSolanaNetwork(kind.network) &&
        isSolanaNetwork(network) &&
        // Match if both are same network type (mainnet or devnet)
        (kind.network.includes('devnet') === network.includes('devnet') || kind.network === network)
    );

    if (!networkSupport?.extra?.feePayer) {
      throw new Error(
        `Facilitator does not support network "${network}" with scheme "exact" or feePayer not provided`
      );
    }

    return networkSupport.extra.feePayer;
  }

  /**
   * Verify payment with facilitator
   * @returns VerifyResponse with isValid and optional invalidReason
   */
  async verifyPayment(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      // Decode the base64 payment payload
      const paymentPayload: PaymentPayload = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString('utf8')
      );

      const verifyPayload = {
        paymentPayload,
        paymentRequirements,
      };

      const authHeaders = await this.getAuthHeaders();

      const response = await fetch(`${this.facilitatorUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(verifyPayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Facilitator /verify returned ${response.status}:`, errorBody);
        return {
          isValid: false,
          invalidReason: 'unexpected_verify_error',
        };
      }

      // Facilitator returns VerifyResponse with status 200 even when validation fails
      const facilitatorResponse: VerifyResponse = await response.json();
      return facilitatorResponse;
    } catch (error) {
      console.error('Payment verification failed:', error);
      return {
        isValid: false,
        invalidReason: 'unexpected_verify_error',
      };
    }
  }

  /**
   * Settle payment with facilitator
   * @returns SettleResponse with success status and optional errorReason
   */
  async settlePayment(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    try {
      // Decode the base64 payment payload
      const paymentPayload: PaymentPayload = JSON.parse(
        Buffer.from(paymentHeader, 'base64').toString('utf8')
      );

      const settlePayload = {
        paymentPayload,
        paymentRequirements,
      };

      const authHeaders = await this.getAuthHeaders();

      const response = await fetch(`${this.facilitatorUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(settlePayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Facilitator /settle returned ${response.status}:`, errorBody);
        // Some facilitators answer settlement_pending with a non-2xx status
        // (x402-foundation/x402#3778). Keep the reason and the broadcast hash
        // so the caller can reconcile instead of asking the buyer to sign again.
        const settleError = parseSettleErrorBody(errorBody);
        return {
          success: false,
          errorReason:
            typeof settleError?.errorReason === 'string'
              ? settleError.errorReason
              : 'unexpected_settle_error',
          ...(typeof settleError?.errorMessage === 'string'
            ? { errorMessage: settleError.errorMessage }
            : {}),
          ...(typeof settleError?.payer === 'string' ? { payer: settleError.payer } : {}),
          transaction: typeof settleError?.transaction === 'string' ? settleError.transaction : '',
          network: paymentRequirements.network,
        };
      }

      // Facilitator returns SettleResponse with status 200 even when settlement fails
      const facilitatorResponse: SettleResponse = await response.json();
      return facilitatorResponse;
    } catch (error) {
      console.error('Payment settlement failed:', error);
      return {
        success: false,
        errorReason: 'unexpected_settle_error',
        transaction: '',
        network: paymentRequirements.network,
      };
    }
  }
}
