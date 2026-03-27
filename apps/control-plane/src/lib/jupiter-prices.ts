import { solana } from "@faremeter/info";
import { logger } from "../logger.js";
import { withRetry } from "./balances.js";

const JUPITER_API_URL = "https://api.jup.ag/price/v3";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const KNOWN_SOLANA_TOKENS = [
  "USDC",
  "USDT",
  "PYUSD",
  "USDG",
  "USD1",
  "USX",
  "CASH",
  "EURC",
  "JupUSD",
  "USDS",
  "USDtb",
  "USDu",
  "USDGO",
  "FDUSD",
] as const;

interface TokenRate {
  mint: string;
  symbol: string;
  usdPrice: number;
}

let cachedRates: Record<string, TokenRate> = {};
let cacheTimestamp = 0;

function getKnownMints(): { mint: string; symbol: string }[] {
  const mints: { mint: string; symbol: string }[] = [];
  for (const symbol of KNOWN_SOLANA_TOKENS) {
    const info = solana.lookupKnownSPLToken("mainnet-beta", symbol);
    if (info) {
      mints.push({ mint: info.address, symbol });
    }
  }
  return mints;
}

// Jupiter Price API v3 returns USD prices directly per mint
type JupiterV3Response = Record<
  string,
  {
    usdPrice: number;
    decimals: number;
    liquidity?: number;
  }
>;

async function fetchJupiterPrices(
  mints: string[],
): Promise<Record<string, number>> {
  const ids = mints.join(",");
  const url = `${JUPITER_API_URL}?ids=${ids}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (JUPITER_API_KEY) {
    headers["x-api-key"] = JUPITER_API_KEY;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Jupiter API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as JupiterV3Response;

  const prices: Record<string, number> = {};
  for (const [mint, info] of Object.entries(data)) {
    if (info?.usdPrice) {
      prices[mint] = info.usdPrice;
    }
  }
  return prices;
}

export async function getTokenRates(): Promise<Record<string, TokenRate>> {
  const now = Date.now();
  if (
    now - cacheTimestamp < CACHE_TTL_MS &&
    Object.keys(cachedRates).length > 0
  ) {
    return cachedRates;
  }

  try {
    const knownMints = getKnownMints();
    const mintAddresses = knownMints.map((m) => m.mint);

    const prices = await withRetry(() => fetchJupiterPrices(mintAddresses), {
      retries: 2,
      baseDelay: 1000,
      name: "jupiter-prices",
    });

    const rates: Record<string, TokenRate> = {};
    for (const { mint, symbol } of knownMints) {
      const price = prices[mint];
      if (price !== undefined) {
        rates[mint] = { mint, symbol, usdPrice: price };
      }
    }

    cachedRates = rates;
    cacheTimestamp = Date.now();

    return rates;
  } catch (error) {
    logger.error(`Failed to fetch Jupiter prices: ${error}`);
    if (Object.keys(cachedRates).length > 0) {
      logger.warn("Returning stale Jupiter price cache");
      return cachedRates;
    }
    return {};
  }
}

export async function getSymbolToUsdRate(): Promise<Record<string, number>> {
  const rates = await getTokenRates();
  const result: Record<string, number> = {};
  for (const info of Object.values(rates)) {
    result[info.symbol] = info.usdPrice;
  }
  return result;
}
