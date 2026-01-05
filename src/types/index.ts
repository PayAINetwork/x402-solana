/**
 * x402 Solana - Types Package (v2)
 * All TypeScript types for the x402 protocol v2
 */

// ============================================
// Import types from @payai/x402 package (v2)
// ============================================
export type {
  // Protocol types (v2)
  PaymentRequirements,
  PaymentPayload,
  PaymentRequired,

  // Facilitator types
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
  SupportedResponse,

  // Common types
  Network,
  Money,
  Price,
  AssetAmount,
} from '@payai/x402/types';

// ============================================
// SVM payload type (defined locally to avoid @x402/svm dependency)
// ============================================
/**
 * Exact SVM payload containing a base64 encoded Solana transaction
 */
export interface ExactSvmPayload {
  transaction: string;
}

// ============================================
// Solana-only variants (local)
// ============================================
export * from './x402-protocol';

// ============================================
// Custom Solana types
// ============================================
export * from './solana-payment';
