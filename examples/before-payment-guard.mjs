#!/usr/bin/env node
/**
 * Guard-before-sign example for the `beforePayment` hook.
 *
 * Demonstrates the hook's core contract: a policy refusal happens BEFORE the
 * wallet is ever asked to sign. The policy here is a plain function with no
 * dependencies - swap it for your own spend rules, allow/deny list, velocity
 * cap, or a call to whatever reputation service you use.
 *
 * Self-asserting, zero-funds demo:
 *   - starts a local x402 merchant that returns 402 (v2 PAYMENT-REQUIRED header)
 *   - wraps a signer spy that counts (and fails on) any signTransaction call
 *   - runs the client with a policy that refuses a non-allowlisted seller
 *   - asserts: payment aborted, signer invocations === 0, no payment retry sent
 *
 * Run:
 *   npm run build && node examples/before-payment-guard.mjs
 */

import { createServer } from "node:http";
import { createX402Client } from "../dist/client/index.mjs";

const UNKNOWN_SELLER = "7cVfgArCheMR6Cs4t6vz5rfnqd56vZq4ndaBrY5xkxXy";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

// The payer's policy: only these sellers may be paid, and never above the cap.
const ALLOWED_SELLERS = new Set(["TrustedMerchant1111111111111111111111111111"]);
const MAX_AMOUNT_BASE_UNITS = 100_000n; // 0.10 USDC

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

let paymentRetries = 0;
const merchant = createServer((req, res) => {
  if (req.headers["payment-signature"]) paymentRetries += 1;
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

// --- 3. Client with a payer-owned policy in the beforePayment seat ---------
const client = createX402Client({
  wallet,
  network: "solana",
  beforePayment: (requirements) => {
    if (!ALLOWED_SELLERS.has(requirements.payTo)) {
      return { abort: true, reason: `seller_not_allowlisted:${requirements.payTo}` };
    }
    if (BigInt(requirements.maxAmountRequired ?? requirements.amount) > MAX_AMOUNT_BASE_UNITS) {
      return { abort: true, reason: "amount_above_cap" };
    }
    // proceed to signing
  },
});

// --- 4. Attempt the payment and assert the contract ------------------------
console.log(`merchant:  ${merchantUrl}`);
console.log(`payTo:     ${UNKNOWN_SELLER} (not allowlisted)`);

let aborted = null;
try {
  await client.fetch(merchantUrl);
} catch (error) {
  aborted = error;
}

merchant.close();

const pass =
  aborted !== null &&
  /seller_not_allowlisted/.test(String(aborted.message)) &&
  signInvocations === 0 &&
  paymentRetries === 0;

console.log(`\ndecision:  ${aborted ? "REFUSED before signing" : "approved"}`);
if (aborted) console.log(`reason:    ${aborted.message}`);
console.log(`signer invocations: ${signInvocations}`);
console.log(`payment retries sent: ${paymentRetries}`);
console.log(pass ? "\nPASS - payment refused, wallet never signed" : "\nFAIL");
process.exit(pass ? 0 : 1);
