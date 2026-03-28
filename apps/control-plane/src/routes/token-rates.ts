import { Hono } from "hono";
import { getTokenRates } from "../lib/jupiter-prices.js";
import { modifyResourceLimiter } from "../middleware/rate-limit.js";
import { db } from "../db/instance.js";

export const tokenRatesRoutes = new Hono();

// Public endpoint - returns cached Jupiter token-to-USDC rates (no auth required)
// Uses modifyResourceLimiter (60/hour) as there's no dedicated read limiter
tokenRatesRoutes.get("/", modifyResourceLimiter, async (c) => {
  const rates = await getTokenRates();
  return c.json({ data: rates });
});

tokenRatesRoutes.get("/supported-tokens", modifyResourceLimiter, async (c) => {
  const rows = await db
    .selectFrom("supported_tokens")
    .select(["symbol", "mint_address", "network", "is_usd_pegged", "decimals"])
    .execute();

  return c.json({
    data: rows.map((r) => ({
      symbol: r.symbol,
      mint: r.mint_address,
      network: r.network,
      isUsdPegged: r.is_usd_pegged,
      decimals: r.decimals,
    })),
  });
});
