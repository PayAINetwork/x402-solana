/**
 * Unit tests for Solana network type utilities
 */

import {
  isSolanaNetwork,
  isSolanaMainnet,
  isSolanaDevnet,
  toCAIP2Network,
  toSimpleNetwork,
  SOLANA_MAINNET_CAIP2,
  SOLANA_DEVNET_CAIP2,
} from '../../src/types';

describe('Solana Network Type Utilities', () => {
  describe('isSolanaNetwork', () => {
    it('should return true for simple mainnet format', () => {
      expect(isSolanaNetwork('solana')).toBe(true);
    });

    it('should return true for simple devnet format', () => {
      expect(isSolanaNetwork('solana-devnet')).toBe(true);
    });

    it('should return true for CAIP-2 mainnet format', () => {
      expect(isSolanaNetwork(SOLANA_MAINNET_CAIP2)).toBe(true);
    });

    it('should return true for CAIP-2 devnet format', () => {
      expect(isSolanaNetwork(SOLANA_DEVNET_CAIP2)).toBe(true);
    });

    it('should return true for any solana: prefixed network', () => {
      expect(isSolanaNetwork('solana:somechainid')).toBe(true);
      expect(isSolanaNetwork('solana:testnet')).toBe(true);
    });

    it('should return false for non-Solana networks', () => {
      expect(isSolanaNetwork('ethereum')).toBe(false);
      expect(isSolanaNetwork('eip155:1')).toBe(false);
      expect(isSolanaNetwork('base')).toBe(false);
      expect(isSolanaNetwork('')).toBe(false);
    });
  });

  describe('isSolanaMainnet', () => {
    it('should return true for simple mainnet format', () => {
      expect(isSolanaMainnet('solana')).toBe(true);
    });

    it('should return true for CAIP-2 mainnet format', () => {
      expect(isSolanaMainnet(SOLANA_MAINNET_CAIP2)).toBe(true);
    });

    it('should return false for devnet', () => {
      expect(isSolanaMainnet('solana-devnet')).toBe(false);
      expect(isSolanaMainnet(SOLANA_DEVNET_CAIP2)).toBe(false);
    });

    it('should return false for other networks', () => {
      expect(isSolanaMainnet('ethereum')).toBe(false);
      expect(isSolanaMainnet('solana:unknownchain')).toBe(false);
    });
  });

  describe('isSolanaDevnet', () => {
    it('should return true for simple devnet format', () => {
      expect(isSolanaDevnet('solana-devnet')).toBe(true);
    });

    it('should return true for CAIP-2 devnet format', () => {
      expect(isSolanaDevnet(SOLANA_DEVNET_CAIP2)).toBe(true);
    });

    it('should return false for mainnet', () => {
      expect(isSolanaDevnet('solana')).toBe(false);
      expect(isSolanaDevnet(SOLANA_MAINNET_CAIP2)).toBe(false);
    });

    it('should return false for other networks', () => {
      expect(isSolanaDevnet('ethereum')).toBe(false);
    });
  });

  describe('toCAIP2Network', () => {
    it('should convert simple mainnet to CAIP-2 format', () => {
      expect(toCAIP2Network('solana')).toBe(SOLANA_MAINNET_CAIP2);
    });

    it('should convert simple devnet to CAIP-2 format', () => {
      expect(toCAIP2Network('solana-devnet')).toBe(SOLANA_DEVNET_CAIP2);
    });
  });

  describe('toSimpleNetwork', () => {
    it('should convert CAIP-2 mainnet to simple format', () => {
      expect(toSimpleNetwork(SOLANA_MAINNET_CAIP2)).toBe('solana');
    });

    it('should convert CAIP-2 devnet to simple format', () => {
      expect(toSimpleNetwork(SOLANA_DEVNET_CAIP2)).toBe('solana-devnet');
    });

    it('should pass through simple mainnet format', () => {
      expect(toSimpleNetwork('solana')).toBe('solana');
    });

    it('should default unknown networks to devnet', () => {
      expect(toSimpleNetwork('solana:unknown')).toBe('solana-devnet');
    });
  });

  describe('CAIP-2 Constants', () => {
    it('should have correct mainnet CAIP-2 identifier', () => {
      expect(SOLANA_MAINNET_CAIP2).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('should have correct devnet CAIP-2 identifier', () => {
      expect(SOLANA_DEVNET_CAIP2).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    });
  });
});
