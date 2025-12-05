/**
 * Tests for customFetch functionality
 * Verifies that custom fetch functions work correctly with x402 client
 */

import { createX402Client } from '../src/client';
import type { WalletAdapter } from '../src/types';
import { VersionedTransaction } from '@solana/web3.js';

// Mock wallet adapter for testing
const mockWallet: WalletAdapter = {
  address: 'TestWalletAddress123456789',
  publicKey: {
    toString: () => 'TestWalletAddress123456789'
  },
  signTransaction: async (tx: VersionedTransaction) => tx
};

describe('CustomFetch', () => {
  describe('Default behavior (no customFetch)', () => {
    it('should create client without customFetch parameter', () => {
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        maxPaymentAmount: BigInt(10000)
      });

      expect(client).toBeDefined();
      expect(typeof client.fetch).toBe('function');
    });

    it('should use native fetch when customFetch is not provided', () => {
      // This test verifies the client can be created without customFetch
      // In a real browser environment, it would use globalThis.fetch
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet'
      });

      expect(client).toBeDefined();
    });
  });

  describe('Custom fetch behavior', () => {
    it('should accept customFetch parameter', () => {
      const customFetch = async (url: string | RequestInfo, init?: RequestInit): Promise<Response> => {
        return new Response(JSON.stringify({ mock: 'response' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch
      });

      expect(client).toBeDefined();
      expect(typeof client.fetch).toBe('function');
    });

    it('should use customFetch for requests', async () => {
      let customFetchCalled = false;
      let capturedUrl: string | RequestInfo | undefined;
      let capturedInit: RequestInit | undefined;

      const customFetch = async (url: string | RequestInfo, init?: RequestInit): Promise<Response> => {
        customFetchCalled = true;
        capturedUrl = url;
        capturedInit = init;

        // Return a non-402 response to avoid payment flow
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch
      });

      // Make a request
      const testUrl = 'https://test-api.com/endpoint';
      await client.fetch(testUrl, {
        method: 'GET'
      });

      // Verify customFetch was called
      expect(customFetchCalled).toBe(true);
      expect(capturedUrl).toBe(testUrl);
      expect(capturedInit).toBeDefined();
    });

    it('should pass through request parameters to customFetch', async () => {
      let capturedMethod: string | undefined;
      let capturedHeaders: HeadersInit | undefined;
      let capturedBody: BodyInit | undefined;

      const customFetch = async (url: string | RequestInfo, init?: RequestInit): Promise<Response> => {
        capturedMethod = init?.method;
        capturedHeaders = init?.headers;
        capturedBody = init?.body;

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch
      });

      const testData = { test: 'data' };
      await client.fetch('https://test-api.com/endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });

      expect(capturedMethod).toBe('POST');
      expect(capturedHeaders).toBeDefined();
      expect(capturedBody).toBe(JSON.stringify(testData));
    });
  });

  describe('Proxy fetch example', () => {
    it('should work with a proxy fetch implementation', async () => {
      // Simulate a proxy fetch that transforms the request
      const proxyFetch = async (url: string | RequestInfo, init?: RequestInit): Promise<Response> => {
        // In a real scenario, this would call a proxy server
        // Here we just verify the proxy pattern works
        const proxyUrl = 'http://localhost:3001/api/proxy';

        // Simulate proxy request/response
        const mockProxyResponse = {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
          data: { proxied: true, originalUrl: url }
        };

        return new Response(
          JSON.stringify(mockProxyResponse.data),
          {
            status: mockProxyResponse.status,
            statusText: mockProxyResponse.statusText,
            headers: new Headers(mockProxyResponse.headers)
          }
        );
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: proxyFetch
      });

      const response = await client.fetch('https://external-api.com/endpoint');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.proxied).toBe(true);
      expect(data.originalUrl).toBe('https://external-api.com/endpoint');
    });

    it('should preserve response headers through proxy', async () => {
      const customHeaders = {
        'X-Custom-Header': 'custom-value',
        'Content-Type': 'application/json'
      };

      const proxyFetch = async (url: string | RequestInfo, init?: RequestInit): Promise<Response> => {
        return new Response(
          JSON.stringify({ success: true }),
          {
            status: 200,
            headers: new Headers(customHeaders)
          }
        );
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: proxyFetch
      });

      const response = await client.fetch('https://test-api.com/endpoint');

      expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('Type safety', () => {
    it('should enforce typeof fetch signature for customFetch', () => {
      // This is a compile-time test - if it compiles, the type is correct
      const validCustomFetch: typeof fetch = async (url: string | RequestInfo, init?: RequestInit) => {
        return new Response('', { status: 200 });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: validCustomFetch
      });

      expect(client).toBeDefined();
    });
  });
});
