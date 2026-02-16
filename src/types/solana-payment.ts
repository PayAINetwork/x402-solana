import type { VersionedTransaction } from '@solana/web3.js';
import type { SolanaNetworkSimple } from './x402-protocol';

/**
 * Solana-specific payment types (v2)
 */

/**
 * Wallet adapter interface - framework agnostic
 * Compatible with both Anza wallet-adapter and custom implementations
 */
export interface WalletAdapter {
  /** Anza wallet-adapter standard - wallet public key */
  publicKey?: { toString(): string };
  /** Alternative property for address */
  address?: string;
  /** Sign a transaction - required for payment */
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

/**
 * Client configuration for x402 Solana client
 */
export interface X402ClientConfig {
  /** Connected wallet adapter */
  wallet: WalletAdapter;
  /** Solana network (simple format: "solana" | "solana-devnet") */
  network: SolanaNetworkSimple;
  /** Custom RPC URL (defaults to public endpoint) */
  rpcUrl?: string;
  /** Maximum payment amount in atomic units (0 = no limit) */
  amount?: bigint;
  /**
   * Optional custom fetch function for making HTTP requests.
   * Useful for routing requests through a proxy server to avoid CORS issues
   * or adding custom request/response handling.
   *
   * @default globalThis.fetch
   */
  customFetch?: typeof fetch;
  /** Enable verbose logging for debugging (default: false) */
  verbose?: boolean;
}

/**
 * Token asset configuration
 */
export interface TokenAsset {
  /** Token mint address */
  address: string;
  /** Token decimals */
  decimals: number;
}

/**
 * Server configuration for x402 payment handler
 */
export interface X402ServerConfig {
  /** Solana network (simple format: "solana" | "solana-devnet") */
  network: SolanaNetworkSimple;
  /** Treasury address where payments are sent */
  treasuryAddress: string;
  /** Facilitator service URL */
  facilitatorUrl: string;
  /** PayAI API Key ID -- enables automatic JWT auth (bypasses free tier limits). */
  apiKeyId?: string;
  /** PayAI API Key Secret (Ed25519 PKCS#8, raw base64 or `payai_sk_` prefixed). */
  apiKeySecret?: string;
  /** Custom RPC URL (defaults to public endpoint) */
  rpcUrl?: string;
  /** Default token to accept (defaults to USDC) */
  defaultToken?: TokenAsset;
  /** Default description for payments */
  defaultDescription?: string;
  /** Default timeout in seconds */
  defaultTimeoutSeconds?: number;
}

/**
 * Route configuration for protected endpoints
 */
export interface RouteConfig {
  /** Price in atomic units */
  amount: string;
  /** Token asset for payment */
  asset: TokenAsset;
  /** Resource description */
  description?: string;
  /** Response MIME type */
  mimeType?: string;
  /** Payment timeout in seconds */
  maxTimeoutSeconds?: number;
}
