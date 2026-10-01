# Changelog

## 3.0.1

### Patch Changes

- [#56](https://github.com/PayAINetwork/x402-solana/pull/56) [`7d843be`](https://github.com/PayAINetwork/x402-solana/commit/7d843be04a0fecf331d81bd6a456b0f1ef4548f2) Thanks [@notorious-d-e-v](https://github.com/notorious-d-e-v)! - Strictly validate the payment amount from a 402 response before the `amount` limit check, the `beforePayment` hook, or signing. The client now refuses any `amount` / `maxAmountRequired` that is not a positive base-10 integer string fitting in a u64 (for example negative, zero, hex, whitespace-padded, decimal, or oversized values). Previously some malformed values could pass the configured `amount` limit and be encoded as a different transfer amount. Numeric (non-string) amounts, which the x402 spec does not allow, are now refused too. The `beforePayment` hook always sees the validated amount, in both `amount` and (when present) `maxAmountRequired`. A negative or non-bigint client `amount` limit now throws instead of acting as "no limit".

## 3.0.0

### Major Changes

- [#49](https://github.com/PayAINetwork/x402-solana/pull/49) [`22f58e0`](https://github.com/PayAINetwork/x402-solana/commit/22f58e0e3e26b9dced1eaf9f5439fa37409c18f0) Thanks [@notorious-d-e-v](https://github.com/notorious-d-e-v)! - Replace the `@payai/x402` dependency with upstream `@x402/core`, pinned to `2.21.0`.

  `@payai/x402` was a re-publish of upstream `@x402/core` from the now-abandoned PayAI x402 fork,
  and this package was pinned to a months-old `^2.2.4`. All protocol type imports
  (`@payai/x402/types`) and `safeBase64Decode` (`@payai/x402/utils`) now resolve to the equivalent
  `@x402/core` subpath exports.

  `x402-solana`'s own functions, classes and signatures are unchanged. **However, the protocol types
  re-exported from `x402-solana/types` come straight from upstream, and four of them changed shape
  between `2.2.4` and `2.21.0`.** Code that only calls this package's API is unaffected; code that
  imports these types directly may need edits.

  ### Breaking: re-exported protocol types
  - **`VerifyRequest` and `SettleRequest` gained a required `x402Version: number`.** If you build
    these objects yourself, add the field. This matches what the facilitator has always required on
    the wire.
  - **`PaymentPayload.resource` is now optional** (`resource?: ResourceInfo`). Reading it yields
    `ResourceInfo | undefined`; guard before dereferencing.
  - **`ResourceInfo.description` and `ResourceInfo.mimeType` are now optional**, and the type gained
    optional `serviceName`, `tags` and `iconUrl`. This cascades into `PaymentRequired["resource"]`
    and therefore into `BeforePaymentContext.declaredResource` — a `beforePayment` hook reading
    `declaredResource.description` now gets `string | undefined`.

  These are upstream corrections rather than regressions: a facilitator may legitimately omit all
  three fields, so the old required-everywhere types were overstating what arrives at runtime. They
  are deliberately **not** papered over with compatibility aliases, which would keep downstream code
  compiling while leaving it wrong at runtime.

  `PaymentRequirements`, `Network`, `Money`, `Price`, `AssetAmount`, `VerifyResponse`,
  `SettleResponse` and `SupportedResponse` are unchanged in both directions.

  `@payai/facilitator` is unaffected and remains the JWT auth dependency for the PayAI facilitator -
  it already declares `@x402/core` as its optional peer.

## 2.1.0

### Minor Changes

- [#39](https://github.com/PayAINetwork/x402-solana/pull/39) [`2a41117`](https://github.com/PayAINetwork/x402-solana/commit/2a41117fda59b3b4865149e04c1fbecf89cb9636) Thanks [@twzrd-sol](https://github.com/twzrd-sol)! - Add optional `beforePayment` hook to the client. It runs after a 402 response is parsed and a payment requirement is selected, before the payment transaction is built and signed. Return `{ abort: true, reason }` to refuse the payment - the wallet's `signTransaction` is never invoked and the wrapped fetch throws. Enables drop-in payment policy such as spend rules, allow/deny lists, velocity caps, or a seller reputation preflight. An unhandled throw inside the hook aborts the payment (fail-closed). See the README and `examples/before-payment-guard.mjs`.

## 2.0.5

### Patch Changes

- [#42](https://github.com/PayAINetwork/x402-solana/pull/42) [`c0dc35a`](https://github.com/PayAINetwork/x402-solana/commit/c0dc35a92698ff6e3efa8b64e9f1ce61aabb04ee) Thanks [@notorious-d-e-v](https://github.com/notorious-d-e-v)! - v2 client now echoes the 402 response's `extensions` and `resource` object into the payment payload, as required by the x402 v2 specification. Without the echo, facilitators never received Bazaar discovery declarations, so resources paid through this client were never catalogued (#40, #36). `createPaymentPayload` gains an optional fourth parameter carrying the parsed `PaymentRequired`; existing three-argument callers keep the previous behavior.

## 2.0.4

### Added

- PayAI API key authentication support in `FacilitatorClient`
- Use `@payai/facilitator` for JWT auth (automatic caching and refresh)

### Changed

- Bump `@payai/x402` dependency to `^2.2.4`
- Add `@payai/facilitator` `^2.2.4` as dependency

## 2.0.3

### Patch Changes

- Bump `@payai/x402` dependency from `2.0.0-payai.6` to `^2.2.1` to resolve peer dependency conflicts with other `@payai/*` packages

## 2.0.2

### Patch Changes

- [#26](https://github.com/PayAINetwork/x402-solana/pull/26) [`160a799`](https://github.com/PayAINetwork/x402-solana/commit/160a79965a486650a949528cf68b211d7d4731bf) Thanks [@notorious-d-e-v](https://github.com/notorious-d-e-v)! - Bump DEFAULT_COMPUTE_UNIT_LIMIT from 7,000 to 20,000 to provide more headroom for SPL token transfers

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-canary.1] - 2025-06-XX

### ⚠️ BREAKING CHANGES

This release upgrades to x402 protocol v2. This is a breaking change from v0.1.x.

### Changed

- **Protocol Version**: Upgraded from x402 v1 to v2
- **Package Name**: Remains `x402-solana` (unscoped)
- **Network Format**: Now uses CAIP-2 format internally (`solana:chainId`)
  - Mainnet: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
  - Devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
  - Simple names (`solana`, `solana-devnet`) still work in user-facing config
- **Payment Header**: Changed from `X-PAYMENT` to `PAYMENT-SIGNATURE` (per x402 v2 spec)
- **Payment Requirements**: Field renamed from `maxAmountRequired` to `amount`
- **Payment Payload**: Now includes `resource` and `accepted` fields for v2 compliance
- **Dependencies**: Replaced `x402` v0.6.6 with `@x402/core` v2.0.0
- **Server API**: `createPaymentRequirements()` now requires `resourceUrl` as second parameter
- **Server API**: `create402Response()` now requires `resourceUrl` as second parameter

### Added

- **CAIP-2 Network Helpers**:
  - `toCAIP2Network()` - Convert simple network names to CAIP-2 format
  - `toSimpleNetwork()` - Convert CAIP-2 to simple names
- **Network Type Guards**:
  - `isSolanaNetwork()` - Check if network is any Solana network
  - `isSolanaMainnet()` - Check if network is mainnet
  - `isSolanaDevnet()` - Check if network is devnet
- **Full v2 Payment Payload Support**: Payment payloads now include resource metadata
- **Verbose Mode**: Added `verbose` option to client config for debug logging
- **Type Safety**: Improved TypeScript types with stricter definitions

### Removed

- Legacy `x402` package dependency (replaced by `@x402/core`)
- Legacy header support (`X-PAYMENT` no longer sent by client)

### Migration Guide

#### 1. Update Package Import

```typescript
// Before
import { createX402Client } from "x402-solana/client";
import { X402PaymentHandler } from "x402-solana/server";

// After (v2 - same package name, new API)
import { createX402Client } from "x402-solana/client";
import { X402PaymentHandler } from "x402-solana/server";
```

#### 2. Network Configuration (No changes needed)

The library handles CAIP-2 conversion internally. Your existing simple network names still work:

```typescript
// Still works - library converts to CAIP-2 internally
network: "solana-devnet";

// Also works - direct CAIP-2 format
network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
```

#### 3. Server API Changes

The `createPaymentRequirements()` and `create402Response()` methods now require `resourceUrl`:

```typescript
// Before
const requirements = await x402.createPaymentRequirements({
  price: { amount: "1000000", asset: { address: "..." } },
  network: "solana-devnet",
  config: { description: "API", resource: url },
});
const response = x402.create402Response(requirements);

// After
const requirements = await x402.createPaymentRequirements(
  {
    amount: "1000000",
    asset: { address: "...", decimals: 6 },
    description: "API",
  },
  resourceUrl,
); // resourceUrl as second parameter
const response = x402.create402Response(requirements, resourceUrl);
```

#### 4. Amount Field (If using directly)

```typescript
// Before
{
  maxAmountRequired: "1000000";
}

// After
{
  amount: "1000000";
}
```

#### 5. Client Config Changes

```typescript
// Before
createX402Client({
  wallet,
  network: "solana-devnet",
  maxPaymentAmount: BigInt(10_000_000),
});

// After
createX402Client({
  wallet,
  network: "solana-devnet",
  amount: BigInt(10_000_000), // renamed from maxPaymentAmount
  verbose: false, // new option for debug logging
});
```

#### 6. Update Facilitator

Ensure your facilitator supports x402 v2 endpoints. The PayAI facilitator at `https://facilitator.payai.network` already supports v2.

---

## [0.1.5] - 2025-01-XX

### Added

- Custom fetch function support for proxy/CORS handling
- Improved wallet adapter compatibility

## [0.1.4] - 2025-01-XX

### Fixed

- Token-2022 program detection for SPL transfers

## [0.1.3] - 2025-01-XX

### Added

- **Custom Fetch Support**: Added optional `customFetch` parameter to `X402ClientConfig` interface
  - Enables routing requests through proxy servers to bypass CORS restrictions
  - Supports custom request/response handling and logging
  - Fully backwards compatible - existing code works without changes
- Comprehensive JSDoc documentation for `customFetch` parameter with proxy usage example
- New README section "Using with a Proxy Server (CORS Bypass)" with detailed examples
- Updated API Reference documentation to include `customFetch` parameter

### Changed

- `X402Client` constructor now uses `config.customFetch || globalThis.fetch` instead of hardcoded `window.fetch`
- Enhanced JSDoc comments for `X402Client.fetch()` method

### Technical Details

- Files modified:
  - `src/types/solana-payment.ts`: Added `customFetch?: typeof fetch` to `X402ClientConfig`
  - `src/client/index.ts`: Updated constructor to support custom fetch function
  - `README.md`: Added proxy usage documentation and API reference updates

## [0.1.2] - 2024-XX-XX

Initial stable release with core x402 payment protocol implementation for Solana.

### Features

- Client-side automatic 402 payment handling
- Server-side payment verification and settlement
- Framework-agnostic wallet adapter support
- TypeScript with full type safety
- Support for Solana mainnet and devnet
