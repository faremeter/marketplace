import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { base, polygon } from "viem/chains";
import { evm, solana } from "@faremeter/info";
import { logger } from "../logger.js";

const USDC_DECIMALS = 6;
const SOLANA_DECIMALS = 9;

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelay?: number; name?: string } = {},
): Promise<T> {
  const { retries = 3, baseDelay = 500, name = "operation" } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(
          `${name} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

const SOLANA_USDC = solana.lookupKnownSPLToken("mainnet-beta", "USDC");
const BASE_USDC = evm.lookupKnownAsset("base", "USDC");
const POLYGON_USDC = evm.lookupKnownAsset("eip155:137", "USDC");
const MONAD_USDC = evm.lookupKnownAsset("eip155:10143", "USDC");

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
} as const;

interface ChainBalances {
  native: string;
  usdc: string;
}

export interface WalletBalances {
  solana: ChainBalances;
  base: ChainBalances;
  polygon: ChainBalances;
  monad: ChainBalances;
}

async function getSolanaBalances(addr: string): Promise<ChainBalances> {
  return withRetry(
    async () => {
      const connection = new Connection(SOLANA_RPC_URL);
      const pubkey = new PublicKey(addr);

      const nativeLamports = await connection.getBalance(pubkey);
      const native = (nativeLamports / 10 ** SOLANA_DECIMALS).toFixed(4);

      let usdc = "0.00";
      if (SOLANA_USDC) {
        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            pubkey,
            { mint: new PublicKey(SOLANA_USDC.address) },
          );

          if (tokenAccounts.value.length > 0) {
            const tokenAccount = tokenAccounts.value[0];
            const parsed = tokenAccount?.account?.data as {
              parsed?: { info?: { tokenAmount?: { uiAmountString?: string } } };
            };
            const rawUsdc =
              parsed?.parsed?.info?.tokenAmount?.uiAmountString ?? "0";
            usdc = parseFloat(rawUsdc).toFixed(2);
          }
        } catch {
          // Token account may not exist - this is OK, USDC balance is 0
        }
      }

      return { native, usdc };
    },
    { name: `Solana balance fetch (${addr.slice(0, 8)}...)` },
  );
}

async function getEvmBalances(
  addr: string,
  chain: typeof base | typeof polygon | typeof monadTestnet,
  usdcAddress?: string,
): Promise<ChainBalances> {
  return withRetry(
    async () => {
      const client = createPublicClient({
        chain,
        transport: http(),
      });

      const nativeBalance = await client.getBalance({
        address: addr as `0x${string}`,
      });
      const native = formatUnits(nativeBalance, 18);

      let usdc = "0";
      if (usdcAddress) {
        try {
          const usdcBalance = await client.readContract({
            address: usdcAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [addr as `0x${string}`],
          });
          usdc = formatUnits(usdcBalance, USDC_DECIMALS);
        } catch {
          // USDC contract call failed - this is OK, USDC balance is 0
        }
      }

      return {
        native: parseFloat(native).toFixed(6),
        usdc: parseFloat(usdc).toFixed(2),
      };
    },
    { name: `${chain.name} balance fetch (${addr.slice(0, 8)}...)` },
  );
}

export async function fetchWalletBalances(addresses: {
  solana: string | null;
  evm: string | null;
}): Promise<WalletBalances> {
  const [solanaBalances, baseBalances, polygonBalances, monadBalances] =
    await Promise.all([
      addresses.solana
        ? getSolanaBalances(addresses.solana)
        : { native: "0.0000", usdc: "0.00" },
      addresses.evm
        ? getEvmBalances(addresses.evm, base, BASE_USDC?.address)
        : { native: "0.000000", usdc: "0.00" },
      addresses.evm
        ? getEvmBalances(addresses.evm, polygon, POLYGON_USDC?.address)
        : { native: "0.000000", usdc: "0.00" },
      addresses.evm
        ? getEvmBalances(addresses.evm, monadTestnet, MONAD_USDC?.address)
        : { native: "0.000000", usdc: "0.00" },
    ]);

  return {
    solana: solanaBalances,
    base: baseBalances,
    polygon: polygonBalances,
    monad: monadBalances,
  };
}

export const BALANCE_CACHE_TTL_MS = 60 * 1000; // 1 minute

export interface WalletConfig {
  solana?: { "mainnet-beta"?: { address?: string; key?: string } };
  evm?: {
    base?: { address?: string; key?: string };
    polygon?: { address?: string; key?: string };
    monad?: { address?: string; key?: string };
  };
}

export function extractAddresses(config: WalletConfig | null): {
  solana: string | null;
  evm: string | null;
} {
  if (!config) return { solana: null, evm: null };
  return {
    solana: config.solana?.["mainnet-beta"]?.address ?? null,
    evm: config.evm?.base?.address ?? null,
  };
}

export function checkBalancesMeetMinimum(
  balances: WalletBalances | null,
  minSol: number,
  minUsdc: number,
): boolean {
  if (!balances) return false;

  if (balances.solana) {
    const sol = parseFloat(balances.solana.native || "0");
    const usdc = parseFloat(balances.solana.usdc || "0");
    if (sol >= minSol && usdc >= minUsdc) return true;
  }

  for (const chain of ["base", "polygon", "monad"] as const) {
    const chainBalances = balances[chain];
    if (chainBalances) {
      const native = parseFloat(chainBalances.native || "0");
      const usdc = parseFloat(chainBalances.usdc || "0");
      if (native > 0 && usdc >= minUsdc) return true;
    }
  }

  return false;
}
