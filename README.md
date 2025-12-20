# x402-solana

A reusable, framework-agnostic implementation of the x402 payment protocol v2 for Solana clients (browsers) and servers.

## Features

✅ **x402 Protocol v2** - Full support for the latest x402 specification  
✅ **CAIP-2 Networks** - Uses standardized chain identifiers (`solana:chainId`)  
✅ **Client-side** - Automatic 402 payment handling with any wallet provider  
✅ **Server-side** - Payment verification and settlement with facilitator  
✅ **Framework agnostic** - Works with any wallet provider (Privy, Phantom, etc.)  
✅ **HTTP framework agnostic** - Works with Next.js, Express, Fastify, etc.  
✅ **TypeScript** - Full type safety with Zod validation  
✅ **Web3.js** - Built on @solana/web3.js and @solana/spl-token

## Installation

```bash
pnpm add @payai/x402-solana
```

Or with npm:

```bash
npm install @payai/x402-solana
```

Or with yarn:

```bash
yarn add @payai/x402-solana
```

## x402 v2 Protocol Changes

This package implements x402 protocol v2. Key changes from v1:

| Feature               | v1                                 | v2                                        |
| --------------------- | ---------------------------------- | ----------------------------------------- |
| **Network Format**    | Simple (`solana`, `solana-devnet`) | CAIP-2 (`solana:chainId`)                 |
| **Payment Header**    | `X-PAYMENT`                        | `PAYMENT-SIGNATURE`                       |
| **Amount Field**      | `maxAmountRequired`                | `amount`                                  |
| **Payload Structure** | Flat                               | Includes `resource` and `accepted` fields |

The library handles network format conversion automatically - you can use simple names in your configuration.

## Usage

### Client Side (React/Frontend)

The x402-solana client works with any wallet provider that implements the `WalletAdapter` interface. Below are examples using both Solana Wallet Adapter and Privy.

#### Option 1: Using Solana Wallet Adapter (Recommended)

First, install the required packages:

```bash
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/wallet-adapter-base
```

Setup your wallet provider in your app root (e.g., `_app.tsx` or `layout.tsx`):

```typescript
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  BackpackWalletAdapter,
} from '@solana/wallet-adapter-wallets';

// Import styles
import '@solana/wallet-adapter-react-ui/styles.css';

export default function App({ Component, pageProps }) {
  const network = WalletAdapterNetwork.Devnet; // or Mainnet
  const endpoint = useMemo(() => 'https://api.devnet.solana.com', []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Component {...pageProps} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

Use in your component:

```typescript
import { createX402Client } from '@payai/x402-solana/client';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function MyComponent() {
  const wallet = useWallet();

  const handlePaidRequest = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      console.error('Wallet not connected');
      return;
    }

    // Create x402 client
    const client = createX402Client({
      wallet: {
        address: wallet.publicKey.toString(),
        signTransaction: async (tx) => {
          if (!wallet.signTransaction) throw new Error('Wallet does not support signing');
          return await wallet.signTransaction(tx);
        },
      },
      network: 'solana-devnet', // Simple format - automatically converted to CAIP-2
      amount: BigInt(10_000_000), // Optional: max 10 USDC safety limit
    });

    // Make a paid request - automatically handles 402 payments
    const response = await client.fetch('/api/paid-endpoint', {
      method: 'POST',
      body: JSON.stringify({ data: 'your request' }),
    });

    const result = await response.json();
    console.log('Result:', result);
  };

  return (
    <div>
      <WalletMultiButton />
      <button onClick={handlePaidRequest} disabled={!wallet.connected}>
        Make Paid Request
      </button>
    </div>
  );
}
```

#### Option 2: Using Privy

```typescript
import { createX402Client } from '@payai/x402-solana/client';
import { useSolanaWallets } from '@privy-io/react-auth/solana';

function MyComponent() {
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];

  // Create x402 client
  const client = createX402Client({
    wallet,
    network: 'solana-devnet',
    amount: BigInt(10_000_000), // Optional: max 10 USDC
  });

  // Make a paid request - automatically handles 402 payments
  const response = await client.fetch('/api/paid-endpoint', {
    method: 'POST',
    body: JSON.stringify({ data: 'your request' }),
  });

  const result = await response.json();
}
```

#### Using with a Proxy Server (CORS Bypass)

If you're making requests from a browser to external APIs and encountering CORS issues, you can provide a custom fetch function that routes requests through your proxy server:

```typescript
import { createX402Client } from '@payai/x402-solana/client';
import { useWallet } from '@solana/wallet-adapter-react';

function MyComponent() {
  const wallet = useWallet();

  // Create a custom fetch function that uses your proxy
  const createProxyFetch = () => {
    const proxyUrl = process.env.NEXT_PUBLIC_PROXY_URL || 'http://localhost:3001/api/proxy';

    return async (url: string | RequestInfo, init?: RequestInit): Promise<Response> => {
      // Send request through proxy server
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: typeof url === 'string' ? url : url.toString(),
          method: init?.method || 'GET',
          headers: init?.headers || {},
          body: init?.body
        })
      });

      const proxyData = await response.json();

      // Reconstruct Response object with original status
      return new Response(
        typeof proxyData.data === 'string' ? proxyData.data : JSON.stringify(proxyData.data),
        {
          status: proxyData.status,
          statusText: proxyData.statusText || '',
          headers: new Headers(proxyData.headers || {})
        }
      );
    };
  };

  const handlePaidRequest = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      console.error('Wallet not connected');
      return;
    }

    // Create x402 client with custom fetch
    const client = createX402Client({
      wallet: {
        address: wallet.publicKey.toString(),
        signTransaction: async (tx) => {
          if (!wallet.signTransaction) throw new Error('Wallet does not support signing');
          return await wallet.signTransaction(tx);
        },
      },
      network: 'solana-devnet',
      amount: BigInt(10_000_000),
      customFetch: createProxyFetch() // Use proxy for all requests
    });

    // All requests now go through your proxy server
    const response = await client.fetch('https://external-api.com/endpoint', {
      method: 'POST',
      body: JSON.stringify({ data: 'your request' }),
    });

    const result = await response.json();
    console.log('Result:', result);
  };

  return (
    <button onClick={handlePaidRequest} disabled={!wallet.connected}>
      Make Paid Request (via Proxy)
    </button>
  );
}
```

**Benefits of using a proxy:**

- Bypasses browser CORS restrictions
- Allows requests to any external x402 endpoint
- Enables custom request/response logging
- Provides a single point for request monitoring

**Note:** You need to set up your own proxy server. The `customFetch` parameter is optional - if not provided, the SDK uses the native `fetch` function.

#### Proxy Server Implementation

To use `customFetch` with a proxy, you need to implement a proxy server endpoint. Here's a complete example:

**Next.js API Route** (`app/api/proxy/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url, method, headers, body } = await req.json();

    // Validate inputs
    if (!url || !method) {
      return NextResponse.json({ error: 'url and method required' }, { status: 400 });
    }

    // Prepare headers (preserve x402 payment headers)
    const requestHeaders: Record<string, string> = {
      'Content-Type': headers?.['Content-Type'] || 'application/json',
      'User-Agent': 'x402-solana-proxy/1.0',
      ...(headers || {}),
    };

    // Remove problematic headers
    delete requestHeaders['host'];
    delete requestHeaders['content-length'];

    // Make request to target endpoint
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: requestHeaders,
    };

    if (method.toUpperCase() !== 'GET' && body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Parse response
    const contentType = response.headers.get('content-type') || '';
    let responseData: unknown;

    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    // Prepare response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (
        !['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())
      ) {
        responseHeaders[key] = value;
      }
    });

    // IMPORTANT: Return 200 with real status in body
    // This allows proper x402 402 Payment Required handling
    return NextResponse.json(
      {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: responseData,
        contentType,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Proxy] Error:', message);
    return NextResponse.json(
      {
        error: 'Proxy request failed',
        details: message,
      },
      { status: 500 }
    );
  }
}
```

**Express Server** (`server.js`):

```typescript
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/proxy', async (req, res) => {
  try {
    const { url, method, headers, body } = req.body;

    if (!url || !method) {
      return res.status(400).json({ error: 'url and method required' });
    }

    const requestHeaders = {
      'Content-Type': headers?.['Content-Type'] || 'application/json',
      ...(headers || {}),
    };

    delete requestHeaders['host'];
    delete requestHeaders['content-length'];

    const fetchOptions = {
      method: method.toUpperCase(),
      headers: requestHeaders,
    };

    if (method.toUpperCase() !== 'GET' && body) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    let responseData;
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      if (
        !['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())
      ) {
        responseHeaders[key] = value;
      }
    });

    // Return 200 with real status in body for x402 compatibility
    res.status(200).json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data: responseData,
      contentType,
    });
  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Proxy request failed',
      details: error.message,
    });
  }
});

app.listen(3001, () => console.log('Proxy server running on port 3001'));
```

**Key Points:**

- Always return HTTP 200 from proxy, with real status code in the response body
- This is critical for x402 402 Payment Required responses to work correctly
- Preserve x402 headers (`PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`)
- Remove problematic headers (`host`, `content-length`)

### Server Side (Next.js API Route)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { X402PaymentHandler } from '@payai/x402-solana/server';

const x402 = new X402PaymentHandler({
  network: 'solana-devnet', // Simple format - automatically converted to CAIP-2
  treasuryAddress: process.env.TREASURY_WALLET_ADDRESS!,
  facilitatorUrl: 'https://facilitator.payai.network',
});

export async function POST(req: NextRequest) {
  const resourceUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/chat`;

  // 1. Extract payment header (v2 uses PAYMENT-SIGNATURE)
  const paymentHeader = x402.extractPayment(req.headers);

  // 2. Create payment requirements
  const paymentRequirements = await x402.createPaymentRequirements(
    {
      amount: '2500000', // $2.50 USDC (in micro-units, as string)
      asset: {
        address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
        decimals: 6,
      },
      description: 'AI Chat Request',
    },
    resourceUrl
  );

  if (!paymentHeader) {
    // Return 402 with v2 payment requirements
    const response = x402.create402Response(paymentRequirements, resourceUrl);
    return NextResponse.json(response.body, { status: response.status });
  }

  // 3. Verify payment
  const verified = await x402.verifyPayment(paymentHeader, paymentRequirements);
  if (!verified.isValid) {
    return NextResponse.json(
      {
        error: 'Invalid payment',
        reason: verified.invalidReason,
      },
      { status: 402 }
    );
  }

  // 4. Process your business logic
  const result = await yourBusinessLogic(req);

  // 5. Settle payment
  const settlement = await x402.settlePayment(paymentHeader, paymentRequirements);
  if (!settlement.success) {
    console.error('Settlement failed:', settlement.errorReason);
  }

  // 6. Return response
  return NextResponse.json(result);
}
```

### Server Side (Express)

```typescript
import express from 'express';
import { X402PaymentHandler } from '@payai/x402-solana/server';

const app = express();
const x402 = new X402PaymentHandler({
  network: 'solana-devnet',
  treasuryAddress: process.env.TREASURY_WALLET_ADDRESS!,
  facilitatorUrl: 'https://facilitator.payai.network',
});

app.post('/api/paid-endpoint', async (req, res) => {
  const resourceUrl = `${process.env.BASE_URL}/api/paid-endpoint`;
  const paymentHeader = x402.extractPayment(req.headers);

  const paymentRequirements = await x402.createPaymentRequirements(
    {
      amount: '2500000', // $2.50 USDC
      asset: {
        address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
        decimals: 6,
      },
      description: 'API Request',
    },
    resourceUrl
  );

  if (!paymentHeader) {
    const response = x402.create402Response(paymentRequirements, resourceUrl);
    return res.status(response.status).json(response.body);
  }

  const verified = await x402.verifyPayment(paymentHeader, paymentRequirements);
  if (!verified.isValid) {
    return res.status(402).json({
      error: 'Invalid payment',
      reason: verified.invalidReason,
    });
  }

  const result = await yourBusinessLogic(req);
  await x402.settlePayment(paymentHeader, paymentRequirements);

  res.json(result);
});
```

## API Reference

### Client

#### createX402Client(config)

Creates a new x402 client instance.

**Config:**

```typescript
{
  wallet: WalletAdapter;              // Wallet with signTransaction method
  network: 'solana' | 'solana-devnet'; // Simple network format
  rpcUrl?: string;                    // Optional custom RPC
  amount?: bigint;                    // Optional safety limit (max payment)
  customFetch?: typeof fetch;         // Optional custom fetch for proxy support
  verbose?: boolean;                  // Optional debug logging
}
```

**Methods:**

- `client.fetch(input, init)` - Make a fetch request with automatic payment handling

### Server

#### new X402PaymentHandler(config)

Creates a new payment handler instance.

**Config:**

```typescript
{
  network: 'solana' | 'solana-devnet'; // Simple network format
  treasuryAddress: string;            // Where payments are sent
  facilitatorUrl: string;             // Facilitator service URL
  rpcUrl?: string;                    // Optional custom RPC
  defaultToken?: TokenAsset;          // Optional default token (auto-detected)
  defaultDescription?: string;        // Optional default description
  defaultTimeoutSeconds?: number;     // Optional timeout (default: 300)
}
```

**Methods:**

- `extractPayment(headers)` - Extract PAYMENT-SIGNATURE header from request
- `createPaymentRequirements(routeConfig, resourceUrl)` - Create payment requirements object
- `create402Response(requirements, resourceUrl)` - Create 402 response body (v2 format)
- `verifyPayment(header, requirements)` - Verify payment with facilitator
- `settlePayment(header, requirements)` - Settle payment with facilitator
- `getNetwork()` - Get the network in CAIP-2 format
- `getTreasuryAddress()` - Get the treasury address

#### RouteConfig Format

The `createPaymentRequirements` method expects:

```typescript
{
  amount: string;              // Payment amount in atomic units (string)
  asset: {
    address: string;           // Token mint address (USDC)
    decimals: number;          // Token decimals (6 for USDC)
  },
  description?: string;        // Optional human-readable description
  mimeType?: string;           // Optional, defaults to 'application/json'
  maxTimeoutSeconds?: number;  // Optional, defaults to 300
}
```

## Network Configuration

### CAIP-2 Network Identifiers

x402 v2 uses [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) format for network identifiers:

| Network | Simple Format   | CAIP-2 Format                             |
| ------- | --------------- | ----------------------------------------- |
| Mainnet | `solana`        | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Devnet  | `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

The library automatically converts simple network names to CAIP-2 format internally. You can use either format in your configuration.

### Network Utility Functions

```typescript
import {
  toCAIP2Network,
  toSimpleNetwork,
  isSolanaNetwork,
  isSolanaMainnet,
  isSolanaDevnet,
} from '@payai/x402-solana/types';

// Convert between formats
const caip2 = toCAIP2Network('solana-devnet'); // 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
const simple = toSimpleNetwork('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'); // 'solana-devnet'

// Type guards
isSolanaNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'); // true
isSolanaMainnet('solana'); // true
isSolanaDevnet('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'); // true
```

## Configuration

### Environment Variables

```bash
# Network (optional, defaults to devnet)
NEXT_PUBLIC_NETWORK=solana-devnet

# Treasury wallet address (where payments are sent)
TREASURY_WALLET_ADDRESS=your_treasury_address

# Optional: Custom RPC URLs
NEXT_PUBLIC_SOLANA_RPC_DEVNET=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_RPC_MAINNET=https://api.mainnet-beta.solana.com

# Base URL for resource field
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### USDC Mint Addresses

When creating payment requirements, you need to specify the USDC token mint address:

- **Devnet**: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- **Mainnet**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

**Example with environment-based selection:**

```typescript
const USDC_MINT =
  process.env.NODE_ENV === 'production'
    ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // mainnet
    : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // devnet

const paymentRequirements = await x402.createPaymentRequirements(
  {
    amount: '1000000', // $1.00 USDC
    asset: {
      address: USDC_MINT,
      decimals: 6,
    },
    description: 'Payment',
  },
  `${process.env.BASE_URL}/api/endpoint`
);
```

### Wallet Adapter Interface

The package works with any wallet that implements this interface:

```typescript
interface WalletAdapter {
  // Support for Anza wallet-adapter standard
  publicKey?: { toString(): string };
  // Alternative for custom implementations
  address?: string;
  // Required for signing
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}
```

#### Compatible Wallet Providers

**Solana Wallet Adapter (@solana/wallet-adapter-react)**

The official Solana wallet adapter provides the most flexibility and supports multiple wallets:

```typescript
import { useWallet } from '@solana/wallet-adapter-react';

const wallet = useWallet();
const walletAdapter = {
  publicKey: wallet.publicKey,
  signTransaction: wallet.signTransaction,
};
```

**Privy (@privy-io/react-auth)**

Privy wallets work out of the box:

```typescript
import { useSolanaWallets } from '@privy-io/react-auth/solana';

const { wallets } = useSolanaWallets();
const wallet = wallets[0]; // Already implements the interface
```

**Direct Wallet SDKs**

You can also use wallet SDKs directly:

```typescript
// Phantom
const phantomProvider = window.phantom?.solana;
const walletAdapter = {
  address: phantomProvider.publicKey.toString(),
  signTransaction: tx => phantomProvider.signTransaction(tx),
};

// Solflare
const solflareProvider = window.solflare;
const walletAdapter = {
  address: solflareProvider.publicKey.toString(),
  signTransaction: tx => solflareProvider.signTransaction(tx),
};
```

## Payment Amounts

Payment amounts are in USDC micro-units (6 decimals) as **strings**:

- 1 USDC = `"1000000"` micro-units
- $0.01 = `"10000"` micro-units
- $2.50 = `"2500000"` micro-units

**Helper functions:**

```typescript
import { toAtomicUnits, fromAtomicUnits } from '@payai/x402-solana/utils';

const microUnits = toAtomicUnits(2.5, 6); // "2500000"
const usd = fromAtomicUnits('2500000', 6); // 2.5
```

## Testing

Run the test suite:

```bash
npm test
```

The tests verify:

✅ Package imports work correctly  
✅ Client can be created with wallet adapter  
✅ Automatic 402 payment handling works  
✅ Transaction signing and submission succeed  
✅ Payment verification and settlement complete

## Architecture

```
src/
├── client/                    # Client-side code
│   ├── transaction-builder.ts # Solana transaction construction
│   ├── payment-interceptor.ts # 402 payment fetch interceptor
│   └── index.ts              # Main client export
├── server/                    # Server-side code
│   ├── facilitator-client.ts # Facilitator API communication
│   ├── payment-handler.ts    # Payment verification & settlement
│   └── index.ts              # Main server export
├── types/                     # TypeScript types
│   ├── x402-protocol.ts      # x402 v2 spec types (CAIP-2 networks)
│   ├── solana-payment.ts     # Solana-specific types
│   └── index.ts
├── utils/                     # Utilities
│   ├── helpers.ts            # Helper functions
│   └── index.ts
└── index.ts                   # Main package export
```

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### Type Checking

```bash
npm run typecheck
```

### Building

```bash
npm run build
```

## Migration from v0.1.x

See [CHANGELOG.md](./CHANGELOG.md) for detailed migration guide.

**Quick migration steps:**

1. **Update package**: Install the new version
2. **Network format**: The library handles CAIP-2 conversion automatically - no code changes needed
3. **Amount field**: Update `maxAmountRequired` to `amount` if you were using it directly
4. **Headers**: The client now sends `PAYMENT-SIGNATURE` instead of `X-PAYMENT`
5. **Facilitator**: Ensure your facilitator supports x402 v2 endpoints

## Future Enhancements

- [ ] Add @solana/kit adapter for AI agents
- [ ] Support for multiple payment tokens
- [ ] Add transaction retry logic
- [ ] Support for partial payments
- [ ] Extensions support (SIWx, Discovery)

## License

MIT

## Credits

Built on top of:

- [x402 Protocol](https://github.com/coinbase/x402)
- [@solana/web3.js](https://github.com/solana-labs/solana-web3.js)
- [PayAI Network](https://payai.network)

## Support

- GitHub: [github.com/payainetwork/x402-solana](https://github.com/payainetwork/x402-solana)
- Issues: [github.com/payainetwork/x402-solana/issues](https://github.com/payainetwork/x402-solana/issues)

## Version

Current version: `1.0.0-canary.1` (x402 Protocol v2)

**Note:** This is a canary release for x402 v2. The API is stabilizing but may have minor changes before the stable 1.0.0 release.
