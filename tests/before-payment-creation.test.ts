/**
 * beforePaymentCreation hook contract (jest, mocked signer path).
 * Real twzrd-x402-gate@0.5.3: npm run test:trust-guard
 */

import type { VersionedTransaction } from "@solana/web3.js";
import {
  createPaymentFetch,
  createPaymentInterceptor,
  type BeforePaymentCreationContext,
  type BeforePaymentCreationHook,
} from "../src/client/payment-interceptor";
import type { WalletAdapter } from "../src/types";
import {
  createSuccessResponse,
  createV2PaymentRequiredResponse,
  mockWallet,
  v2PaymentRequired,
} from "./fixtures";

const SELLER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

const solanaV2PaymentRequired = {
  ...v2PaymentRequired,
  accepts: [
    {
      ...v2PaymentRequired.accepts[0],
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      payTo: SELLER,
    },
  ],
};

function mockSignedTransaction(): VersionedTransaction {
  return {
    serialize: () => Uint8Array.from([1, 2, 3]),
  } as unknown as VersionedTransaction;
}

jest.mock("../src/client/transaction-builder", () => ({
  createSolanaPaymentTransaction: jest.fn(
    async (wallet: WalletAdapter): Promise<VersionedTransaction> => {
      const tx = mockSignedTransaction();
      await wallet.signTransaction(tx);
      return tx;
    },
  ),
}));

function createSigningSpyWallet(): {
  wallet: WalletAdapter;
  signCount: () => number;
} {
  let signs = 0;
  const wallet: WalletAdapter = {
    ...mockWallet,
    signTransaction: async (tx: VersionedTransaction) => {
      signs += 1;
      return tx;
    },
  };
  return { wallet, signCount: () => signs };
}

function createApiFetch(): { fetch: typeof fetch; calls: () => number } {
  let n = 0;
  const fetchFn = (async () => {
    n += 1;
    if (n === 1) {
      return createV2PaymentRequiredResponse(solanaV2PaymentRequired);
    }
    return createSuccessResponse({ paid: true });
  }) as typeof fetch;
  return { fetch: fetchFn, calls: () => n };
}

/** Mirrors twzrd-x402-gate policy outcomes for jest (no ESM gate import). */
function createTwzrdPolicyHook(options: {
  gateOnCanSpend: boolean;
  onDecision?: (detail: {
    approved: boolean;
    reason: string;
    verdict: string;
    payTo?: string;
  }) => void;
}): BeforePaymentCreationHook {
  return async (context: BeforePaymentCreationContext) => {
    const payTo = context.selectedRequirements.payTo;
    if (options.gateOnCanSpend) {
      options.onDecision?.({
        approved: false,
        reason: "twzrd_can_spend_false",
        verdict: "warn",
        payTo,
      });
      return {
        abort: true,
        reason: `[twzrd] twzrd_can_spend_false payTo=${payTo ?? "unknown"}`,
      };
    }
    options.onDecision?.({
      approved: true,
      reason: "twzrd_warn_allowed",
      verdict: "warn",
      payTo,
    });
    return undefined;
  };
}

describe("beforePaymentCreation hook", () => {
  it("compatibility: no hook signs once and retries", async () => {
    const { wallet, signCount } = createSigningSpyWallet();
    const api = createApiFetch();

    const paymentFetch = createPaymentFetch(
      api.fetch,
      wallet,
      "https://api.mainnet-beta.solana.com",
    );

    const resp = await paymentFetch("https://api.example.com/paid");
    expect(resp.status).toBe(200);
    expect(signCount()).toBe(1);
    expect(api.calls()).toBe(2);
  });

  it("decision-only warn allows sign when gateOnCanSpend=false", async () => {
    const { wallet, signCount } = createSigningSpyWallet();
    const api = createApiFetch();
    const decisions: Array<{ approved: boolean; reason: string }> = [];

    const paymentFetch = createPaymentInterceptor({
      fetch: api.fetch,
      wallet,
      rpcUrl: "https://api.mainnet-beta.solana.com",
      beforePaymentCreation: createTwzrdPolicyHook({
        gateOnCanSpend: false,
        onDecision: (d) => {
          decisions.push({ approved: d.approved, reason: d.reason });
        },
      }),
    });

    const resp = await paymentFetch("https://api.example.com/paid");
    expect(resp.status).toBe(200);
    expect(signCount()).toBe(1);
    expect(api.calls()).toBe(2);
    expect(decisions).toEqual([
      { approved: true, reason: "twzrd_warn_allowed" },
    ]);
  });

  it("strict block: can_spend=false with gateOnCanSpend=true never signs or retries", async () => {
    const { wallet, signCount } = createSigningSpyWallet();
    const api = createApiFetch();

    const paymentFetch = createPaymentInterceptor({
      fetch: api.fetch,
      wallet,
      rpcUrl: "https://api.mainnet-beta.solana.com",
      beforePaymentCreation: createTwzrdPolicyHook({ gateOnCanSpend: true }),
    });

    await expect(paymentFetch("https://api.example.com/paid")).rejects.toThrow(
      /twzrd_can_spend_false/i,
    );
    expect(signCount()).toBe(0);
    expect(api.calls()).toBe(1);
  });

  it("hook failure policy: transport throw fail-open still signs; deliberate abort never does", async () => {
    const { wallet, signCount } = createSigningSpyWallet();
    const api = createApiFetch();

    const throwingHook: BeforePaymentCreationHook = async () => {
      throw new Error("intel transport down");
    };

    const failOpenFetch = createPaymentInterceptor({
      fetch: api.fetch,
      wallet,
      rpcUrl: "https://api.mainnet-beta.solana.com",
      beforePaymentCreation: throwingHook,
      hookFailurePolicy: "fail-open",
    });

    const resp = await failOpenFetch("https://api.example.com/paid");
    expect(resp.status).toBe(200);
    expect(signCount()).toBe(1);

    const abortHook: BeforePaymentCreationHook = async () => ({
      abort: true,
      reason: "twzrd_can_spend_false",
    });

    let signs2 = 0;
    const wallet2: WalletAdapter = {
      ...mockWallet,
      signTransaction: async (tx: VersionedTransaction) => {
        signs2 += 1;
        return tx;
      },
    };
    const api2 = createApiFetch();

    const abortFetch = createPaymentInterceptor({
      fetch: api2.fetch,
      wallet: wallet2,
      rpcUrl: "https://api.mainnet-beta.solana.com",
      beforePaymentCreation: abortHook,
      hookFailurePolicy: "fail-open",
    });

    await expect(abortFetch("https://api.example.com/paid")).rejects.toThrow(
      /twzrd_can_spend_false/i,
    );
    expect(signs2).toBe(0);
    expect(api2.calls()).toBe(1);
  });
});