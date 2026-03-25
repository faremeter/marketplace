import { solana, evm } from "@faremeter/info";
import { USD_PEGGED_SYMBOLS } from "./schemas.js";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

interface TokenSeedEntry {
  symbol: string;
  mint: string;
  network: string;
}

function getUsdTokenSeedList(): TokenSeedEntry[] {
  const entries: TokenSeedEntry[] = [];

  // Solana USD-pegged tokens
  for (const symbol of USD_PEGGED_SYMBOLS) {
    const info = solana.lookupKnownSPLToken("mainnet-beta", symbol);
    if (info) {
      entries.push({
        symbol,
        mint: info.address,
        network: "solana-mainnet-beta",
      });
    }
  }

  // EVM USDC
  const evmTokens = [
    { network: "base", lookup: () => evm.lookupKnownAsset("base", "USDC") },
    {
      network: "polygon",
      lookup: () => evm.lookupKnownAsset("eip155:137", "USDC"),
    },
    {
      network: "eip155:143",
      lookup: () => evm.lookupKnownAsset("eip155:143", "USDC"),
    },
  ];

  for (const { network, lookup } of evmTokens) {
    const info = lookup();
    if (info) {
      entries.push({ symbol: "USDC", mint: info.address, network });
    }
  }

  return entries;
}

const USD_TOKEN_SEED_LIST = getUsdTokenSeedList();

export async function seedTokenPricesForTenant(
  db: Kysely<Database>,
  tenantId: number,
  amount: number,
  endpointId?: number | null,
): Promise<void> {
  if (amount < 0) return;

  const values = USD_TOKEN_SEED_LIST.map((t) => ({
    tenant_id: tenantId,
    endpoint_id: endpointId ?? null,
    token_symbol: t.symbol,
    mint_address: t.mint,
    network: t.network,
    amount,
    decimals: 6,
  }));

  if (values.length > 0) {
    await db.insertInto("token_prices").values(values).execute();
  }
}
