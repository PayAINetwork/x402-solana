/**
 * Tests for the beforePayment hook
 *
 * Locks the guard-before-sign contract:
 * - an aborting hook means the wallet signer is NEVER invoked and the
 *   original request is not retried
 * - an approving hook leaves the payment flow unchanged
 */

import type { VersionedTransaction } from '@solana/web3.js';
import { createX402Client } from '../src/client';
import { createSolanaPaymentTransaction } from '../src/client/transaction-builder';
import type { BeforePaymentDecision, BeforePaymentHook, WalletAdapter } from '../src/types';
import {
  mockWallet,
  createSuccessResponse,
  createV2PaymentRequiredResponse,
  v2PaymentRequired,
} from './fixtures';

// Mock the transaction builder: it is the ONLY call site of
// wallet.signTransaction, so "builder not called" === "signer not called".
// Mocking it also keeps these tests fully offline (no RPC).
jest.mock('../src/client/transaction-builder', () => ({
  createSolanaPaymentTransaction: jest.fn(),
}));

const mockBuildAndSign = createSolanaPaymentTransaction as jest.MockedFunction<
  typeof createSolanaPaymentTransaction
>;

const fakeSignedTransaction = {
  serialize: () => new Uint8Array([1, 2, 3]),
} as unknown as VersionedTransaction;

function createSpyWallet(): WalletAdapter & {
  signTransaction: jest.MockedFunction<WalletAdapter['signTransaction']>;
} {
  return {
    ...mockWallet,
    signTransaction: jest.fn(async (tx: VersionedTransaction) => tx),
  };
}

const TEST_URL = 'https://api.example.com/test';

describe('beforePayment hook', () => {
  beforeEach(() => {
    mockBuildAndSign.mockReset();
    mockBuildAndSign.mockResolvedValue(fakeSignedTransaction);
  });

  it('is not called for non-402 responses', async () => {
    const hook = jest.fn();
    const customFetch = jest.fn(async () => createSuccessResponse());

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      customFetch: customFetch as unknown as typeof fetch,
      beforePayment: hook,
    });

    const response = await client.fetch(TEST_URL);

    expect(response.status).toBe(200);
    expect(hook).not.toHaveBeenCalled();
    expect(mockBuildAndSign).not.toHaveBeenCalled();
  });

  it('proceeds to build and sign when the hook approves', async () => {
    const hook = jest.fn(async () => undefined);
    const customFetch = jest
      .fn()
      .mockResolvedValueOnce(createV2PaymentRequiredResponse())
      .mockResolvedValueOnce(createSuccessResponse());

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      customFetch: customFetch as unknown as typeof fetch,
      beforePayment: hook,
    });

    const response = await client.fetch(TEST_URL);

    expect(response.status).toBe(200);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(mockBuildAndSign).toHaveBeenCalledTimes(1);

    // Hook receives the SELECTED requirements plus request context
    const [requirements, context] = hook.mock.calls[0] as Parameters<BeforePaymentHook>;
    expect(requirements.payTo).toBe(v2PaymentRequired.accepts[0].payTo);
    expect(context.resourceUrl).toBe(TEST_URL);
    expect(context.protocolVersion).toBe(2);

    // The retried request carries the payment header
    expect(customFetch).toHaveBeenCalledTimes(2);
    const retryInit = customFetch.mock.calls[1][1] as RequestInit;
    expect(
      (retryInit.headers as Record<string, string>)['PAYMENT-SIGNATURE'],
    ).toBeDefined();
  });

  it('never invokes the signer and does not retry when the hook aborts', async () => {
    const wallet = createSpyWallet();
    const customFetch = jest.fn(async () => createV2PaymentRequiredResponse());

    const client = createX402Client({
      wallet,
      network: 'solana-devnet',
      customFetch: customFetch as unknown as typeof fetch,
      beforePayment: () => ({ abort: true }),
    });

    await expect(client.fetch(TEST_URL)).rejects.toThrow(
      'Payment aborted by beforePayment hook',
    );

    // Guard-before-sign: zero signer invocations, zero transaction builds
    expect(wallet.signTransaction).toHaveBeenCalledTimes(0);
    expect(mockBuildAndSign).toHaveBeenCalledTimes(0);
    // Original request only - never retried with a payment header
    expect(customFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces the hook reason in the thrown error', async () => {
    const customFetch = jest.fn(async () => createV2PaymentRequiredResponse());

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      customFetch: customFetch as unknown as typeof fetch,
      beforePayment: () => ({ abort: true, reason: 'payTo not on allowlist' }),
    });

    await expect(client.fetch(TEST_URL)).rejects.toThrow('payTo not on allowlist');
  });

  describe('reputation-preflight policy contract', () => {
    // A payer that consults an external reputation service before signing gets
    // back some verdict + a "can I spend" flag. This locks the two policy shapes
    // that matter for the hook, with a local stand-in for the service so the
    // test has no network dependency: strict (refuse unless vouched) and
    // decision-only (refuse only on an explicit block).
    interface ReadinessCard {
      decision: 'allow' | 'warn' | 'block';
      can_spend: boolean;
      trust_score: number;
    }

    function reputationPolicy(
      card: ReadinessCard,
      options: { gateOnCanSpend: boolean },
      onDecision?: (reason: string) => void,
    ): BeforePaymentHook {
      return (): BeforePaymentDecision => {
        if (card.decision === 'block') {
          onDecision?.(`refused_verdict_${card.decision}`);
          return { abort: true, reason: `refused_verdict_${card.decision}` };
        }
        if (options.gateOnCanSpend && card.can_spend === false) {
          onDecision?.('refused_not_vouched');
          return { abort: true, reason: 'refused_not_vouched' };
        }
        onDecision?.(card.decision === 'warn' ? 'allowed_with_warning' : 'allowed');
        return undefined;
      };
    }

    it('strict mode: can_spend=false aborts with signer invocation count 0', async () => {
      const wallet = createSpyWallet();
      const customFetch = jest.fn(async () => createV2PaymentRequiredResponse());
      const decisions: string[] = [];

      const client = createX402Client({
        wallet,
        network: 'solana-devnet',
        customFetch: customFetch as unknown as typeof fetch,
        beforePayment: reputationPolicy(
          { decision: 'warn', can_spend: false, trust_score: 56 },
          { gateOnCanSpend: true },
          (reason) => decisions.push(reason),
        ),
      });

      await expect(client.fetch(TEST_URL)).rejects.toThrow('refused_not_vouched');

      expect(wallet.signTransaction).toHaveBeenCalledTimes(0);
      expect(mockBuildAndSign).toHaveBeenCalledTimes(0);
      expect(decisions).toEqual(['refused_not_vouched']);
    });

    it('decision-only default: warn proceeds and the decision is observable', async () => {
      const customFetch = jest
        .fn()
        .mockResolvedValueOnce(createV2PaymentRequiredResponse())
        .mockResolvedValueOnce(createSuccessResponse());
      const decisions: string[] = [];

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: customFetch as unknown as typeof fetch,
        beforePayment: reputationPolicy(
          { decision: 'warn', can_spend: false, trust_score: 56 },
          { gateOnCanSpend: false },
          (reason) => decisions.push(reason),
        ),
      });

      const response = await client.fetch(TEST_URL);

      expect(response.status).toBe(200);
      expect(mockBuildAndSign).toHaveBeenCalledTimes(1);
      expect(decisions).toEqual(['allowed_with_warning']);
    });
  });
});
