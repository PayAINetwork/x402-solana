/**
 * Tests for settlement_pending on a non-2xx /settle (issue #60)
 *
 * Locks the contract that a facilitator's settle body survives a non-2xx
 * status, so a seller can tell "broadcast, not yet confirmed" apart from a
 * failed payment:
 * - errorReason and the broadcast transaction hash are kept
 * - the result is never reported as a success
 * - bodies that are not a SettleResponse still map to unexpected_settle_error
 * - a seller that holds the hash does not re-challenge, so the buyer signs once
 */

import type { VersionedTransaction } from '@solana/web3.js';
import type { PaymentRequirements, SettleResponse } from '@x402/core/types';
import { createX402Client } from '../src/client';
import { createSolanaPaymentTransaction } from '../src/client/transaction-builder';
import {
  FacilitatorClient,
  SETTLEMENT_PENDING,
  X402PaymentHandler,
  isSettlementPending,
} from '../src/server';
import { mockWallet, encodePaymentRequired, v2PaymentRequired } from './fixtures';

jest.mock('../src/client/transaction-builder', () => ({
  createSolanaPaymentTransaction: jest.fn(),
}));

const mockBuildAndSign = createSolanaPaymentTransaction as jest.MockedFunction<
  typeof createSolanaPaymentTransaction
>;

const fakeSignedTransaction = {
  serialize: () => new Uint8Array([1, 2, 3]),
} as unknown as VersionedTransaction;

const FACILITATOR_URL = 'https://facilitator.test';
const RESOURCE_URL = 'https://api.example.com/test';
const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const TX_HASH =
  '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

const requirements = v2PaymentRequired.accepts[0] as PaymentRequirements;
const paymentHeader = Buffer.from(
  JSON.stringify({ x402Version: 2, accepted: requirements, payload: { transaction: 'AQID' } })
).toString('base64');

const pendingBody = {
  success: false,
  errorReason: 'settlement_pending',
  transaction: TX_HASH,
  network: DEVNET,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Route the facilitator endpoints the server calls. /settle answers with
 * whatever `settle` returns.
 */
function mockFacilitator(settle: () => Response): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.endsWith('/supported')) {
      return jsonResponse(200, {
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network: DEVNET,
            extra: { feePayer: 'FeePayerWalletAddress12345678901234567890123' },
          },
        ],
        extensions: [],
      });
    }
    if (url.endsWith('/verify')) {
      return jsonResponse(200, { isValid: true });
    }
    if (url.endsWith('/settle')) {
      return settle();
    }
    throw new Error(`unexpected facilitator call: ${url}`);
  });
}

describe('settlePayment on a non-2xx /settle', () => {
  let client: FacilitatorClient;

  beforeEach(() => {
    client = new FacilitatorClient({ url: FACILITATOR_URL });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([500, 502, 503, 504])(
    'keeps settlement_pending and the transaction hash on HTTP %i',
    async status => {
      mockFacilitator(() => jsonResponse(status, pendingBody));

      const result = await client.settlePayment(paymentHeader, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('settlement_pending');
      expect(result.transaction).toBe(TX_HASH);
      expect(result.network).toBe(requirements.network);
    }
  );

  it('keeps settlement_pending on HTTP 200 (control)', async () => {
    mockFacilitator(() => jsonResponse(200, pendingBody));

    const result = await client.settlePayment(paymentHeader, requirements);

    expect(result.errorReason).toBe('settlement_pending');
    expect(result.transaction).toBe(TX_HASH);
  });

  it('keeps errorMessage and payer from the facilitator body', async () => {
    mockFacilitator(() =>
      jsonResponse(500, {
        ...pendingBody,
        errorMessage: 'broadcast, confirmation timed out',
        payer: 'PayerWalletAddress1234567890123456789012345',
      })
    );

    const result = await client.settlePayment(paymentHeader, requirements);

    expect(result.errorMessage).toBe('broadcast, confirmation timed out');
    expect(result.payer).toBe('PayerWalletAddress1234567890123456789012345');
  });

  it('never reports success on a non-2xx, even if the body claims it', async () => {
    mockFacilitator(() => jsonResponse(500, { ...pendingBody, success: true, errorReason: undefined }));

    const result = await client.settlePayment(paymentHeader, requirements);

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('unexpected_settle_error');
    expect(result.transaction).toBe(TX_HASH);
  });

  it.each<[string, () => Response]>([
    ['a non-JSON body', () => new Response('<html>Bad Gateway</html>', { status: 502 })],
    ['a truncated JSON body', () => new Response('{"success":false,"transac', { status: 503 })],
    ['a JSON body without success', () => jsonResponse(500, { error: 'boom' })],
    ['a JSON array', () => jsonResponse(500, [pendingBody])],
    ['a JSON null', () => jsonResponse(500, null)],
  ])('maps %s to unexpected_settle_error with no hash', async (_name, settle) => {
    mockFacilitator(settle);

    const result = await client.settlePayment(paymentHeader, requirements);

    expect(result).toEqual({
      success: false,
      errorReason: 'unexpected_settle_error',
      transaction: '',
      network: requirements.network,
    });
  });

  it('drops a transaction that is not a string', async () => {
    mockFacilitator(() => jsonResponse(500, { ...pendingBody, transaction: 12345 }));

    const result = await client.settlePayment(paymentHeader, requirements);

    expect(result.errorReason).toBe('settlement_pending');
    expect(result.transaction).toBe('');
  });
});

describe('isSettlementPending', () => {
  it('is true for a pending result, with or without a hash', () => {
    expect(isSettlementPending({ ...pendingBody, network: DEVNET })).toBe(true);
    expect(isSettlementPending({ ...pendingBody, transaction: '', network: DEVNET })).toBe(true);
    expect(SETTLEMENT_PENDING).toBe('settlement_pending');
  });

  it('is false for a success or any other failure', () => {
    expect(isSettlementPending({ success: true, transaction: TX_HASH, network: DEVNET })).toBe(false);
    expect(
      isSettlementPending({
        success: false,
        errorReason: 'unexpected_settle_error',
        transaction: '',
        network: DEVNET,
      })
    ).toBe(false);
  });

  it('narrows a non-2xx pending result from settlePayment', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFacilitator(() => jsonResponse(500, pendingBody));

    const result = await new FacilitatorClient({ url: FACILITATOR_URL }).settlePayment(
      paymentHeader,
      requirements
    );

    expect(isSettlementPending(result)).toBe(true);
    jest.restoreAllMocks();
  });
});

describe('purchase flow when the facilitator answers settlement_pending with HTTP 500', () => {
  beforeEach(() => {
    mockBuildAndSign.mockReset();
    mockBuildAndSign.mockResolvedValue(fakeSignedTransaction);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * A seller built on X402PaymentHandler that does not re-challenge while a
   * settlement is unresolved (x402 #3437): pending with a hash is answered
   * 202 with that hash, any other failure is answered with a fresh 402.
   */
  function createSeller(): { fetch: typeof fetch; settlements: SettleResponse[] } {
    const x402 = new X402PaymentHandler({
      network: 'solana-devnet',
      treasuryAddress: 'RecipientWalletAddress123456789012345678901',
      facilitatorUrl: FACILITATOR_URL,
    });
    const settlements: SettleResponse[] = [];

    const sellerFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const paymentRequirements = await x402.createPaymentRequirements(
        {
          amount: '1000000',
          asset: { address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6 },
        },
        RESOURCE_URL
      );
      const challenge = () => {
        const { status, body } = x402.create402Response(paymentRequirements, RESOURCE_URL);
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'PAYMENT-REQUIRED': encodePaymentRequired(body) },
        });
      };

      const header = x402.extractPayment(new Headers(init?.headers));
      if (!header) return challenge();

      const verified = await x402.verifyPayment(header, paymentRequirements);
      if (!verified.isValid) return challenge();

      const settlement = await x402.settlePayment(header, paymentRequirements);
      settlements.push(settlement);
      if (settlement.success) return jsonResponse(200, { ok: true });
      if (settlement.errorReason === 'settlement_pending' && settlement.transaction) {
        return jsonResponse(202, { status: 'settlement_pending', transaction: settlement.transaction });
      }
      return challenge();
    };

    return { fetch: sellerFetch as typeof fetch, settlements };
  }

  /** A buyer app that pays again while the seller keeps answering 402. */
  async function buy(sellerFetch: typeof fetch, maxAttempts = 2): Promise<Response> {
    const buyer = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      customFetch: sellerFetch,
    });
    let response = await buyer.fetch(RESOURCE_URL, { method: 'GET' });
    for (let attempt = 1; attempt < maxAttempts && response.status === 402; attempt++) {
      response = await buyer.fetch(RESOURCE_URL, { method: 'GET' });
    }
    return response;
  }

  it('returns the hash to the buyer and signs exactly once', async () => {
    mockFacilitator(() => jsonResponse(500, pendingBody));
    const seller = createSeller();

    const response = await buy(seller.fetch);

    expect(seller.settlements).toHaveLength(1);
    expect(seller.settlements[0]?.transaction).toBe(TX_HASH);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: 'settlement_pending',
      transaction: TX_HASH,
    });
    expect(mockBuildAndSign).toHaveBeenCalledTimes(1);
  });

  it('still re-challenges on a non-2xx with no usable body (control)', async () => {
    mockFacilitator(() => new Response('upstream timeout', { status: 504 }));
    const seller = createSeller();

    const response = await buy(seller.fetch);

    expect(response.status).toBe(402);
    expect(mockBuildAndSign).toHaveBeenCalledTimes(2);
  });
});
