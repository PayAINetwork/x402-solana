/**
 * Tests for strict payment amount validation
 *
 * Locks the contract that a malformed amount in a 402 response can never
 * reach the cap check, the beforePayment hook, or the wallet signer:
 * - only positive base-10 integer strings that fit in a u64 are accepted
 * - rejection happens before the transaction is built or signed, whether or
 *   not a maxValue limit is configured
 */

import type { VersionedTransaction } from '@solana/web3.js';
import type { PaymentRequirements } from '@x402/core/types';
import { createX402Client } from '../src/client';
import { getValidatedPaymentAmount } from '../src/client/payment-amount';
import { createSolanaPaymentTransaction } from '../src/client/transaction-builder';
import type { BeforePaymentHook } from '../src/types';
import {
  mockWallet,
  createSuccessResponse,
  createV1PaymentRequiredResponse,
  createV2PaymentRequiredResponse,
  v1PaymentRequired,
  v2PaymentRequired,
} from './fixtures';

jest.mock('../src/client/transaction-builder', () => {
  const actual = jest.requireActual('../src/client/transaction-builder');
  return {
    ...actual,
    createSolanaPaymentTransaction: jest.fn(actual.createSolanaPaymentTransaction),
  };
});

const mockBuildAndSign = createSolanaPaymentTransaction as jest.MockedFunction<
  typeof createSolanaPaymentTransaction
>;
const { createSolanaPaymentTransaction: realBuildAndSign } = jest.requireActual(
  '../src/client/transaction-builder',
) as { createSolanaPaymentTransaction: typeof createSolanaPaymentTransaction };

const fakeSignedTransaction = {
  serialize: () => new Uint8Array([1, 2, 3]),
} as unknown as VersionedTransaction;

const TEST_URL = 'https://api.example.com/test';
const U64_MAX = '18446744073709551615';

const INVALID_AMOUNTS: Array<[string, unknown]> = [
  ['negative', '-50000000'],
  ['negative one', '-1'],
  ['negative zero', '-0'],
  ['zero', '0'],
  ['above u64 max', '18446744073709551616'],
  ['far above u64 max', '18446744073709551617'],
  ['hex', '0x10'],
  ['leading plus', '+5'],
  ['leading whitespace', ' 100'],
  ['trailing newline', '100\n'],
  ['decimal', '1.5'],
  ['exponent', '1e6'],
  ['non-ASCII digits', '١٠٠'],
  ['number type', 1000000],
  ['object', { toString: () => '1000' }],
];

function requirementsWith(fields: Record<string, unknown>): PaymentRequirements {
  const { amount: _amount, ...rest } = v2PaymentRequired.accepts[0];
  return { ...rest, ...fields } as unknown as PaymentRequirements;
}

function v2WithAmount(amount: unknown) {
  return {
    ...v2PaymentRequired,
    accepts: [{ ...v2PaymentRequired.accepts[0], amount }],
  };
}

function v1WithAmount(maxAmountRequired: unknown) {
  return {
    ...v1PaymentRequired,
    accepts: [{ ...v1PaymentRequired.accepts[0], maxAmountRequired }],
  };
}

describe('getValidatedPaymentAmount', () => {
  it.each([
    ['1', BigInt(1)],
    ['1000000', BigInt(1000000)],
    ['0001000', BigInt(1000)],
    [U64_MAX, BigInt(U64_MAX)],
  ])('accepts %j', (amount, expected) => {
    expect(getValidatedPaymentAmount(requirementsWith({ amount }))).toBe(expected);
  });

  it('accepts legacy maxAmountRequired', () => {
    expect(
      getValidatedPaymentAmount(requirementsWith({ maxAmountRequired: '500000' })),
    ).toBe(BigInt(500000));
  });

  it.each(INVALID_AMOUNTS)('rejects %s', (_label, amount) => {
    expect(() => getValidatedPaymentAmount(requirementsWith({ amount }))).toThrow(
      /Invalid amount in payment requirements/,
    );
  });

  it.each(INVALID_AMOUNTS)('rejects %s in legacy maxAmountRequired', (_label, maxAmountRequired) => {
    expect(() =>
      getValidatedPaymentAmount(requirementsWith({ maxAmountRequired })),
    ).toThrow(/Invalid amount in payment requirements/);
  });

  it.each([undefined, null, ''])('rejects missing amount (%j)', (amount) => {
    expect(() => getValidatedPaymentAmount(requirementsWith({ amount }))).toThrow(
      'Missing amount in payment requirements',
    );
  });
});

describe('payment flow amount validation', () => {
  beforeEach(() => {
    mockBuildAndSign.mockReset();
    mockBuildAndSign.mockResolvedValue(fakeSignedTransaction);
  });

  it.each(INVALID_AMOUNTS)(
    'refuses a v2 %s amount under a maxValue limit without signing',
    async (_label, amount) => {
      const hook = jest.fn();
      const customFetch = jest
        .fn()
        .mockResolvedValueOnce(createV2PaymentRequiredResponse(v2WithAmount(amount)))
        .mockResolvedValueOnce(createSuccessResponse());

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        amount: BigInt(100000),
        customFetch: customFetch as unknown as typeof fetch,
        beforePayment: hook,
      });

      await expect(client.fetch(TEST_URL)).rejects.toThrow(
        /Invalid amount in payment requirements/,
      );
      expect(hook).not.toHaveBeenCalled();
      expect(mockBuildAndSign).not.toHaveBeenCalled();
      expect(customFetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(INVALID_AMOUNTS)(
    'refuses a v2 %s amount with no maxValue limit without signing',
    async (_label, amount) => {
      const customFetch = jest
        .fn()
        .mockResolvedValueOnce(createV2PaymentRequiredResponse(v2WithAmount(amount)))
        .mockResolvedValueOnce(createSuccessResponse());

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: customFetch as unknown as typeof fetch,
      });

      await expect(client.fetch(TEST_URL)).rejects.toThrow(
        /Invalid amount in payment requirements/,
      );
      expect(mockBuildAndSign).not.toHaveBeenCalled();
      expect(customFetch).toHaveBeenCalledTimes(1);
    },
  );

  it('refuses a negative v1 maxAmountRequired without signing', async () => {
    const customFetch = jest
      .fn()
      .mockResolvedValueOnce(createV1PaymentRequiredResponse(v1WithAmount('-50000000')))
      .mockResolvedValueOnce(createSuccessResponse());

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana',
      amount: BigInt(100000),
      customFetch: customFetch as unknown as typeof fetch,
    });

    await expect(client.fetch(TEST_URL)).rejects.toThrow(
      /Invalid amount in payment requirements/,
    );
    expect(mockBuildAndSign).not.toHaveBeenCalled();
    expect(customFetch).toHaveBeenCalledTimes(1);
  });

  it('still enforces maxValue for valid amounts', async () => {
    const customFetch = jest
      .fn()
      .mockResolvedValueOnce(createV2PaymentRequiredResponse(v2WithAmount('100001')));

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      amount: BigInt(100000),
      customFetch: customFetch as unknown as typeof fetch,
    });

    await expect(client.fetch(TEST_URL)).rejects.toThrow(
      'Payment amount exceeds maximum allowed',
    );
    expect(mockBuildAndSign).not.toHaveBeenCalled();
  });

  it('allows a valid amount at the maxValue limit', async () => {
    const customFetch = jest
      .fn()
      .mockResolvedValueOnce(createV2PaymentRequiredResponse(v2WithAmount('100000')))
      .mockResolvedValueOnce(createSuccessResponse());

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      amount: BigInt(100000),
      customFetch: customFetch as unknown as typeof fetch,
    });

    const response = await client.fetch(TEST_URL);
    expect(response.status).toBe(200);
    expect(mockBuildAndSign).toHaveBeenCalledTimes(1);
  });

  it('gives the beforePayment hook the validated amount for legacy requirements', async () => {
    const hook = jest.fn();
    const customFetch = jest
      .fn()
      .mockResolvedValueOnce(createV1PaymentRequiredResponse(v1WithAmount('0000500')))
      .mockResolvedValueOnce(createSuccessResponse());

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana',
      customFetch: customFetch as unknown as typeof fetch,
      beforePayment: hook,
    });

    await client.fetch(TEST_URL);

    const [requirements] = hook.mock.calls[0] as Parameters<BeforePaymentHook>;
    expect(requirements.amount).toBe('500');
  });

  it('rejects a negative maxValue instead of treating it as unlimited', () => {
    expect(() =>
      createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        amount: BigInt(-1),
      }),
    ).toThrow('maxValue must be 0 (no limit) or a positive amount');
  });
});

describe('createSolanaPaymentTransaction amount validation', () => {
  it.each(INVALID_AMOUNTS)(
    'refuses a %s amount before any RPC call or signature',
    async (_label, amount) => {
      const signTransaction = jest.fn(async (tx: VersionedTransaction) => tx);
      const wallet = { ...mockWallet, signTransaction };

      await expect(
        realBuildAndSign(
          wallet,
          requirementsWith({ amount }),
          // Unroutable: any RPC attempt would fail with a different error.
          'http://127.0.0.1:1',
        ),
      ).rejects.toThrow(/Invalid amount in payment requirements/);
      expect(signTransaction).not.toHaveBeenCalled();
    },
  );
});
