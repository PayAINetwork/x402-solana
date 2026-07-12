/**
 * Zero-funds TWZRD + x402-solana beforePaymentCreation verifier (tsx).
 * Run: npm run test:trust-guard
 */
import assert from "node:assert/strict";
import { createPaymentInterceptor } from "../src/client/payment-interceptor";
import type { WalletAdapter } from "../src/types";
import type { VersionedTransaction } from "@solana/web3.js";
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

function mockIntelFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/v1/intel/preflight")) {
      return new Response(
        JSON.stringify({
          readiness_card: {
            decision: "warn",
            can_spend: false,
            trust_score: 52,
            seller_wallet: SELLER,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/v1/intel/merchant_card/")) {
      return new Response(JSON.stringify({ wash_flagged: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
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

function createSigningSpyWallet(): { wallet: WalletAdapter; signCount: () => number } {
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

async function main(): Promise<void> {
  const { twzrdBeforePaymentCreation } = await import("twzrd-x402-gate");
  const { wallet, signCount } = createSigningSpyWallet();
  const api = createApiFetch();

  const paymentFetch = createPaymentInterceptor({
    fetch: api.fetch,
    wallet,
    rpcUrl: "https://api.mainnet-beta.solana.com",
    beforePaymentCreation: async (context) =>
      twzrdBeforePaymentCreation(context.selectedRequirements, {
        gateOnCanSpend: true,
        refuseWashFlagged: false,
        failOpen: false,
        fetch: mockIntelFetch(),
      }),
  });

  await assert.rejects(
    () => paymentFetch("https://api.example.com/paid"),
    /twzrd_can_spend_false/i,
  );
  assert.equal(signCount(), 0, "signerInvocationCount must be 0");
  assert.equal(api.calls(), 1, "retry fetch must not run");

  console.log(
    JSON.stringify(
      {
        pass: true,
        insertion: "after requirement selection, before wallet.signTransaction",
        package_version: "0.5.3",
        strict: { reason: "twzrd_can_spend_false", signerInvocationCount: 0 },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});