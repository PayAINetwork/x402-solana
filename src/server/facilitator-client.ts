import type {
  PaymentRequirements,
  PaymentPayload,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from '@x402/core/types';
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
 * Client for communicating with x402 facilitator service (v2)
 */
export class FacilitatorClient {
  constructor(private facilitatorUrl: string) {}

  /**
   * Get supported payment kinds from facilitator
   */
  async getSupported(): Promise<SupportedResponse> {
    const response = await fetch(`${this.facilitatorUrl}/supported`);
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

      const response = await fetch(`${this.facilitatorUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

      const response = await fetch(`${this.facilitatorUrl}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settlePayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Facilitator /settle returned ${response.status}:`, errorBody);
        return {
          success: false,
          errorReason: 'unexpected_settle_error',
          transaction: '',
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
