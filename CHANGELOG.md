# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-XX

### ⚠️ BREAKING CHANGES

This release upgrades to x402 protocol v2. This is a breaking change from v0.1.x.

### Changed

- **Protocol Version**: Upgraded from x402 v1 to v2
- **Network Format**: Now uses CAIP-2 format (`solana:chainId`) instead of simple names
  - Mainnet: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
  - Devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- **Payment Requirements**: Field renamed from `maxAmountRequired` to `amount`
- **Payment Payload**: Now includes `resource` and `accepted` fields for v2 compliance
- **Dependencies**: Replaced `x402` v0.6.6 with `@x402/core` v2.0.0 and `@x402/svm` v2.0.0
- **Solana SDK**: Migrated from `@solana/web3.js` v1.x to `@solana/kit` v5.x

### Added

- CAIP-2 network helpers: `toCAIP2Network()`, `toSimpleNetwork()`
- Network type guards: `isSolanaNetwork()`, `isSolanaMainnet()`, `isSolanaDevnet()`
- Full v2 payment payload support with resource metadata

### Removed

- Legacy `x402` package dependency
- `@solana/web3.js` dependency (replaced by `@solana/kit`)
- `@solana/spl-token` dependency (replaced by `@solana-program/token-2022`)

### Migration Guide

1. Update your network configuration to use simple names (the library handles CAIP-2 conversion):
   ```typescript
   // Before (still works)
   network: "solana-devnet"
   
   // The library internally converts to CAIP-2:
   // "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
   ```

2. If you were using `maxAmountRequired`, update to `amount`:
   ```typescript
   // Before
   { maxAmountRequired: "1000000" }
   
   // After
   { amount: "1000000" }
   ```

3. Update your facilitator to support x402 v2 endpoints

## [0.1.5] - 2024-XX-XX

### Added
- Custom fetch function support for proxy/CORS handling
- Improved wallet adapter compatibility

## [0.1.4] - 2024-XX-XX

### Fixed
- Token-2022 program detection for SPL transfers

## [0.1.3] - 2024-XX-XX

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

## [0.1.4] - Previous Release

Initial stable release with core x402 payment protocol implementation for Solana.

### Features
- Client-side automatic 402 payment handling
- Server-side payment verification and settlement
- Framework-agnostic wallet adapter support
- TypeScript with full type safety
- Support for Solana mainnet and devnet
