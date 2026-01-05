import type { PaymentRequirements, PaymentRequired } from '@payai/x402/types';
import type { WalletAdapter } from '../types';
import { isSolanaNetwork } from '../types';
import { createSolanaPaymentTransaction } from './transaction-builder';
import { createPaymentPayload } from '../utils';

/**
 * x402 Response structure (v2)
 */
interface X402Response extends PaymentRequired {
  accepts: PaymentRequirements[];
}

/**
 * Create a custom fetch function that automatically handles x402 payments (v2)
 *
 * @param fetchFn - Base fetch function to use
 * @param wallet - Wallet adapter for signing transactions
 * @param rpcUrl - Solana RPC URL
 * @param maxValue - Maximum payment amount in atomic units (0 = no limit)
 * @param verbose - Enable verbose logging (default: false)
 * @returns Wrapped fetch function with automatic payment handling
 */
export function createPaymentFetch(
  fetchFn: typeof fetch,
  wallet: WalletAdapter,
  rpcUrl: string,
  maxValue: bigint = BigInt(0),
  verbose: boolean = false
) {
  const log = (...args: unknown[]) => {
    if (verbose) console.log('[x402-solana]', ...args);
  };

  return async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url;
    log('Making initial request to:', url);

    // Make initial request
    const response = await fetchFn(input, init);
    log('Initial response status:', response.status);

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    log('Got 402, parsing payment requirements...');

    // Parse payment requirements from 402 response
    const rawResponse = (await response.json()) as X402Response;
    log('Payment requirements:', JSON.stringify(rawResponse, null, 2));

    const parsedPaymentRequirements: PaymentRequirements[] = rawResponse.accepts || [];

    // Select first suitable payment requirement for Solana
    // Supports both simple format ("solana", "solana-devnet") and CAIP-2 format ("solana:chainId")
    const selectedRequirements = parsedPaymentRequirements.find(
      (req: PaymentRequirements) => req.scheme === 'exact' && isSolanaNetwork(req.network)
    );

    if (!selectedRequirements) {
      console.error(
        '❌ No suitable Solana payment requirements found. Available networks:',
        parsedPaymentRequirements.map(req => req.network)
      );
      throw new Error('No suitable Solana payment requirements found');
    }

    // Check amount against max value if specified
    // v2 uses `amount`, but we also support legacy `maxAmountRequired` for backwards compatibility
    const paymentAmount = BigInt(
      selectedRequirements.amount ||
        (selectedRequirements as unknown as { maxAmountRequired?: string }).maxAmountRequired ||
        '0'
    );

    if (maxValue > BigInt(0) && paymentAmount > maxValue) {
      throw new Error('Payment amount exceeds maximum allowed');
    }

    // Get the resource URL for the payment payload
    const resourceUrl = typeof input === 'string' ? input : input.url;

    log('Creating signed transaction...');

    // Create signed transaction
    const signedTransaction = await createSolanaPaymentTransaction(
      wallet,
      selectedRequirements,
      rpcUrl
    );
    log('Transaction signed successfully');

    // Create v2 payment payload with resource and accepted fields
    const paymentHeader = createPaymentPayload(
      signedTransaction,
      selectedRequirements,
      resourceUrl
    );
    log('Payment header created, length:', paymentHeader.length);

    // Retry with V2 payment header
    const newInit = {
      ...init,
      headers: {
        ...(init?.headers || {}),
        'PAYMENT-SIGNATURE': paymentHeader,
      },
    };

    log('Retrying request with PAYMENT-SIGNATURE header...');
    const retryResponse = await fetchFn(input, newInit);
    log('Retry response status:', retryResponse.status);

    return retryResponse;
  };
}
