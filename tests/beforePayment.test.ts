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
  decodePaymentHeader,
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

  it('isolates payment construction from hook mutations', async () => {
    const originalRequirements = structuredClone(v2PaymentRequired.accepts[0]);
    const customFetch = jest
      .fn()
      .mockResolvedValueOnce(createV2PaymentRequiredResponse())
      .mockResolvedValueOnce(createSuccessResponse());

    const client = createX402Client({
      wallet: mockWallet,
      network: 'solana-devnet',
      customFetch: customFetch as unknown as typeof fetch,
      beforePayment: (requirements) => {
        requirements.payTo = 'MutatedRecipientWalletAddress';
        requirements.amount = '999999999';
        requirements.asset = 'MutatedAssetAddress';
        requirements.extra.feePayer = 'MutatedFeePayerWalletAddress';
      },
    });

    await client.fetch(TEST_URL);

    const builtRequirements = mockBuildAndSign.mock.calls[0]?.[1];
    expect(builtRequirements).toEqual(originalRequirements);

    const retryInit = customFetch.mock.calls[1]?.[1] as RequestInit;
    const paymentHeader = (retryInit.headers as Record<string, string>)[
      'PAYMENT-SIGNATURE'
    ];
    const paymentPayload = decodePaymentHeader(paymentHeader) as {
      accepted: typeof originalRequirements;
    };
    expect(paymentPayload.accepted).toEqual(originalRequirements);
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

  it('fails closed without building, signing, or retrying when the hook throws', async () => {
    const wallet = createSpyWallet();
    const customFetch = jest.fn(async () => createV2PaymentRequiredResponse());

    const client = createX402Client({
      wallet,
      network: 'solana-devnet',
      customFetch: customFetch as unknown as typeof fetch,
      beforePayment: () => {
        throw new Error('policy_down');
      },
    });

    await expect(client.fetch(TEST_URL)).rejects.toThrow('policy_down');
    expect(wallet.signTransaction).toHaveBeenCalledTimes(0);
    expect(mockBuildAndSign).toHaveBeenCalledTimes(0);
    expect(customFetch).toHaveBeenCalledTimes(1);
  });

  describe('payer policy contract', () => {
    // A payer can map any local or remote policy result into the hook's small
    // abort/proceed contract. These cases cover required approval and advisory
    // outcomes without coupling the client to a policy provider.
    interface PolicyResult {
      outcome: 'approve' | 'review' | 'deny';
      approved: boolean;
    }

    function createPolicyHook(
      result: PolicyResult,
      options: { requireApproval: boolean },
      onDecision?: (reason: string) => void,
    ): BeforePaymentHook {
      return (): BeforePaymentDecision => {
        if (result.outcome === 'deny') {
          onDecision?.('policy_denied');
          return { abort: true, reason: 'policy_denied' };
        }
        if (options.requireApproval && result.approved === false) {
          onDecision?.('approval_required');
          return { abort: true, reason: 'approval_required' };
        }
        onDecision?.(
          result.outcome === 'review' ? 'proceeded_with_review' : 'approved',
        );
        return undefined;
      };
    }

    it('required approval: approved=false aborts with signer invocation count 0', async () => {
      const wallet = createSpyWallet();
      const customFetch = jest.fn(async () => createV2PaymentRequiredResponse());
      const decisions: string[] = [];

      const client = createX402Client({
        wallet,
        network: 'solana-devnet',
        customFetch: customFetch as unknown as typeof fetch,
        beforePayment: createPolicyHook(
          { outcome: 'review', approved: false },
          { requireApproval: true },
          (reason) => decisions.push(reason),
        ),
      });

      await expect(client.fetch(TEST_URL)).rejects.toThrow('approval_required');

      expect(wallet.signTransaction).toHaveBeenCalledTimes(0);
      expect(mockBuildAndSign).toHaveBeenCalledTimes(0);
      expect(decisions).toEqual(['approval_required']);
    });

    it('advisory review proceeds and the outcome is observable', async () => {
      const customFetch = jest
        .fn()
        .mockResolvedValueOnce(createV2PaymentRequiredResponse())
        .mockResolvedValueOnce(createSuccessResponse());
      const decisions: string[] = [];

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: customFetch as unknown as typeof fetch,
        beforePayment: createPolicyHook(
          { outcome: 'review', approved: false },
          { requireApproval: false },
          (reason) => decisions.push(reason),
        ),
      });

      const response = await client.fetch(TEST_URL);

      expect(response.status).toBe(200);
      expect(mockBuildAndSign).toHaveBeenCalledTimes(1);
      expect(decisions).toEqual(['proceeded_with_review']);
    });
  });
});
