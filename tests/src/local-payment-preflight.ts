import fs from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const SOLANA_USDC_MINT =
  process.env.LOCAL_SOLANA_USDC_MINT ??
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MIN_FACILITATOR_SOL_LAMPORTS = BigInt(
  process.env.LOCAL_MIN_FACILITATOR_SOL_LAMPORTS ?? "10000000",
);
const MIN_CLIENT_SOL_LAMPORTS = BigInt(
  process.env.LOCAL_MIN_CLIENT_SOL_LAMPORTS ?? "10000000",
);
const MIN_CLIENT_USDC_BASE_UNITS = BigInt(
  process.env.LOCAL_MIN_CLIENT_USDC_BASE_UNITS ?? "4000",
);
const LAMPORTS_PER_SOL = 1_000_000_000n;

export type FundingSnapshot = {
  facilitator: {
    address: string;
    solLamports: bigint;
  };
  client: {
    address: string;
    solLamports: bigint;
    usdc: bigint;
  };
};

function expandHome(path: string): string {
  return path.startsWith("~/") ? `${os.homedir()}${path.slice(1)}` : path;
}

function readKeypair(path: string): Keypair {
  const secret = Uint8Array.from(
    JSON.parse(fs.readFileSync(expandHome(path), "utf8")),
  );
  return Keypair.fromSecretKey(secret);
}

function getFacilitatorAddress(): string {
  const explicit = process.env.LOCAL_SERVICE_SOLANA_ADDRESS?.trim();
  if (explicit) return explicit;

  const path = process.env.LOCAL_FACILITATOR_SOLANA_KEYPAIR_PATH?.trim();
  if (!path) {
    throw new Error(
      "LOCAL_FACILITATOR_SOLANA_KEYPAIR_PATH or LOCAL_SERVICE_SOLANA_ADDRESS must be set for local payment checks.",
    );
  }

  return readKeypair(path).publicKey.toBase58();
}

function getClientKeypair(): Keypair {
  const inline = process.env.LOCAL_CLIENT_SOLANA_KEYPAIR?.trim();
  if (inline) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(inline)));
  }

  const path =
    process.env.LOCAL_CLIENT_SOLANA_KEYPAIR_PATH?.trim() ??
    "~/.config/solana/id.json";
  return readKeypair(path);
}

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, "0");
  return `${whole}.${fraction}`;
}

function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const balance = await connection
    .getTokenAccountBalance(ata)
    .catch(() => null);
  return balance ? BigInt(balance.value.amount) : 0n;
}

export async function getFundingSnapshot(): Promise<FundingSnapshot> {
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const facilitatorAddress = new PublicKey(getFacilitatorAddress());
  const client = getClientKeypair();
  const mint = new PublicKey(SOLANA_USDC_MINT);

  const [facilitatorSol, clientSol, clientUsdc] = await Promise.all([
    connection.getBalance(facilitatorAddress),
    connection.getBalance(client.publicKey),
    getTokenBalance(connection, client.publicKey, mint),
  ]);

  return {
    facilitator: {
      address: facilitatorAddress.toBase58(),
      solLamports: BigInt(facilitatorSol),
    },
    client: {
      address: client.publicKey.toBase58(),
      solLamports: BigInt(clientSol),
      usdc: clientUsdc,
    },
  };
}

function describeShortfall(snapshot: FundingSnapshot): string[] {
  const messages: string[] = [];

  if (snapshot.facilitator.solLamports < MIN_FACILITATOR_SOL_LAMPORTS) {
    messages.push(
      `Facilitator wallet ${snapshot.facilitator.address} has ${formatSol(snapshot.facilitator.solLamports)} devnet SOL; need at least ${formatSol(MIN_FACILITATOR_SOL_LAMPORTS)} SOL so the facilitator can pay gas.`,
    );
  }

  if (snapshot.client.solLamports < MIN_CLIENT_SOL_LAMPORTS) {
    messages.push(
      `Client wallet ${snapshot.client.address} has ${formatSol(snapshot.client.solLamports)} devnet SOL; need at least ${formatSol(MIN_CLIENT_SOL_LAMPORTS)} SOL for paid smoke requests.`,
    );
  }

  if (snapshot.client.usdc < MIN_CLIENT_USDC_BASE_UNITS) {
    messages.push(
      `Client wallet ${snapshot.client.address} has ${formatUsdc(snapshot.client.usdc)} devnet USDC; need at least ${formatUsdc(MIN_CLIENT_USDC_BASE_UNITS)} USDC for the paid smoke requests.`,
    );
  }

  return messages;
}

export async function assertLocalPaymentFunding(): Promise<FundingSnapshot> {
  const snapshot = await getFundingSnapshot();
  const shortfalls = describeShortfall(snapshot);

  if (shortfalls.length === 0) {
    return snapshot;
  }

  const error = [
    "Local Solana devnet payment funding preflight failed.",
    ...shortfalls,
    "Fund SOL with: solana airdrop --url devnet <amount> <address>",
    "Fund devnet USDC with Circle's faucet for Solana devnet USDC.",
  ].join("\n");

  throw new Error(error);
}

async function main(): Promise<void> {
  const snapshot = await getFundingSnapshot();
  const shortfalls = describeShortfall(snapshot);

  process.stdout.write(
    JSON.stringify(
      {
        status: shortfalls.length === 0 ? "ok" : "needs_funding",
        facilitator: {
          address: snapshot.facilitator.address,
          sol: formatSol(snapshot.facilitator.solLamports),
        },
        client: {
          address: snapshot.client.address,
          sol: formatSol(snapshot.client.solLamports),
          usdc: formatUsdc(snapshot.client.usdc),
        },
        shortfalls,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");

  if (shortfalls.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(process.argv[1]).href;
  if (import.meta.url === entryUrl) {
    await main();
  }
}
