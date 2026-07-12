/**
 * Documents the TWZRD composition seat for jest (no ESM gate import).
 * Executable proof with real twzrd-x402-gate: npm run test:trust-guard
 */

import { createPaymentFetch } from "../src/client/payment-interceptor";
import type { WalletAdapter } from "../src/types";
import type { VersionedTransaction } from "@solana/web3.js";
import {
  createV2PaymentRequiredResponse,
  createSuccessResponse,
  mockWallet,
  v2PaymentRequired,
} from "./fixtures";

type TrustGuardFn = () => Promise<void>;

function createGuardedFetch(
  inner: typeof fetch,
  guard: TrustGuardFn,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const resp = await inner(input, init);
    if (resp.status === 402) {
      await guard();
    }
    return resp;
  }) as typeof fetch;
}

describe("customFetch pre-sign seat (TWZRD guard composes here)", () => {
  it("refuses before wallet.signTransaction when guard throws", async () => {
    let signs = 0;
    const wallet: WalletAdapter = {
      ...mockWallet,
      signTransaction: async (tx: VersionedTransaction) => {
        signs += 1;
        return tx;
      },
    };

    let n = 0;
    const apiFetch = (async () => {
      n += 1;
      if (n === 1) return createV2PaymentRequiredResponse();
      return createSuccessResponse();
    }) as typeof fetch;

    const guard: TrustGuardFn = async () => {
      throw new Error("payment blocked: twzrd_can_spend_false");
    };

    const paymentFetch = createPaymentFetch(
      createGuardedFetch(apiFetch, guard),
      wallet,
      "https://api.devnet.solana.com",
    );

    await expect(paymentFetch("https://api.example.com/paid")).rejects.toThrow(
      /twzrd_can_spend_false/i,
    );
    expect(signs).toBe(0);
    expect(n).toBe(1);
  });
});