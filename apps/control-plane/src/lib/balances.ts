import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { base, polygon } from "viem/chains";
import { evm, solana } from "@faremeter/info";
import { logger } from "../logger.js";

const USDC_DECIMALS = 6;
const SOLANA_DECIMALS = 9;

const SOLANA_USDC = solana.lookupKnownSPLToken("mainnet-beta", "USDC");
const BASE_USDC = evm.lookupKnownAsset("base", "USDC");
const POLYGON_USDC = evm.lookupKnownAsset("eip155:137", "USDC");
const MONAD_USDC = evm.lookupKnownAsset("eip155:10143", "USDC");

const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

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
  try {
    const connection = new Connection(SOLANA_RPC_URL);
    const pubkey = new PublicKey(addr);

    const nativeLamports = await connection.getBalance(pubkey);
    const native = (nativeLamports / 10 ** SOLANA_DECIMALS).toFixed(4);

    let usdc = "0";
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
          usdc = parsed?.parsed?.info?.tokenAmount?.uiAmountString ?? "0";
        }
      } catch {
        // Token account may not exist
      }
    }

    return { native, usdc };
  } catch (error) {
    logger.error(`Solana balance fetch error: ${error}`);
    return { native: "0", usdc: "0" };
  }
}

async function getEvmBalances(
  addr: string,
  chain: typeof base | typeof polygon | typeof monadTestnet,
  usdcAddress?: string,
): Promise<ChainBalances> {
  try {
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
        // USDC contract call failed
      }
    }

    return {
      native: parseFloat(native).toFixed(6),
      usdc: parseFloat(usdc).toFixed(2),
    };
  } catch (error) {
    logger.error(`${chain.name} balance fetch error: ${error}`);
    return { native: "0", usdc: "0" };
  }
}

export async function fetchWalletBalances(addresses: {
  solana: string | null;
  evm: string | null;
}): Promise<WalletBalances> {
  const [solanaBalances, baseBalances, polygonBalances, monadBalances] =
    await Promise.all([
      addresses.solana
        ? getSolanaBalances(addresses.solana)
        : { native: "0", usdc: "0" },
      addresses.evm
        ? getEvmBalances(addresses.evm, base, BASE_USDC?.address)
        : { native: "0", usdc: "0" },
      addresses.evm
        ? getEvmBalances(addresses.evm, polygon, POLYGON_USDC?.address)
        : { native: "0", usdc: "0" },
      addresses.evm
        ? getEvmBalances(addresses.evm, monadTestnet, MONAD_USDC?.address)
        : { native: "0", usdc: "0" },
    ]);

  return {
    solana: solanaBalances,
    base: baseBalances,
    polygon: polygonBalances,
    monad: monadBalances,
  };
}
