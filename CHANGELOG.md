# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2025-11-11

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
