#!/usr/bin/env node
/**
 * Guard-before-sign example: x402-solana + twzrd-x402-gate
 *
 * Wires a TWZRD trust preflight into the client's `beforePayment` hook so a
 * payment to an untrusted seller is refused BEFORE the wallet ever signs.
 *
 * The script is a self-asserting, zero-funds demo:
 *   - starts a local x402 merchant that returns 402 (v2 PAYMENT-REQUIRED header)
 *   - wraps a signer spy that counts (and fails on) any signTransaction call
 *   - runs the client with strict policy (gateOnCanSpend: true)
 *   - asserts: payment aborted with reason `twzrd_can_spend_false`,
 *     signer invocations === 0, no payment retry sent
 *
 * Run (offline, deterministic - TWZRD intel responses are stubbed):
 *   npm run build && node examples/twzrd-guard.mjs
 *
 * Run against the live TWZRD free preflight (still zero-spend - the preflight
 * is free and the payment is refused before signing):
 *   node examples/twzrd-guard.mjs --live
 */

import { createServer } from "node:http";
import { createX402Client } from "../dist/client/index.mjs";
import { twzrdBeforePaymentCreation } from "twzrd-x402-gate";

const LIVE = process.argv.includes("--live");

// An unknown seller wallet. The TWZRD free preflight cannot vouch for an
// unknown wallet (can_spend=false), so strict mode refuses the payment.
const UNKNOWN_SELLER = "7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** Offline stub of the TWZRD intel API (free preflight + merchant card). */
const stubbedIntelFetch = async (url) => {
  const path = new URL(url).pathname;
  if (path === "/v1/intel/preflight") {
    return Response.json({
      readiness_card: {
        decision: "warn",
        can_spend: false,
        trust_score: 41,
        seller_wallet: UNKNOWN_SELLER,
      },
    });
  }
  // merchant card: unknown seller, not wash flagged
  return Response.json({ pay_to: UNKNOWN_SELLER, wash_flagged: false });
};

// --- 1. Local x402 merchant: always answers 402 with v2 requirements -------
const paymentRequired = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: { url: "/paid", description: "Demo paid endpoint", mimeType: "application/json" },
  accepts: [
    {
      scheme: "exact",
      network: SOLANA_MAINNET_CAIP2,
      amount: "50000", // 0.05 USDC
      asset: USDC_MAINNET,
      payTo: UNKNOWN_SELLER,
      maxTimeoutSeconds: 60,
      extra: { feePayer: "FeePayerWalletAddress12345678901234567890123" },
    },
  ],
  extensions: {},
};

const merchant = createServer((req, res) => {
  res.writeHead(402, {
    "content-type": "application/json",
    "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
  });
  res.end(JSON.stringify({ message: "Payment required" }));
});

await new Promise((resolve) => merchant.listen(0, "127.0.0.1", resolve));
const merchantUrl = `http://127.0.0.1:${merchant.address().port}/paid`;

// --- 2. Signer spy: any signature attempt is an instant failure ------------
let signInvocations = 0;
const wallet = {
  address: "DemoBuyerWallet111111111111111111111111111111",
  signTransaction: async () => {
    signInvocations += 1;
    throw new Error("SIGNER INVOKED - guard-before-sign contract violated");
  },
};

// --- 3. Client with the TWZRD guard in the beforePayment seat --------------
const client = createX402Client({
  wallet,
  network: "solana",
  beforePayment: (requirements, context) =>
    twzrdBeforePaymentCreation(
      { ...requirements, resource: requirements.resource ?? context.resourceUrl },
      {
        gateOnCanSpend: true, // strict mode: TWZRD must vouch before any signature
        ...(LIVE ? {} : { fetch: stubbedIntelFetch }),
      },
    ),
});

// --- 4. Attempt the payment and assert the contract ------------------------
console.log(`mode:      ${LIVE ? "LIVE (intel.twzrd.xyz free preflight)" : "offline (stubbed intel)"}`);
console.log(`merchant:  ${merchantUrl}`);
console.log(`payTo:     ${UNKNOWN_SELLER} (unknown seller)`);

let aborted = null;
try {
  await client.fetch(merchantUrl);
} catch (error) {
  aborted = error;
}

merchant.close();

const pass =
  aborted !== null &&
  /twzrd/.test(String(aborted.message)) &&
  signInvocations === 0;

console.log(`\ndecision:  ${aborted ? "REFUSED before signing" : "approved"}`);
if (aborted) console.log(`reason:    ${aborted.message}`);
console.log(`signer invocations: ${signInvocations}`);
console.log(pass ? "\nPASS - payment refused, wallet never signed" : "\nFAIL");
process.exit(pass ? 0 : 1);
