# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-canary.1] - 2025-06-XX

### ⚠️ BREAKING CHANGES

This release upgrades to x402 protocol v2. This is a breaking change from v0.1.x.

### Changed

- **Protocol Version**: Upgraded from x402 v1 to v2
- **Package Name**: Changed from `x402-solana` to `@payai/x402-solana`
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
import { createX402Client } from 'x402-solana/client';
import { X402PaymentHandler } from 'x402-solana/server';

// After
import { createX402Client } from '@payai/x402-solana/client';
import { X402PaymentHandler } from '@payai/x402-solana/server';
```

#### 2. Network Configuration (No changes needed)

The library handles CAIP-2 conversion internally. Your existing simple network names still work:

```typescript
// Still works - library converts to CAIP-2 internally
network: 'solana-devnet';

// Also works - direct CAIP-2 format
network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
```

#### 3. Server API Changes

The `createPaymentRequirements()` and `create402Response()` methods now require `resourceUrl`:

```typescript
// Before
const requirements = await x402.createPaymentRequirements({
  price: { amount: '1000000', asset: { address: '...' } },
  network: 'solana-devnet',
  config: { description: 'API', resource: url },
});
const response = x402.create402Response(requirements);

// After
const requirements = await x402.createPaymentRequirements(
  {
    amount: '1000000',
    asset: { address: '...', decimals: 6 },
    description: 'API',
  },
  resourceUrl
); // resourceUrl as second parameter
const response = x402.create402Response(requirements, resourceUrl);
```

#### 4. Amount Field (If using directly)

```typescript
// Before
{
  maxAmountRequired: '1000000';
}

// After
{
  amount: '1000000';
}
```

#### 5. Client Config Changes

```typescript
// Before
createX402Client({
  wallet,
  network: 'solana-devnet',
  maxPaymentAmount: BigInt(10_000_000),
});

// After
createX402Client({
  wallet,
  network: 'solana-devnet',
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
