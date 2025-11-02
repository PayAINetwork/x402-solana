import {
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedPaymentKindsResponse,
  SupportedPaymentKind,
} from "../types";

type SupportedPaymentKindType = SupportedPaymentKind;

/**
 * Client for communicating with x402 facilitator service
 */
export class FacilitatorClient {
  constructor(private facilitatorUrl: string) { }

  /**
   * Get fee payer address from facilitator's /supported endpoint
   */
  async getFeePayer(network: string): Promise<string> {
    const response = await fetch(`${this.facilitatorUrl}/supported`);
    if (!response.ok) {
      throw new Error(`Facilitator /supported returned ${response.status}`);
    }

    const supportedData: SupportedPaymentKindsResponse = await response.json();

    // Look for network support and extract fee payer
    const networkSupport = supportedData.kinds?.find(
      (kind: SupportedPaymentKindType) => kind.network === network && kind.scheme === "exact"
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
   * @returns VerifyResponse with isValid and optional invalidReason from facilitator
   */
  async verifyPayment(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      // Decode the base64 payment payload
      const paymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf8")
      );

      const verifyPayload = {
        paymentPayload,
        paymentRequirements,
      };

      const response = await fetch(`${this.facilitatorUrl}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(verifyPayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Facilitator /verify returned ${response.status}:`, errorBody);
        return {
          isValid: false,
          invalidReason: "unexpected_verify_error",
        };
      }

      // Facilitator returns VerifyResponse with status 200 even when validation fails
      const facilitatorResponse: VerifyResponse = await response.json();
      return facilitatorResponse;
    } catch (error) {
      console.error("Payment verification failed:", error);
      return {
        isValid: false,
        invalidReason: "unexpected_verify_error",
      };
    }
  }

  /**
   * Settle payment with facilitator
   * @returns SettleResponse with success status and optional errorReason from facilitator
   */
  async settlePayment(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    try {
      // Decode the base64 payment payload
      const paymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf8")
      );

      const settlePayload = {
        paymentPayload,
        paymentRequirements,
      };

      const response = await fetch(`${this.facilitatorUrl}/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settlePayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Facilitator /settle returned ${response.status}:`, errorBody);
        return {
          success: false,
          errorReason: "unexpected_settle_error",
          transaction: "",
          network: paymentRequirements.network,
        };
      }

      // Facilitator returns SettleResponse with status 200 even when settlement fails
      const facilitatorResponse: SettleResponse = await response.json();
      return facilitatorResponse;
    } catch (error) {
      console.error("Payment settlement failed:", error);
      return {
        success: false,
        errorReason: "unexpected_settle_error",
        transaction: "",
        network: paymentRequirements.network,
      };
    }
  }
}

