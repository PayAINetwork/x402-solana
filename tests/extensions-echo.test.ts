/**
 * End-to-end test for PaymentRequired echo through the payment interceptor.
 *
 * v2 spec: servers advertise extensions in PaymentRequired and clients echo
 * them in PaymentPayload. Regression coverage for issue #40, where the client
 * dropped `extensions` (and synthesized `resource`), so facilitators never
 * received bazaar discovery info and resources were never catalogued.
 *
 * The transaction builder is mocked so the flow deterministically reaches the
 * retry request, unlike the soft assertions in v2-headers.test.ts.
 */

import { createX402Client } from '../src/client';
import { mockWallet, encodePaymentRequired, decodePaymentHeader, createSuccessResponse } from './fixtures';

jest.mock('../src/client/transaction-builder', () => ({
  createSolanaPaymentTransaction: jest.fn().mockResolvedValue({
    serialize: () => new Uint8Array([9, 9, 9]),
  }),
}));

const bazaarExtensions = {
  bazaar: {
    info: {
      input: { type: 'http', method: 'GET', queryParams: { q: 'string' } },
      output: { type: 'json' },
    },
    schema: { type: 'object' },
  },
};

const serverResource = {
  url: 'https://api.example.com/canonical/endpoint',
  description: 'Canonical description from the 402 response',
  mimeType: 'application/json',
  serviceName: 'Example Service',
  tags: ['data'],
  iconUrl: 'https://api.example.com/icon.png',
};

const paymentRequired = {
  x402Version: 2,
  error: 'PAYMENT-SIGNATURE header is required',
  resource: serverResource,
  accepts: [
    {
      scheme: 'exact',
      network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      amount: '1000000',
      asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      payTo: 'TestPayToAddress1234567890123456789012345678',
      maxTimeoutSeconds: 60,
      extra: {},
    },
  ],
  extensions: bazaarExtensions,
};

describe('PaymentRequired echo through the interceptor', () => {
  it('echoes extensions and resource from the 402 into the PAYMENT-SIGNATURE payload', async () => {
    let sentPayload: Record<string, unknown> | null = null;

    const customFetch = async (
      _url: string | RequestInfo,
      init?: RequestInit,
    ): Promise<Response> => {
      const headers = init?.headers as Record<string, string> | undefined;

      if (headers?.['PAYMENT-SIGNATURE']) {
        sentPayload = decodePaymentHeader(headers['PAYMENT-SIGNATURE']) as Record<
          string,
          unknown
        >;
        return createSuccessResponse();
      }

      return new Response(JSON.stringify({ message: 'Payment required' }), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-REQUIRED': encodePaymentRequired(paymentRequired),
        },
      });
    };

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      customFetch,
      verbose: false,
    });

    const response = await client.fetch('https://test-api.com/endpoint');

    expect(response.status).toBe(200);
    expect(sentPayload).not.toBeNull();
    // The heart of issue #40: server-declared extensions must survive the echo
    expect(sentPayload!.extensions).toEqual(bazaarExtensions);
    // And the resource object is echoed verbatim, not synthesized client-side
    expect(sentPayload!.resource).toEqual(serverResource);
    expect(sentPayload!.x402Version).toBe(2);
  });
});
