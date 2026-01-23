import type { VersionedTransaction } from "@solana/web3.js";
import type { PaymentRequirements, PaymentPayload } from "@payai/x402/types";
import {
  type TokenAsset,
  SOLANA_MAINNET_CAIP2,
  SOLANA_DEVNET_CAIP2,
  isSolanaMainnet,
} from "../types";

/**
 * Helper utilities for x402 payment processing (v2)
 */

// USDC token addresses
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/**
 * Create v2 payment payload from a signed transaction
 * Encodes transaction and payment details for PAYMENT-SIGNATURE header
 *
 * @param transaction - Signed Solana VersionedTransaction
 * @param paymentRequirements - The accepted payment requirements
 * @param resourceUrl - URL of the protected resource
 * @returns Base64-encoded payment payload for PAYMENT-SIGNATURE header
 */
export function createPaymentPayload(
  transaction: VersionedTransaction,
  paymentRequirements: PaymentRequirements,
  resourceUrl: string,
): string {
  // Serialize the signed transaction to base64
  const base64Transaction = Buffer.from(transaction.serialize()).toString(
    "base64",
  );

  // Create v2 payment payload
  const paymentPayload: PaymentPayload = {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: (paymentRequirements.extra?.description as string) || "",
      mimeType:
        (paymentRequirements.extra?.mimeType as string) || "application/json",
    },
    accepted: paymentRequirements,
    payload: {
      transaction: base64Transaction,
    },
  };

  // Encode payment payload as base64 for PAYMENT-SIGNATURE header
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  return paymentHeader;
}

/**
 * Create v1 payment payload from a signed transaction
 * Encodes transaction for X-PAYMENT header (v1 format)
 *
 * @param transaction - Signed Solana VersionedTransaction
 * @param paymentRequirements - The accepted payment requirements
 * @returns Base64-encoded payment payload for X-PAYMENT header
 */
export function createPaymentPayloadV1(
  transaction: VersionedTransaction,
  paymentRequirements: PaymentRequirements
): string {
  // Serialize the signed transaction to base64
  const base64Transaction = Buffer.from(transaction.serialize()).toString('base64');

  // Create v1 payment payload (simpler format)
  const paymentPayload = {
    x402Version: 1,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      transaction: base64Transaction,
    },
  };

  // Encode payment payload as base64 for X-PAYMENT header
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString(
    "base64",
  );

  return paymentHeader;
}

/**
 * Get default RPC URL for a given Solana network
 * @param network - Network in any format (simple or CAIP-2)
 * @returns Default RPC URL for the network
 */
export function getDefaultRpcUrl(network: string): string {
  if (isSolanaMainnet(network)) {
    return "https://api.mainnet-beta.solana.com";
  }
  return "https://api.devnet.solana.com";
}

/**
 * Get RPC URL for a CAIP-2 network identifier
 * @param network - Network in CAIP-2 format (e.g., "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
 * @returns RPC URL for the network
 */
export function getRpcUrlForNetwork(network: string): string {
  if (network === SOLANA_MAINNET_CAIP2) {
    return "https://api.mainnet-beta.solana.com";
  }
  if (network === SOLANA_DEVNET_CAIP2) {
    return "https://api.devnet.solana.com";
  }
  // Fallback for unknown networks
  return "https://api.devnet.solana.com";
}

/**
 * Get default USDC token asset for a given Solana network
 * @param network - Network in any format (simple or CAIP-2)
 * @returns USDC token asset configuration
 */
export function getDefaultTokenAsset(network: string): TokenAsset {
  if (isSolanaMainnet(network)) {
    return {
      address: USDC_MAINNET,
      decimals: 6,
    };
  }
  return {
    address: USDC_DEVNET,
    decimals: 6,
  };
}

/**
 * Convert human-readable amount to token's smallest unit (atomic units)
 * @param amount - Human-readable amount (e.g., 2.5 for 2.5 USDC)
 * @param decimals - Token decimals (e.g., 6 for USDC, 9 for SOL)
 * @returns Amount in atomic units as string
 */
export function toAtomicUnits(amount: number, decimals: number): string {
  return Math.floor(amount * Math.pow(10, decimals)).toString();
}

/**
 * Convert token's atomic units to human-readable amount
 * @param atomicUnits - Token amount in smallest units (as string or bigint)
 * @param decimals - Token decimals (e.g., 6 for USDC, 9 for SOL)
 * @returns Human-readable amount
 */
export function fromAtomicUnits(
  atomicUnits: string | bigint | number,
  decimals: number,
): number {
  return Number(atomicUnits) / Math.pow(10, decimals);
}
