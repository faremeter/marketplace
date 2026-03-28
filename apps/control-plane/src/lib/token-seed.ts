import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

export async function seedTokenPricesForTenant(
  db: Kysely<Database>,
  tenantId: number,
  amount: number,
  endpointId?: number | null,
): Promise<void> {
  if (amount <= 0) return;

  const tokens = await db
    .selectFrom("supported_tokens")
    .select(["symbol", "mint_address", "network"])
    .where("is_usd_pegged", "=", true)
    .execute();

  if (tokens.length === 0) return;

  const values = tokens.map((t) => ({
    tenant_id: tenantId,
    endpoint_id: endpointId ?? null,
    token_symbol: t.symbol,
    mint_address: t.mint_address,
    network: t.network,
    amount,
    decimals: 6,
  }));

  await db.insertInto("token_prices").values(values).execute();
}

export async function getUsdPeggedSymbols(
  db: Kysely<Database>,
): Promise<string[]> {
  const rows = await db
    .selectFrom("supported_tokens")
    .select("symbol")
    .where("is_usd_pegged", "=", true)
    .execute();

  return [...new Set(rows.map((r) => r.symbol))];
}
