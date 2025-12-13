import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer as splTransfer,
} from "@solana/spl-token";
import { solana } from "@faremeter/info";
import { logger } from "../logger.js";
import bs58 from "bs58";

const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const USDC_DECIMALS = 6;

const SOLANA_USDC = solana.lookupKnownSPLToken("mainnet-beta", "USDC");

function parsePrivateKey(key: string): Keypair {
  // Try JSON array format first (e.g., [1,2,3,...])
  if (key.startsWith("[")) {
    const bytes = JSON.parse(key) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  // Otherwise assume base58
  return Keypair.fromSecretKey(bs58.decode(key));
}

export async function transferSol(
  fromPrivateKey: string,
  toAddress: string,
  amountSol: number,
): Promise<string> {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const fromKeypair = parsePrivateKey(fromPrivateKey);
  const toPubkey = new PublicKey(toAddress);

  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey,
      lamports,
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    fromKeypair,
  ]);

  logger.info(
    `Transferred ${amountSol} SOL to ${toAddress}, signature: ${signature}`,
  );

  return signature;
}

export async function transferUsdcSol(
  fromPrivateKey: string,
  toAddress: string,
  amountUsdc: number,
): Promise<string> {
  if (!SOLANA_USDC) {
    throw new Error("USDC mint address not found");
  }

  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const fromKeypair = parsePrivateKey(fromPrivateKey);
  const toPubkey = new PublicKey(toAddress);
  const usdcMint = new PublicKey(SOLANA_USDC.address);

  // Get or create the source token account
  const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    fromKeypair,
    usdcMint,
    fromKeypair.publicKey,
  );

  // Get or create the destination token account
  const destTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    fromKeypair,
    usdcMint,
    toPubkey,
  );

  // Convert USDC amount to smallest units (6 decimals)
  const amount = BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));

  const signature = await splTransfer(
    connection,
    fromKeypair,
    sourceTokenAccount.address,
    destTokenAccount.address,
    fromKeypair,
    amount,
  );

  logger.info(
    `Transferred ${amountUsdc} USDC to ${toAddress}, signature: ${signature}`,
  );

  return signature;
}
