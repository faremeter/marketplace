import { Hono } from "hono";
import { getTokenRates } from "../lib/jupiter-prices.js";
import { modifyResourceLimiter } from "../middleware/rate-limit.js";

export const tokenRatesRoutes = new Hono();

// Public endpoint - returns cached Jupiter token-to-USDC rates (no auth required)
// Uses modifyResourceLimiter (60/hour) as there's no dedicated read limiter
tokenRatesRoutes.get("/", modifyResourceLimiter, async (c) => {
  const rates = await getTokenRates();
  return c.json({ data: rates });
});
