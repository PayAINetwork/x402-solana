import {
  PublicKey,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import type { PaymentRequirements } from '@payai/x402/types';
import type { WalletAdapter } from '../types';

// Constants for compute budget
const DEFAULT_COMPUTE_UNIT_LIMIT = 7_000; // Sufficient for SPL token transfer
const DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1; // Minimal price

/**
 * Build and sign a Solana transaction for x402 payment (v2)
 *
 * @param wallet - Wallet adapter for signing
 * @param paymentRequirements - Payment requirements from server
 * @param rpcUrl - Solana RPC URL
 * @returns Signed VersionedTransaction ready to be serialized
 */
export async function createSolanaPaymentTransaction(
  wallet: WalletAdapter,
  paymentRequirements: PaymentRequirements,
  rpcUrl: string
): Promise<VersionedTransaction> {
  const connection = new Connection(rpcUrl, 'confirmed');

  // Extract fee payer from payment requirements
  const feePayer = paymentRequirements.extra?.feePayer as string | undefined;
  if (!feePayer) {
    throw new Error('Missing facilitator feePayer in payment requirements (extra.feePayer).');
  }
  const feePayerPubkey = new PublicKey(feePayer);

  // Get wallet address - support both Anza wallet-adapter (publicKey) and custom implementations (address)
  const walletAddress = wallet?.publicKey?.toString() || wallet?.address;
  if (!walletAddress) {
    throw new Error('Missing connected Solana wallet address or publicKey');
  }
  const userPubkey = new PublicKey(walletAddress);

  // Get destination (payTo)
  if (!paymentRequirements.payTo) {
    throw new Error('Missing payTo in payment requirements');
  }
  const destination = new PublicKey(paymentRequirements.payTo);

  // Get token mint
  if (!paymentRequirements.asset) {
    throw new Error('Missing token mint for SPL transfer');
  }
  const mintPubkey = new PublicKey(paymentRequirements.asset);

  const instructions: TransactionInstruction[] = [];

  // The facilitator REQUIRES ComputeBudget instructions in positions 0 and 1
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: DEFAULT_COMPUTE_UNIT_LIMIT,
    })
  );

  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
    })
  );

  // Determine program (token vs token-2022) by reading mint owner
  const mintInfo = await connection.getAccountInfo(mintPubkey, 'confirmed');
  const programId =
    mintInfo?.owner?.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

  // Fetch mint to get decimals
  const mint = await getMint(connection, mintPubkey, undefined, programId);

  // Derive source and destination ATAs
  const sourceAta = await getAssociatedTokenAddress(mintPubkey, userPubkey, false, programId);
  const destinationAta = await getAssociatedTokenAddress(mintPubkey, destination, false, programId);

  // Check if source ATA exists (user must already have token account)
  const sourceAtaInfo = await connection.getAccountInfo(sourceAta, 'confirmed');
  if (!sourceAtaInfo) {
    throw new Error(
      `User does not have an Associated Token Account for ${paymentRequirements.asset}. Please create one first or ensure you have the required token.`
    );
  }

  // Check if destination ATA exists (receiver must already have token account)
  const destAtaInfo = await connection.getAccountInfo(destinationAta, 'confirmed');
  if (!destAtaInfo) {
    throw new Error(
      `Destination does not have an Associated Token Account for ${paymentRequirements.asset}. The receiver must create their token account before receiving payments.`
    );
  }

  // Get payment amount - v2 uses `amount`, support legacy `maxAmountRequired` for compatibility
  const amountStr =
    paymentRequirements.amount ||
    (paymentRequirements as unknown as { maxAmountRequired?: string }).maxAmountRequired;

  if (!amountStr) {
    throw new Error('Missing amount in payment requirements');
  }
  const amount = BigInt(amountStr);

  // TransferChecked instruction
  instructions.push(
    createTransferCheckedInstruction(
      sourceAta,
      mintPubkey,
      destinationAta,
      userPubkey,
      amount,
      mint.decimals,
      [],
      programId
    )
  );

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const message = new TransactionMessage({
    payerKey: feePayerPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  // Create transaction
  const transaction = new VersionedTransaction(message);

  // Sign with user's wallet
  if (typeof wallet?.signTransaction !== 'function') {
    throw new Error('Connected wallet does not support signTransaction');
  }

  const userSignedTx = await wallet.signTransaction(transaction);

  return userSignedTx;
}
