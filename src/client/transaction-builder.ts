import {
  PublicKey,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { PaymentRequirements, WalletAdapter } from "../types";
import { createPaymentHeaderFromTransaction } from "../utils";

/**
 * Build and sign a Solana transaction for x402 payment
 */
export async function createSolanaPaymentHeader(
  wallet: WalletAdapter,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  rpcUrl: string
): Promise<string> {
  const connection = new Connection(rpcUrl, "confirmed");

  // Extract fee payer from payment requirements
  const feePayer = (paymentRequirements as { extra?: { feePayer?: string } })?.extra?.feePayer;
  if (typeof feePayer !== "string" || !feePayer) {
    throw new Error("Missing facilitator feePayer in payment requirements (extra.feePayer).");
  }
  const feePayerPubkey = new PublicKey(feePayer);

  // Support both Anza wallet-adapter (publicKey) and custom implementations (address)
  const walletAddress = wallet?.publicKey?.toString() || wallet?.address;
  if (!walletAddress) {
    throw new Error("Missing connected Solana wallet address or publicKey");
  }
  const userPubkey = new PublicKey(walletAddress);

  if (!paymentRequirements?.payTo) {
    throw new Error("Missing payTo in payment requirements");
  }
  const destination = new PublicKey(paymentRequirements.payTo);

  const instructions: TransactionInstruction[] = [];

  // The facilitator REQUIRES ComputeBudget instructions in positions 0 and 1
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 7_000, // Sufficient for SPL token transfer
    })
  );

  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1, // Minimal price
    })
  );

  // SPL token or Token-2022
  if (!paymentRequirements.asset) {
    throw new Error("Missing token mint for SPL transfer");
  }
  const mintPubkey = new PublicKey(paymentRequirements.asset as string);

  // Determine program (token vs token-2022) by reading mint owner
  const mintInfo = await connection.getAccountInfo(mintPubkey, "confirmed");
  const programId =
    mintInfo?.owner?.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

  // Fetch mint to get decimals
  const mint = await getMint(connection, mintPubkey, undefined, programId);

  // Derive source and destination ATAs
  const sourceAta = await getAssociatedTokenAddress(
    mintPubkey,
    userPubkey,
    false,
    programId
  );
  const destinationAta = await getAssociatedTokenAddress(
    mintPubkey,
    destination,
    false,
    programId
  );

  // Check if source ATA exists (user must already have token account)
  const sourceAtaInfo = await connection.getAccountInfo(sourceAta, "confirmed");
  if (!sourceAtaInfo) {
    throw new Error(
      `User does not have an Associated Token Account for ${paymentRequirements.asset}. Please create one first or ensure you have the required token.`
    );
  }

  // Check if destination ATA exists (receiver must already have token account)
  const destAtaInfo = await connection.getAccountInfo(destinationAta, "confirmed");
  if (!destAtaInfo) {
    throw new Error(
      `Destination does not have an Associated Token Account for ${paymentRequirements.asset}. The receiver must create their token account before receiving payments.`
    );
  }

  // TransferChecked instruction
  const amount = BigInt(paymentRequirements.maxAmountRequired);

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
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: feePayerPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  // Create transaction
  const transaction = new VersionedTransaction(message);

  // Sign with user's wallet
  if (typeof wallet?.signTransaction !== "function") {
    throw new Error("Connected wallet does not support signTransaction");
  }

  const userSignedTx = await wallet.signTransaction(transaction);

  return createPaymentHeaderFromTransaction(
    userSignedTx,
    paymentRequirements,
    x402Version
  );
}

