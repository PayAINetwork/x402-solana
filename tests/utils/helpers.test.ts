/**
 * Unit tests for helper utility functions
 */

import {
  toAtomicUnits,
  fromAtomicUnits,
  getDefaultRpcUrl,
  getRpcUrlForNetwork,
  getDefaultTokenAsset,
} from '../../src/utils/helpers';
import { SOLANA_MAINNET_CAIP2, SOLANA_DEVNET_CAIP2 } from '../../src/types';

describe('Helper Utilities', () => {
  describe('toAtomicUnits', () => {
    it('should convert whole numbers correctly', () => {
      expect(toAtomicUnits(1, 6)).toBe('1000000');
      expect(toAtomicUnits(10, 6)).toBe('10000000');
      expect(toAtomicUnits(100, 6)).toBe('100000000');
    });

    it('should convert decimal numbers correctly', () => {
      expect(toAtomicUnits(1.5, 6)).toBe('1500000');
      expect(toAtomicUnits(0.5, 6)).toBe('500000');
      expect(toAtomicUnits(0.000001, 6)).toBe('1');
    });

    it('should handle different decimal places', () => {
      // SOL has 9 decimals
      expect(toAtomicUnits(1, 9)).toBe('1000000000');
      expect(toAtomicUnits(0.5, 9)).toBe('500000000');

      // USDC has 6 decimals
      expect(toAtomicUnits(1, 6)).toBe('1000000');

      // Token with 2 decimals
      expect(toAtomicUnits(1, 2)).toBe('100');
    });

    it('should floor fractional atomic units', () => {
      // 0.0000001 USDC would be 0.1 atomic units, should floor to 0
      expect(toAtomicUnits(0.0000001, 6)).toBe('0');

      // 1.9999999 USDC should floor to 1999999
      expect(toAtomicUnits(1.9999999, 6)).toBe('1999999');
    });

    it('should handle zero', () => {
      expect(toAtomicUnits(0, 6)).toBe('0');
      expect(toAtomicUnits(0, 9)).toBe('0');
    });
  });

  describe('fromAtomicUnits', () => {
    it('should convert atomic units to human-readable format', () => {
      expect(fromAtomicUnits('1000000', 6)).toBe(1);
      expect(fromAtomicUnits('1500000', 6)).toBe(1.5);
      expect(fromAtomicUnits('500000', 6)).toBe(0.5);
    });

    it('should handle string input', () => {
      expect(fromAtomicUnits('1000000', 6)).toBe(1);
    });

    it('should handle bigint input', () => {
      expect(fromAtomicUnits(BigInt(1000000), 6)).toBe(1);
    });

    it('should handle number input', () => {
      expect(fromAtomicUnits(1000000, 6)).toBe(1);
    });

    it('should handle different decimal places', () => {
      // SOL (9 decimals)
      expect(fromAtomicUnits('1000000000', 9)).toBe(1);

      // USDC (6 decimals)
      expect(fromAtomicUnits('1000000', 6)).toBe(1);
    });

    it('should handle zero', () => {
      expect(fromAtomicUnits('0', 6)).toBe(0);
      expect(fromAtomicUnits(0, 6)).toBe(0);
    });

    it('should handle small amounts', () => {
      expect(fromAtomicUnits('1', 6)).toBe(0.000001);
      expect(fromAtomicUnits('10', 6)).toBe(0.00001);
    });
  });

  describe('getDefaultRpcUrl', () => {
    it('should return mainnet RPC for mainnet networks', () => {
      expect(getDefaultRpcUrl('solana')).toBe('https://api.mainnet-beta.solana.com');
      expect(getDefaultRpcUrl(SOLANA_MAINNET_CAIP2)).toBe('https://api.mainnet-beta.solana.com');
    });

    it('should return devnet RPC for devnet networks', () => {
      expect(getDefaultRpcUrl('solana-devnet')).toBe('https://api.devnet.solana.com');
      expect(getDefaultRpcUrl(SOLANA_DEVNET_CAIP2)).toBe('https://api.devnet.solana.com');
    });

    it('should default to devnet for unknown networks', () => {
      expect(getDefaultRpcUrl('unknown')).toBe('https://api.devnet.solana.com');
    });
  });

  describe('getRpcUrlForNetwork', () => {
    it('should return correct RPC for CAIP-2 mainnet', () => {
      expect(getRpcUrlForNetwork(SOLANA_MAINNET_CAIP2)).toBe('https://api.mainnet-beta.solana.com');
    });

    it('should return correct RPC for CAIP-2 devnet', () => {
      expect(getRpcUrlForNetwork(SOLANA_DEVNET_CAIP2)).toBe('https://api.devnet.solana.com');
    });

    it('should fallback to devnet for unknown CAIP-2 networks', () => {
      expect(getRpcUrlForNetwork('solana:unknownchain')).toBe('https://api.devnet.solana.com');
    });
  });

  describe('getDefaultTokenAsset', () => {
    const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

    it('should return mainnet USDC for mainnet networks', () => {
      const asset = getDefaultTokenAsset('solana');
      expect(asset.address).toBe(USDC_MAINNET);
      expect(asset.decimals).toBe(6);
    });

    it('should return devnet USDC for devnet networks', () => {
      const asset = getDefaultTokenAsset('solana-devnet');
      expect(asset.address).toBe(USDC_DEVNET);
      expect(asset.decimals).toBe(6);
    });

    it('should work with CAIP-2 format', () => {
      expect(getDefaultTokenAsset(SOLANA_MAINNET_CAIP2).address).toBe(USDC_MAINNET);
      expect(getDefaultTokenAsset(SOLANA_DEVNET_CAIP2).address).toBe(USDC_DEVNET);
    });
  });
});
