/**
 * TWZRD buyer-side trust guard + x402-solana client (pre-sign composition).
 *
 * Flow:
 *   fetch -> 402 -> TWZRD preflight (+ optional wash refuse) -> sign | refuse
 *
 * Install:
 *   npm install x402-solana twzrd-x402-gate@0.5.3
 *
 * Proof harness (zero USDC):
 *   https://github.com/twzrd-sol/twzrd-trust/blob/main/docs/proofs/examples/zero-spend-guard-check.mjs
 */

import { createX402Client } from "../src/client";
import type { WalletAdapter } from "../src/types";

export type TwzrdGuardMode = "default" | "strict";

function decodePaymentRequiredHeader(header: string): { accepts?: unknown[] } {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as {
    accepts?: unknown[];
  };
}

/**
 * x402 v2 puts requirements in PAYMENT-REQUIRED; withTwzrdGuard reads accepts[]
 * from the JSON body. Mirror header requirements into the body without dropping
 * the header so x402-solana can still sign v2 payloads.
 */
export function normalizeV2PaymentRequiredBody(innerFetch: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const resp = await innerFetch(input, init);
    if (resp.status !== 402) return resp;

    const header = resp.headers.get("PAYMENT-REQUIRED");
    if (!header) return resp;

    let body: { accepts?: unknown[] } = {};
    try {
      body = (await resp.clone().json()) as { accepts?: unknown[] };
    } catch {
      body = {};
    }
    if (Array.isArray(body.accepts) && body.accepts.length > 0) return resp;

    const decoded = decodePaymentRequiredHeader(header);
    return new Response(JSON.stringify(decoded), {
      status: 402,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  }) as typeof fetch;
}

/**
 * Wrap the base fetch with TWZRD before handing it to createX402Client.
 *
 * Default machine rule (non-disruptive):
 *   - gateOnCanSpend: false (decision-only; do not block on can_spend=false)
 *   - refuseWashFlagged: true (wash_flagged sellers refused when card is reachable)
 *
 * Strict opt-in:
 *   - gateOnCanSpend: true (also block when can_spend=false)
 */
export async function createTwzrdGuardedFetch(
  baseFetch: typeof fetch,
  mode: TwzrdGuardMode = "default",
): Promise<typeof fetch> {
  const { withTwzrdGuard } = await import("twzrd-x402-gate");
  const strict = mode === "strict";
  const normalized = normalizeV2PaymentRequiredBody(baseFetch);
  return withTwzrdGuard(normalized, {
    gateOnCanSpend: strict,
    refuseWashFlagged: true,
    failOpen: false,
  });
}

export async function createTwzrdGuardedX402Client(config: {
  wallet: WalletAdapter;
  network: "solana" | "solana-devnet";
  rpcUrl?: string;
  amount?: bigint;
  verbose?: boolean;
  guardMode?: TwzrdGuardMode;
  baseFetch?: typeof fetch;
}) {
  const baseFetch = config.baseFetch ?? globalThis.fetch.bind(globalThis);
  const customFetch = await createTwzrdGuardedFetch(baseFetch, config.guardMode ?? "default");
  return createX402Client({
    wallet: config.wallet,
    network: config.network,
    rpcUrl: config.rpcUrl,
    amount: config.amount,
    verbose: config.verbose,
    customFetch,
  });
}