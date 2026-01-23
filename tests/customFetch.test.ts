/**
 * Tests for customFetch functionality
 * Verifies that custom fetch functions work correctly with x402 client
 */

import { createX402Client } from '../src/client';
import {
  mockWallet,
  createMockWallet,
  createSuccessResponse,
  createV1PaymentRequiredResponse,
  createV2PaymentRequiredResponse,
} from './fixtures';

describe('CustomFetch', () => {
  describe('Default behavior (no customFetch)', () => {
    it('should create client without customFetch parameter', () => {
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        amount: BigInt(10000),
      });

      expect(client).toBeDefined();
      expect(typeof client.fetch).toBe('function');
    });

    it('should use native fetch when customFetch is not provided', () => {
      // This test verifies the client can be created without customFetch
      // In a real browser environment, it would use globalThis.fetch
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
      });

      expect(client).toBeDefined();
    });
  });

  describe('Custom fetch behavior', () => {
    it('should accept customFetch parameter', () => {
      const customFetch = async (): Promise<Response> => {
        return createSuccessResponse({ mock: 'response' });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch,
      });

      expect(client).toBeDefined();
      expect(typeof client.fetch).toBe('function');
    });

    it('should use customFetch for requests', async () => {
      let customFetchCalled = false;
      let capturedUrl: string | RequestInfo | undefined;
      let capturedInit: RequestInit | undefined;

      const customFetch = async (
        url: string | RequestInfo,
        init?: RequestInit
      ): Promise<Response> => {
        customFetchCalled = true;
        capturedUrl = url;
        capturedInit = init;

        // Return a non-402 response to avoid payment flow
        return createSuccessResponse();
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch,
      });

      // Make a request
      const testUrl = 'https://test-api.com/endpoint';
      await client.fetch(testUrl, {
        method: 'GET',
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

      const customFetch = async (
        _url: string | RequestInfo,
        init?: RequestInit
      ): Promise<Response> => {
        capturedMethod = init?.method;
        capturedHeaders = init?.headers;
        capturedBody = init?.body;

        return createSuccessResponse();
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch,
      });

      const testData = { test: 'data' };
      await client.fetch('https://test-api.com/endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
      });

      expect(capturedMethod).toBe('POST');
      expect(capturedHeaders).toBeDefined();
      expect(capturedBody).toBe(JSON.stringify(testData));
    });
  });

  describe('Proxy fetch example', () => {
    it('should work with a proxy fetch implementation', async () => {
      // Simulate a proxy fetch that transforms the request
      const proxyFetch = async (
        url: string | RequestInfo,
        _init?: RequestInit
      ): Promise<Response> => {
        // Simulate proxy request/response
        return new Response(
          JSON.stringify({ proxied: true, originalUrl: url }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          }
        );
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: proxyFetch,
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
        'Content-Type': 'application/json',
      };

      const proxyFetch = async (): Promise<Response> => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: new Headers(customHeaders),
        });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: proxyFetch,
      });

      const response = await client.fetch('https://test-api.com/endpoint');

      expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('Type safety', () => {
    it('should enforce typeof fetch signature for customFetch', () => {
      // This is a compile-time test - if it compiles, the type is correct
      const validCustomFetch: typeof fetch = async () => {
        return new Response('', { status: 200 });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch: validCustomFetch,
      });

      expect(client).toBeDefined();
    });
  });

  describe('Client configuration', () => {
    it('should accept custom wallet', () => {
      const customWallet = createMockWallet('CustomWalletAddress1234567890123456');

      const client = createX402Client({
        wallet: customWallet,
        network: 'solana-devnet',
      });

      expect(client).toBeDefined();
    });

    it('should accept mainnet network', () => {
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana',
      });

      expect(client).toBeDefined();
    });

    it('should accept custom RPC URL', () => {
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        rpcUrl: 'https://custom-rpc.example.com',
      });

      expect(client).toBeDefined();
    });

    it('should accept verbose flag', () => {
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        verbose: true,
      });

      expect(client).toBeDefined();
    });

    it('should accept amount limit', () => {
      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        amount: BigInt(1000000),
      });

      expect(client).toBeDefined();
    });
  });

  describe('Payment flow integration', () => {
    it('should not retry for 200 responses', async () => {
      let requestCount = 0;

      const customFetch = async (): Promise<Response> => {
        requestCount++;
        return createSuccessResponse({ data: 'success' });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch,
      });

      await client.fetch('https://test-api.com/endpoint');

      expect(requestCount).toBe(1);
    });

    it('should not retry for 4xx responses other than 402', async () => {
      let requestCount = 0;

      const customFetch = async (): Promise<Response> => {
        requestCount++;
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch,
      });

      const response = await client.fetch('https://test-api.com/endpoint');

      expect(requestCount).toBe(1);
      expect(response.status).toBe(404);
    });

    it('should not retry for 5xx responses', async () => {
      let requestCount = 0;

      const customFetch = async (): Promise<Response> => {
        requestCount++;
        return new Response(JSON.stringify({ error: 'Server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createX402Client({
        wallet: mockWallet,
        network: 'solana-devnet',
        customFetch,
      });

      const response = await client.fetch('https://test-api.com/endpoint');

      expect(requestCount).toBe(1);
      expect(response.status).toBe(500);
    });
  });
});
