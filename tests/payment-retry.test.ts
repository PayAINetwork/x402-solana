import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { createX402Client } from "../src/client";
import { createSolanaPaymentTransaction } from "../src/client/transaction-builder";
import {
  mockWallet,
  v1PaymentRequiredDevnet,
  v2PaymentRequired,
  encodePaymentRequired,
  decodePaymentHeader,
} from "./fixtures";

// Keep these tests focused on native Fetch transport. The local integration
// audit separately exercises the real transaction builder and wallet signer.
jest.mock("../src/client/transaction-builder", () => ({
  createSolanaPaymentTransaction: jest.fn().mockResolvedValue({
    serialize: () => new Uint8Array([1, 2, 3]),
  }),
}));

interface ReceivedRequest {
  method: string | undefined;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

describe("payment retry with native fetch", () => {
  let server: Server;
  let url: string;
  let version: 1 | 2;
  let requests: ReceivedRequest[];
  let initialStatus: 200 | 402;
  const body = JSON.stringify({ prompt: "local fixture" });
  const originalHeaders = {
    Authorization: "Bearer local-fixture",
    "Content-Type": "application/json",
  };

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        method: request.method,
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      if (requests.length === 1 && initialStatus === 402) {
        response.statusCode = 402;
        response.setHeader("Content-Type", "application/json");
        if (version === 2) {
          response.setHeader(
            "PAYMENT-REQUIRED",
            encodePaymentRequired(v2PaymentRequired),
          );
        }
        response.end(JSON.stringify(v1PaymentRequiredDevnet));
      } else {
        response.end("ok");
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a local TCP server");
    }
    url = `http://127.0.0.1:${address.port}/resource`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    requests = [];
    version = 2;
    initialStatus = 402;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function client() {
    return createX402Client({ wallet: mockWallet, network: "solana-devnet" });
  }

  async function expectSuccessfulRetry(
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const response = await client().fetch(input, init);
    expect(await response.text()).toBe("ok");
    expect(requests).toHaveLength(2);
    const [first, retry] = requests as [ReceivedRequest, ReceivedRequest];
    const paymentHeader = version === 2 ? "payment-signature" : "x-payment";
    expect(retry.method).toBe(first.method);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers.authorization).toBe(first.headers.authorization);
    expect(retry.headers["content-type"]).toBe(first.headers["content-type"]);
    expect(retry.headers.authorization).toBe(originalHeaders.Authorization);
    expect(retry.headers[paymentHeader]).toEqual(expect.any(String));
    const payload = decodePaymentHeader(retry.headers[paymentHeader] as string);
    expect(payload).toMatchObject({ x402Version: version });
    return retry;
  }

  describe.each([1, 2] as const)("protocol v%s", (protocolVersion) => {
    beforeEach(() => {
      version = protocolVersion;
    });

    it.each(["object", "Headers", "tuples"])(
      "preserves POST headers supplied as %s",
      async (representation) => {
        const headers: HeadersInit =
          representation === "Headers"
            ? new Headers(originalHeaders)
            : representation === "tuples"
              ? Object.entries(originalHeaders)
              : { ...originalHeaders };
        await expectSuccessfulRetry(url, { method: "POST", headers, body });
        expect(new Headers(headers).get("Authorization")).toBe(
          originalHeaders.Authorization,
        );
        expect(new Headers(headers).has("PAYMENT-SIGNATURE")).toBe(false);
        expect(new Headers(headers).has("X-PAYMENT")).toBe(false);
      },
    );

    it("preserves headers from a GET Request", async () => {
      await expectSuccessfulRetry(
        new Request(url, { headers: originalHeaders }),
      );
    });

    it("supports a URL object without treating it as a Request", async () => {
      await expectSuccessfulRetry(new URL(url), { headers: originalHeaders });
    });

    it("replays a POST Request body after the original is consumed", async () => {
      const request = new Request(url, {
        method: "POST",
        headers: originalHeaders,
        body,
      });
      await expectSuccessfulRetry(request);
      expect(request.bodyUsed).toBe(true);
      expect(request.headers.has("PAYMENT-SIGNATURE")).toBe(false);
      expect(request.headers.has("X-PAYMENT")).toBe(false);
    });

    it("uses init.headers as a replacement for Request headers", async () => {
      const retry = await expectSuccessfulRetry(
        new Request(url, {
          method: "POST",
          headers: { "X-Request-Only": "must-not-leak" },
          body,
        }),
        { headers: new Headers(originalHeaders) },
      );
      expect(retry.headers["x-request-only"]).toBeUndefined();
    });

    it("preserves init.body overriding a Request body", async () => {
      await expectSuccessfulRetry(
        new Request(url, {
          method: "POST",
          headers: originalHeaders,
          body: "must-not-be-sent",
        }),
        { body },
      );
      expect(requests[1]?.body.toString()).toBe(body);
    });

    it("replays a Request body when init.body is explicitly null", async () => {
      await expectSuccessfulRetry(
        new Request(url, { method: "POST", headers: originalHeaders, body }),
        { body: null },
      );
      expect(requests[1]?.body.toString()).toBe(body);
    });

    it("accepts an already consumed Request when init.body replaces its body", async () => {
      const request = new Request(url, {
        method: "POST",
        headers: originalHeaders,
        body: "already consumed",
      });
      await request.text();
      await expectSuccessfulRetry(request, { body });
      expect(requests[1]?.body.toString()).toBe(body);
    });

    it("replays a stream supplied through a Request body", async () => {
      const init: RequestInit & { duplex: "half" } = {
        method: "POST",
        headers: originalHeaders,
        duplex: "half",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
      };
      await expectSuccessfulRetry(new Request(url, init));
    });

    it("replaces an existing payment header regardless of its casing", async () => {
      const paymentHeader = version === 2 ? "payment-signature" : "x-payment";
      await expectSuccessfulRetry(url, {
        method: "POST",
        headers: { ...originalHeaders, [paymentHeader]: "stale" },
        body,
      });
    });

    it("preserves multipart Request bytes and their content-type boundary", async () => {
      const form = new FormData();
      form.append("prompt", "local fixture");
      form.append(
        "file",
        new Blob([new Uint8Array([0, 1, 255])]),
        "fixture.bin",
      );
      await expectSuccessfulRetry(
        new Request(url, {
          method: "POST",
          headers: { Authorization: originalHeaders.Authorization },
          body: form,
        }),
      );
      expect(requests[1]?.headers["content-type"]).toContain(
        "multipart/form-data; boundary=",
      );
      expect(requests[1]?.body.includes(Buffer.from([0, 1, 255]))).toBe(true);
    });

    it("rejects a one-shot init.body stream before signing after a 402", async () => {
      const init: RequestInit & { duplex: "half" } = {
        method: "POST",
        headers: originalHeaders,
        duplex: "half",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
      };
      await expect(client().fetch(url, init)).rejects.toThrow(
        "Cannot retry a ReadableStream passed as init.body",
      );
      expect(requests).toHaveLength(1);
      expect(createSolanaPaymentTransaction).not.toHaveBeenCalled();
    });
  });

  function captureUnusedClone(request: Request) {
    const clone = request.clone();
    if (!clone.body) throw new Error("Expected a Request with a body");
    const cancel = jest.spyOn(clone.body, "cancel");
    jest.spyOn(request, "clone").mockReturnValue(clone);
    return cancel;
  }

  it("releases the unused clone for a non-402 response", async () => {
    initialStatus = 200;
    const request = new Request(url, {
      method: "POST",
      headers: originalHeaders,
      body,
    });
    const cancel = captureUnusedClone(request);
    const response = await client().fetch(request);
    expect(await response.text()).toBe("ok");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(1);
    expect(createSolanaPaymentTransaction).not.toHaveBeenCalled();
  });

  it("releases the unused clone when payment exceeds the amount limit", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: originalHeaders,
      body,
    });
    const cancel = captureUnusedClone(request);
    const cappedClient = createX402Client({
      wallet: mockWallet,
      network: "solana-devnet",
      amount: 1n,
    });
    await expect(cappedClient.fetch(request)).rejects.toThrow(
      "Payment amount exceeds maximum allowed",
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(createSolanaPaymentTransaction).not.toHaveBeenCalled();
  });

  it("releases the clone without signing or retrying when the caller aborts after the 402", async () => {
    const controller = new AbortController();
    const request = new Request(url, {
      method: "POST",
      headers: originalHeaders,
      body,
      signal: controller.signal,
    });
    const cancel = captureUnusedClone(request);
    const abortingClient = createX402Client({
      wallet: mockWallet,
      network: "solana-devnet",
      beforePayment: async () => controller.abort(),
    });
    await expect(abortingClient.fetch(request)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(1);
    expect(createSolanaPaymentTransaction).not.toHaveBeenCalled();
  });

  it("passes through an init.body stream when no payment is required", async () => {
    initialStatus = 200;
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: originalHeaders,
      duplex: "half",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
    };
    const response = await client().fetch(new URL(url), init);
    expect(await response.text()).toBe("ok");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.toString()).toBe(body);
    expect(createSolanaPaymentTransaction).not.toHaveBeenCalled();
  });

  it("rejects invalid header values before signing with a customFetch adapter", async () => {
    const customFetch = jest.fn(
      async () =>
        new Response(JSON.stringify(v1PaymentRequiredDevnet), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const customClient = createX402Client({
      wallet: mockWallet,
      network: "solana-devnet",
      customFetch,
    });
    await expect(
      customClient.fetch("/relative-custom-fetch", {
        headers: { "X-Title": "한글" },
      }),
    ).rejects.toThrow(/ByteString/);
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(createSolanaPaymentTransaction).not.toHaveBeenCalled();
  });

  it("does not require a ReadableStream global for replayable bodies", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "ReadableStream",
    );
    Object.defineProperty(globalThis, "ReadableStream", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      await expectSuccessfulRetry(url, {
        method: "POST",
        headers: originalHeaders,
        body,
      });
    } finally {
      if (descriptor)
        Object.defineProperty(globalThis, "ReadableStream", descriptor);
    }
  });

  it("preserves plain-object header key casing for customFetch adapters", async () => {
    const customFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input, init) => {
        if (customFetch.mock.calls.length === 1) {
          return new Response(JSON.stringify(v1PaymentRequiredDevnet), {
            status: 402,
            headers: { "Content-Type": "application/json" },
          });
        }
        expect(init?.headers).toMatchObject(originalHeaders);
        expect((init?.headers as Record<string, string>)["X-PAYMENT"]).toEqual(
          expect.any(String),
        );
        return new Response("ok");
      },
    );
    const customClient = createX402Client({
      wallet: mockWallet,
      network: "solana-devnet",
      customFetch,
    });
    const response = await customClient.fetch("/relative-custom-fetch", {
      method: "POST",
      headers: originalHeaders,
      body,
    });
    expect(await response.text()).toBe("ok");
    expect(customFetch).toHaveBeenCalledTimes(2);
  });
});
