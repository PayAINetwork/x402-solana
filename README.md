# x402-solana

A reusable, framework-agnostic implementation of the x402 payment protocol for clients (browsers) and servers Solana.

## Features

✅ Client-side: Automatic 402 payment handling with any wallet provider  
✅ Server-side: Payment verification and settlement with facilitator  
✅ Framework agnostic: Works with any wallet provider (Privy, Phantom, etc.)  
✅ HTTP framework agnostic: Works with Next.js, Express, Fastify, etc.  
✅ TypeScript: Full type safety with Zod validation  
✅ Web3.js: Built on @solana/web3.js and @solana/spl-token  

## Installation

```bash
pnpm add x402-solana
```

Or with npm:

```bash
npm install x402-solana
```

Or with yarn:

```bash
yarn add x402-solana
```

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
import { createX402Client } from 'x402-solana/client';
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
      network: 'solana-devnet',
      maxPaymentAmount: BigInt(10_000_000), // Optional: max 10 USDC
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
import { createX402Client } from 'x402-solana/client';
import { useSolanaWallets } from '@privy-io/react-auth/solana';

function MyComponent() {
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];

  // Create x402 client
  const client = createX402Client({
    wallet,
    network: 'solana-devnet',
    maxPaymentAmount: BigInt(10_000_000), // Optional: max 10 USDC
  });

  // Make a paid request - automatically handles 402 payments
  const response = await client.fetch('/api/paid-endpoint', {
    method: 'POST',
    body: JSON.stringify({ data: 'your request' }),
  });

  const result = await response.json();
}
```

### Server Side (Next.js API Route)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { X402PaymentHandler } from 'x402-solana/server';

const x402 = new X402PaymentHandler({
  network: 'solana-devnet',
  treasuryAddress: process.env.TREASURY_WALLET_ADDRESS!,
  facilitatorUrl: 'https://facilitator.payai.network',
});

export async function POST(req: NextRequest) {
  // 1. Extract payment header
  const paymentHeader = x402.extractPayment(req.headers);
  
  // 2. Create payment requirements using x402 RouteConfig format
  const paymentRequirements = await x402.createPaymentRequirements({
    price: {
      amount: "2500000",  // $2.50 USDC (in micro-units, as string)
      asset: {
        address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // USDC devnet mint
      }
    },
    network: 'solana-devnet',
    config: {
      description: 'AI Chat Request',
      resource: `${process.env.NEXT_PUBLIC_BASE_URL}/api/chat`,
    }
  });
  
  if (!paymentHeader) {
    // Return 402 with payment requirements
    const response = x402.create402Response(paymentRequirements);
    return NextResponse.json(response.body, { status: response.status });
  }

  // 3. Verify payment
  const verified = await x402.verifyPayment(paymentHeader, paymentRequirements);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid payment' }, { status: 402 });
  }

  // 4. Process your business logic
  const result = await yourBusinessLogic(req);

  // 5. Settle payment
  await x402.settlePayment(paymentHeader, paymentRequirements);

  // 6. Return response
  return NextResponse.json(result);
}
```

### Server Side (Express)

```typescript
import express from 'express';
import { X402PaymentHandler } from 'x402-solana/server';

const app = express();
const x402 = new X402PaymentHandler({
  network: 'solana-devnet',
  treasuryAddress: process.env.TREASURY_WALLET_ADDRESS!,
  facilitatorUrl: 'https://facilitator.payai.network',
});

app.post('/api/paid-endpoint', async (req, res) => {
  const paymentHeader = x402.extractPayment(req.headers);
  
  const paymentRequirements = await x402.createPaymentRequirements({
    price: {
      amount: "2500000",  // $2.50 USDC
      asset: {
        address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // USDC devnet
      }
    },
    network: 'solana-devnet',
    config: {
      description: 'API Request',
      resource: `${process.env.BASE_URL}/api/paid-endpoint`,
    }
  });
  
  if (!paymentHeader) {
    const response = x402.create402Response(paymentRequirements);
    return res.status(response.status).json(response.body);
  }

  const verified = await x402.verifyPayment(paymentHeader, paymentRequirements);
  if (!verified) {
    return res.status(402).json({ error: 'Invalid payment' });
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
  network: 'solana' | 'solana-devnet';
  rpcUrl?: string;                    // Optional custom RPC
  maxPaymentAmount?: bigint;          // Optional safety limit
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
  network: 'solana' | 'solana-devnet';
  treasuryAddress: string;            // Where payments are sent
  facilitatorUrl: string;             // Facilitator service URL
  rpcUrl?: string;                    // Optional custom RPC
  defaultToken?: string;              // Optional default token mint (auto-detected)
  middlewareConfig?: object;          // Optional middleware configuration
}
```

**Methods:**

- `extractPayment(headers)` - Extract X-PAYMENT header from request
- `createPaymentRequirements(routeConfig)` - Create payment requirements object
- `create402Response(requirements)` - Create 402 response body
- `verifyPayment(header, requirements)` - Verify payment with facilitator
- `settlePayment(header, requirements)` - Settle payment with facilitator

#### RouteConfig Format

The `createPaymentRequirements` method expects an x402 `RouteConfig` object:

```typescript
{
  price: {
    amount: string;           // Payment amount in token micro-units (string)
    asset: {
      address: string;        // Token mint address (USDC)
    }
  },
  network: 'solana' | 'solana-devnet';
  config: {
    description: string;      // Human-readable description
    resource: string;         // API endpoint URL
    mimeType?: string;        // Optional, defaults to 'application/json'
    maxTimeoutSeconds?: number; // Optional, defaults to 300
    discoverable?: boolean;   // Optional, makes endpoint discoverable in x402 Bazaar, x402scan etc
    inputSchema?: object;     // Optional input schema for API documentation
    outputSchema?: object;    // Optional response schema
  }
}
```

## x402 Ecosystem Discoverability

To make your API discoverable in x402 ecosystem services (like [x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar), x402scan, and other discovery platforms), set `discoverable: true` in your route config:

```typescript
const paymentRequirements = await x402.createPaymentRequirements({
  price: {
    amount: "1000000",  // $1.00 USDC
    asset: {
      address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    }
  },
  network: 'solana-devnet',
  config: {
    discoverable: true,  // Enable discovery in x402 ecosystem
    description: 'Get current weather data for any location',
    resource: `${process.env.BASE_URL}/api/weather`,
    inputSchema: {
      queryParams: {
        location: {
          type: 'string',
          description: 'City name or coordinates',
          required: true
        }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        temperature: { type: 'number' },
        conditions: { type: 'string' },
        humidity: { type: 'number' }
      }
    }
  }
});
```

**Benefits of making your API discoverable:**
- Automatic listing in x402 discovery services
- AI agents can find and use your API autonomously
- Better developer discoverability across the ecosystem
- Include `inputSchema` and `outputSchema` for clear API documentation

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
const USDC_MINT = process.env.NODE_ENV === 'production'
  ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // mainnet
  : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // devnet

const paymentRequirements = await x402.createPaymentRequirements({
  price: {
    amount: "1000000",  // $1.00 USDC
    asset: {
      address: USDC_MINT
    }
  },
  network: process.env.NODE_ENV === 'production' ? 'solana' : 'solana-devnet',
  config: {
    description: 'Payment',
    resource: `${process.env.BASE_URL}/api/endpoint`,
  }
});
```

### Wallet Adapter Interface

The package works with any wallet that implements this interface:

```typescript
interface WalletAdapter {
  address: string;
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
  address: wallet.publicKey?.toString() || '',
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
  signTransaction: (tx) => phantomProvider.signTransaction(tx),
};

// Solflare
const solflareProvider = window.solflare;
const walletAdapter = {
  address: solflareProvider.publicKey.toString(),
  signTransaction: (tx) => solflareProvider.signTransaction(tx),
};
```

**Custom Wallet Implementations**

Any custom wallet implementation that can sign transactions works:

```typescript
const customWallet = {
  address: 'your_public_key_string',
  signTransaction: async (tx: VersionedTransaction) => {
    // Your custom signing logic
    return signedTransaction;
  },
};
```

## Payment Amounts

Payment amounts are in USDC micro-units (6 decimals) as **strings**:

- 1 USDC = `"1000000"` micro-units
- $0.01 = `"10000"` micro-units
- $2.50 = `"2500000"` micro-units

**Helper functions:**

```typescript
import { usdToMicroUsdc, microUsdcToUsd } from 'x402-solana/utils';

const microUnits = usdToMicroUsdc(2.5);  // "2500000"
const usd = microUsdcToUsd("2500000");   // 2.5
```

## Testing

Visit `/x402-test` in your app to test the package independently.

The test verifies:

✅ Package imports work correctly  
✅ Client can be created with wallet adapter  
✅ Automatic 402 payment handling works  
✅ Transaction signing and submission succeed  
✅ Payment verification and settlement complete  

## Architecture

```
src/lib/x402-solana/
├── client/                    # Client-side code
│   ├── transaction-builder.ts # Solana transaction construction
│   ├── payment-interceptor.ts # 402 payment fetch interceptor
│   └── index.ts              # Main client export
├── server/                    # Server-side code
│   ├── facilitator-client.ts # Facilitator API communication
│   ├── payment-handler.ts    # Payment verification & settlement
│   └── index.ts              # Main server export
├── types/                     # TypeScript types
│   ├── x402-protocol.ts      # x402 spec types (Zod schemas)
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

### TODO: Code Quality Improvements

- [ ] Add comprehensive unit tests for all modules (currently has minimal setup test)
- [ ] Review and potentially enable stricter ESLint rules
- [ ] Add integration tests for payment flows
- [ ] Add test coverage reporting

## Future Enhancements

- [ ] Add @solana/kit adapter for AI agents
- [ ] Support for multiple payment tokens
- [ ] Add transaction retry logic
- [ ] Support for partial payments
- [ ] Simplified API wrapper for common use cases

## License

MIT

## Credits

Built on top of:

- [x402 Protocol](https://github.com/coinbase/x402)
- [@solana/web3.js](https://github.com/solana-labs/solana-web3.js)
- [PayAI Network](https://payai.network)

## Support

- GitHub: [github.com/payai-network/x402-solana](https://github.com/payai-network/x402-solana)
- Issues: [github.com/payai-network/x402-solana/issues](https://github.com/payai-network/x402-solana/issues)

## Version

Current version: `0.1.0-beta.2`

**Note:** This is a beta release. The API is subject to change. Please report any issues on GitHub.
