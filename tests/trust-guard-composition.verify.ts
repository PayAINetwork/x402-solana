/**
 * Zero-funds TWZRD + x402-solana composition verifier (tsx, not jest).
 * Run: npm run test:trust-guard
 */
import assert from "node:assert/strict";
import { createX402Client } from "../src/client";
import type { WalletAdapter } from "../src/types";
import type { VersionedTransaction } from "@solana/web3.js";
import {
  createV1PaymentRequiredResponse,
  createSuccessResponse,
  mockWallet,
  v1PaymentRequired,
} from "./fixtures";

const SELLER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

const solanaPaymentRequired = {
  ...v1PaymentRequired,
  accepts: [
    {
      ...v1PaymentRequired.accepts[0],
      network: "solana",
      payTo: SELLER,
    },
  ],
};

function mockIntelFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
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
    if (n === 1) return createV1PaymentRequiredResponse(solanaPaymentRequired);
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

type WithTwzrdGuard = (
  innerFetch: typeof fetch,
  opts?: Record<string, unknown>,
) => typeof fetch;

async function defaultPolicyPassesGuard(withTwzrdGuard: WithTwzrdGuard): Promise<void> {
  const api = createApiFetch();
  const guardedFetch = withTwzrdGuard(api.fetch, {
    gateOnCanSpend: false,
    refuseWashFlagged: false,
    fetch: mockIntelFetch(),
    failOpen: false,
  });
  const resp = await guardedFetch("https://api.example.com/paid");
  assert.equal(resp.status, 402, "default policy returns 402 for caller to pay");
  assert.equal(api.calls(), 1);
}

async function strictPolicyBlocksBeforeSign(withTwzrdGuard: WithTwzrdGuard): Promise<void> {
  const { wallet, signCount } = createSigningSpyWallet();
  const api = createApiFetch();
  const guardedFetch = withTwzrdGuard(api.fetch, {
    gateOnCanSpend: true,
    refuseWashFlagged: false,
    fetch: mockIntelFetch(),
    failOpen: false,
  });
  const client = createX402Client({
    wallet,
    network: "solana",
    customFetch: guardedFetch,
  });
  await assert.rejects(
    () => client.fetch("https://api.example.com/paid"),
    /twzrd_can_spend_false|payment blocked/i,
  );
  assert.equal(signCount(), 0, "signerInvocationCount must be 0");
  assert.equal(api.calls(), 1);
}

async function main(): Promise<void> {
  const { withTwzrdGuard } = await import("twzrd-x402-gate");
  await defaultPolicyPassesGuard(withTwzrdGuard);
  await strictPolicyBlocksBeforeSign(withTwzrdGuard);
  console.log(
    JSON.stringify(
      {
        pass: true,
        package_version: "0.5.3",
        policy_modes: ["default:gateOnCanSpend=false", "strict:gateOnCanSpend=true"],
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