/**
 * Unit tests for payment payload creation functions
 */

import { createPaymentPayload, createPaymentPayloadV1 } from '../../src/utils/helpers';
import type { PaymentRequirements } from '@x402/core/types';
import { v2PaymentRequired, v1PaymentRequired, decodePaymentHeader } from '../fixtures';

// Mock VersionedTransaction with serialize method
const createMockTransaction = (data: number[] = [1, 2, 3, 4, 5]) => ({
  serialize: () => new Uint8Array(data),
});

describe('Payment Payload Creation', () => {
  describe('createPaymentPayload (v2)', () => {
    const mockTx = createMockTransaction();
    const requirements = v2PaymentRequired.accepts[0] as PaymentRequirements;
    const resourceUrl = 'https://api.example.com/test';

    it('should create a base64-encoded payload', () => {
      const result = createPaymentPayload(mockTx as never, requirements, resourceUrl);

      // Should be valid base64
      expect(() => Buffer.from(result, 'base64')).not.toThrow();
    });

    it('should include x402Version 2', () => {
      const result = createPaymentPayload(mockTx as never, requirements, resourceUrl);
      const decoded = decodePaymentHeader(result) as { x402Version: number };

      expect(decoded.x402Version).toBe(2);
    });

    it('should include resource information', () => {
      const result = createPaymentPayload(mockTx as never, requirements, resourceUrl);
      const decoded = decodePaymentHeader(result) as {
        resource: { url: string; description: string; mimeType: string };
      };

      expect(decoded.resource).toBeDefined();
      expect(decoded.resource.url).toBe(resourceUrl);
      expect(decoded.resource.mimeType).toBe('application/json');
    });

    it('should include accepted payment requirements', () => {
      const result = createPaymentPayload(mockTx as never, requirements, resourceUrl);
      const decoded = decodePaymentHeader(result) as { accepted: PaymentRequirements };

      expect(decoded.accepted).toBeDefined();
      expect(decoded.accepted.scheme).toBe('exact');
      expect(decoded.accepted.network).toBe(requirements.network);
      expect(decoded.accepted.amount).toBe(requirements.amount);
    });

    it('should include serialized transaction in payload', () => {
      const result = createPaymentPayload(mockTx as never, requirements, resourceUrl);
      const decoded = decodePaymentHeader(result) as { payload: { transaction: string } };

      expect(decoded.payload).toBeDefined();
      expect(decoded.payload.transaction).toBeDefined();

      // Verify transaction is base64 encoded
      const txBytes = Buffer.from(decoded.payload.transaction, 'base64');
      expect(txBytes).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    });

    it('should use description from extra if available', () => {
      const reqWithDescription = {
        ...requirements,
        extra: { ...requirements.extra, description: 'Custom description' },
      };

      const result = createPaymentPayload(mockTx as never, reqWithDescription, resourceUrl);
      const decoded = decodePaymentHeader(result) as { resource: { description: string } };

      expect(decoded.resource.description).toBe('Custom description');
    });

    it('should use mimeType from extra if available', () => {
      const reqWithMimeType = {
        ...requirements,
        extra: { ...requirements.extra, mimeType: 'text/plain' },
      };

      const result = createPaymentPayload(mockTx as never, reqWithMimeType, resourceUrl);
      const decoded = decodePaymentHeader(result) as { resource: { mimeType: string } };

      expect(decoded.resource.mimeType).toBe('text/plain');
    });
  });

  describe('createPaymentPayloadV1', () => {
    const mockTx = createMockTransaction();
    const requirements = v1PaymentRequired.accepts[0] as PaymentRequirements;

    it('should create a base64-encoded payload', () => {
      const result = createPaymentPayloadV1(mockTx as never, requirements);

      // Should be valid base64
      expect(() => Buffer.from(result, 'base64')).not.toThrow();
    });

    it('should include x402Version 1', () => {
      const result = createPaymentPayloadV1(mockTx as never, requirements);
      const decoded = decodePaymentHeader(result) as { x402Version: number };

      expect(decoded.x402Version).toBe(1);
    });

    it('should include scheme', () => {
      const result = createPaymentPayloadV1(mockTx as never, requirements);
      const decoded = decodePaymentHeader(result) as { scheme: string };

      expect(decoded.scheme).toBe('exact');
    });

    it('should include network', () => {
      const result = createPaymentPayloadV1(mockTx as never, requirements);
      const decoded = decodePaymentHeader(result) as { network: string };

      expect(decoded.network).toBe(requirements.network);
    });

    it('should include serialized transaction in payload', () => {
      const result = createPaymentPayloadV1(mockTx as never, requirements);
      const decoded = decodePaymentHeader(result) as { payload: { transaction: string } };

      expect(decoded.payload).toBeDefined();
      expect(decoded.payload.transaction).toBeDefined();

      // Verify transaction is base64 encoded
      const txBytes = Buffer.from(decoded.payload.transaction, 'base64');
      expect(txBytes).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    });

    it('should NOT include resource (v1 format)', () => {
      const result = createPaymentPayloadV1(mockTx as never, requirements);
      const decoded = decodePaymentHeader(result) as { resource?: unknown };

      expect(decoded.resource).toBeUndefined();
    });

    it('should NOT include accepted (v1 format)', () => {
      const result = createPaymentPayloadV1(mockTx as never, requirements);
      const decoded = decodePaymentHeader(result) as { accepted?: unknown };

      expect(decoded.accepted).toBeUndefined();
    });
  });

  describe('v1 vs v2 payload differences', () => {
    const mockTx = createMockTransaction();
    const v2Requirements = v2PaymentRequired.accepts[0] as PaymentRequirements;
    const v1Requirements = v1PaymentRequired.accepts[0] as PaymentRequirements;

    it('should produce different structures for v1 and v2', () => {
      const v2Result = createPaymentPayload(mockTx as never, v2Requirements, 'https://example.com');
      const v1Result = createPaymentPayloadV1(mockTx as never, v1Requirements);

      const v2Decoded = decodePaymentHeader(v2Result);
      const v1Decoded = decodePaymentHeader(v1Result);

      // v2 has resource and accepted
      expect(v2Decoded).toHaveProperty('resource');
      expect(v2Decoded).toHaveProperty('accepted');

      // v1 has scheme and network at top level
      expect(v1Decoded).toHaveProperty('scheme');
      expect(v1Decoded).toHaveProperty('network');
      expect(v1Decoded).not.toHaveProperty('resource');
      expect(v1Decoded).not.toHaveProperty('accepted');
    });

    it('should both include x402Version', () => {
      const v2Result = createPaymentPayload(mockTx as never, v2Requirements, 'https://example.com');
      const v1Result = createPaymentPayloadV1(mockTx as never, v1Requirements);

      const v2Decoded = decodePaymentHeader(v2Result) as { x402Version: number };
      const v1Decoded = decodePaymentHeader(v1Result) as { x402Version: number };

      expect(v2Decoded.x402Version).toBe(2);
      expect(v1Decoded.x402Version).toBe(1);
    });
  });
});
