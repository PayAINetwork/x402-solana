import type { Network } from '@x402/core/types';

/**
 * Solana-specific x402 Protocol Types (v2)
 * These are Solana-only variants of x402 protocol types
 */

// CAIP-2 network identifiers for Solana
export const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
export const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;

/**
 * Solana network type - supports both simple and CAIP-2 formats
 * Simple: "solana" | "solana-devnet" (for user-facing config)
 * CAIP-2: "solana:chainId" (used in protocol)
 */
export type SolanaNetworkSimple = 'solana' | 'solana-devnet';
export type SolanaNetworkCAIP2 = typeof SOLANA_MAINNET_CAIP2 | typeof SOLANA_DEVNET_CAIP2;
export type SolanaNetwork = SolanaNetworkSimple | SolanaNetworkCAIP2;

/**
 * Check if a network string is a Solana network (any format)
 */
export function isSolanaNetwork(network: string): network is SolanaNetwork {
  return network === 'solana' || network === 'solana-devnet' || network.startsWith('solana:');
}

/**
 * Check if network is mainnet
 */
export function isSolanaMainnet(network: string): boolean {
  return network === 'solana' || network === SOLANA_MAINNET_CAIP2;
}

/**
 * Check if network is devnet
 */
export function isSolanaDevnet(network: string): boolean {
  return network === 'solana-devnet' || network === SOLANA_DEVNET_CAIP2;
}

/**
 * Convert simple network name to CAIP-2 format
 */
export function toCAIP2Network(network: SolanaNetworkSimple): Network {
  switch (network) {
    case 'solana':
      return SOLANA_MAINNET_CAIP2;
    case 'solana-devnet':
      return SOLANA_DEVNET_CAIP2;
  }
}

/**
 * Convert CAIP-2 network to simple name (for display/config)
 */
export function toSimpleNetwork(network: string): SolanaNetworkSimple {
  if (network === SOLANA_MAINNET_CAIP2 || network === 'solana') {
    return 'solana';
  }
  return 'solana-devnet';
}
