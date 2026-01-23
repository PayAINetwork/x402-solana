/**
 * Shared test fixtures for x402-solana tests
 */

import type { WalletAdapter } from '../../src/types';
import type { VersionedTransaction } from '@solana/web3.js';

/**
 * Mock wallet adapter for testing
 * This wallet returns transactions as-is (no actual signing)
 */
export const mockWallet: WalletAdapter = {
  address: 'TestWalletAddress123456789012345678901234567',
  publicKey: {
    toString: () => 'TestWalletAddress123456789012345678901234567',
    toBase58: () => 'TestWalletAddress123456789012345678901234567',
  } as WalletAdapter['publicKey'],
  signTransaction: async (tx: VersionedTransaction): Promise<VersionedTransaction> => tx,
};

/**
 * Create a mock wallet with custom address
 */
export function createMockWallet(address: string): WalletAdapter {
  return {
    address,
    publicKey: {
      toString: () => address,
      toBase58: () => address,
    } as WalletAdapter['publicKey'],
    signTransaction: async (tx: VersionedTransaction): Promise<VersionedTransaction> => tx,
  };
}

/**
 * v2 Payment Requirements (uses CAIP-2 network format, amount field)
 */
export const v2PaymentRequired = {
  x402Version: 2,
  error: 'PAYMENT-SIGNATURE header is required',
  resource: {
    url: 'https://api.example.com/test',
    description: 'Test endpoint',
    mimeType: 'application/json',
  },
  accepts: [
    {
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // Solana devnet CAIP-2
      amount: '1000000', // v2 uses 'amount'
      asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
      payTo: 'RecipientWalletAddress123456789012345678901',
      maxTimeoutSeconds: 60,
      extra: {
        feePayer: 'FeePayerWalletAddress12345678901234567890123',
      },
    },
  ],
  extensions: {},
};

/**
 * v1 Payment Requirements (uses simple network format, maxAmountRequired field)
 */
export const v1PaymentRequired = {
  x402Version: 1,
  error: 'X-PAYMENT header is required',
  accepts: [
    {
      scheme: 'exact',
      network: 'solana', // v1 uses simple network names
      maxAmountRequired: '1000000', // v1 uses 'maxAmountRequired'
      resource: 'https://api.example.com/test',
      description: 'Test endpoint',
      mimeType: 'application/json',
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
      payTo: 'RecipientWalletAddress123456789012345678901',
      maxTimeoutSeconds: 60,
      extra: {
        feePayer: 'FeePayerWalletAddress12345678901234567890123',
      },
    },
  ],
};

/**
 * v1 Payment Requirements for devnet
 */
export const v1PaymentRequiredDevnet = {
  x402Version: 1,
  error: 'X-PAYMENT header is required',
  accepts: [
    {
      scheme: 'exact',
      network: 'solana-devnet', // v1 devnet format
      maxAmountRequired: '500000',
      resource: 'https://api.example.com/test',
      description: 'Test endpoint devnet',
      mimeType: 'application/json',
      asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
      payTo: 'RecipientWalletAddress123456789012345678901',
      maxTimeoutSeconds: 60,
      extra: {
        feePayer: 'FeePayerWalletAddress12345678901234567890123',
      },
    },
  ],
};

/**
 * Encode payment requirements as base64 (for v2 PAYMENT-REQUIRED header)
 */
export function encodePaymentRequired(paymentRequired: object): string {
  return Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
}

/**
 * Decode base64 payment header
 */
export function decodePaymentHeader(header: string): object {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
}

/**
 * Create a mock Response with payment requirements in body (v1 style)
 */
export function createV1PaymentRequiredResponse(paymentRequired: object = v1PaymentRequired): Response {
  return new Response(JSON.stringify(paymentRequired), {
    status: 402,
    statusText: 'Payment Required',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a mock Response with payment requirements in header (v2 style)
 */
export function createV2PaymentRequiredResponse(paymentRequired: object = v2PaymentRequired): Response {
  return new Response(JSON.stringify({ message: 'Payment required' }), {
    status: 402,
    statusText: 'Payment Required',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-REQUIRED': encodePaymentRequired(paymentRequired),
    },
  });
}

/**
 * Create a success response
 */
export function createSuccessResponse(body: object = { success: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a success response with PAYMENT-RESPONSE header (v2)
 */
export function createV2SuccessResponse(
  body: object = { success: true },
  paymentResponse: object = {
    success: true,
    transaction: '5abc123def456...',
    network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    payer: 'PayerWalletAddress123456789012345678901234',
  }
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-RESPONSE': encodePaymentRequired(paymentResponse),
    },
  });
}
