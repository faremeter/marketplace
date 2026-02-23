import { Hono } from "hono";
import { db } from "../db/instance.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  createResourceLimiter,
  modifyResourceLimiter,
} from "../middleware/rate-limit.js";
import {
  fetchWalletBalances,
  extractAddresses,
  checkBalancesMeetMinimum,
  BALANCE_CACHE_TTL_MS,
  type WalletConfig,
  type WalletBalances,
} from "../lib/balances.js";
import { enqueueBalanceCheck } from "../lib/queue.js";
import { logger } from "../logger.js";
import { arktypeValidator } from "@hono/arktype-validator";
import { CreateWalletSchema, UpdateWalletSchema } from "../lib/schemas.js";

export const walletsRoutes = new Hono();

walletsRoutes.use("*", requireAuth);

walletsRoutes.get("/organization/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("orgId"));

  if (!user.is_admin) {
    const membership = await db
      .selectFrom("user_organizations")
      .select("role")
      .where("user_id", "=", user.id)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();

    if (!membership) {
      return c.json({ error: "Organization not found" }, 404);
    }
  }

  const wallets = await db
    .selectFrom("wallets")
    .selectAll()
    .where("organization_id", "=", orgId)
    .orderBy("name", "asc")
    .execute();

  return c.json(wallets);
});

walletsRoutes.get("/organization/:orgId/check-name", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("orgId"));
  const name = c.req.query("name");
  const excludeId = c.req.query("excludeId");

  if (!user.is_admin) {
    const membership = await db
      .selectFrom("user_organizations")
      .select("role")
      .where("user_id", "=", user.id)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();

    if (!membership) {
      return c.json({ error: "Organization not found" }, 404);
    }
  }

  if (!name?.trim()) {
    return c.json({ available: false });
  }

  let query = db
    .selectFrom("wallets")
    .select("id")
    .where("organization_id", "=", orgId)
    .where("name", "=", name.trim());

  if (excludeId) {
    query = query.where("id", "!=", parseInt(excludeId));
  }

  const existing = await query.executeTakeFirst();

  return c.json({ available: !existing });
});

walletsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const wallet = await db
    .selectFrom("wallets")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!wallet) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  if (!user.is_admin && wallet.organization_id) {
    const membership = await db
      .selectFrom("user_organizations")
      .select("role")
      .where("user_id", "=", user.id)
      .where("organization_id", "=", wallet.organization_id)
      .executeTakeFirst();

    if (!membership) {
      return c.json({ error: "Wallet not found" }, 404);
    }
  }

  if (!user.is_admin && wallet.organization_id === null) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  return c.json(wallet);
});

walletsRoutes.get("/:id/balances", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const wallet = await db
    .selectFrom("wallets")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!wallet) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  if (!user.is_admin && wallet.organization_id) {
    const membership = await db
      .selectFrom("user_organizations")
      .select("role")
      .where("user_id", "=", user.id)
      .where("organization_id", "=", wallet.organization_id)
      .executeTakeFirst();

    if (!membership) {
      return c.json({ error: "Wallet not found" }, 404);
    }
  }

  if (!user.is_admin && wallet.organization_id === null) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  const cachedAt = wallet.balances_cached_at;
  const isCacheFresh =
    cachedAt &&
    wallet.cached_balances &&
    Date.now() - new Date(cachedAt).getTime() < BALANCE_CACHE_TTL_MS;

  if (isCacheFresh) {
    const cached =
      typeof wallet.cached_balances === "string"
        ? JSON.parse(wallet.cached_balances)
        : wallet.cached_balances;
    return c.json({
      ...cached,
      isFunded: wallet.funding_status === "funded",
    });
  }

  const config = wallet.wallet_config as WalletConfig;
  const addresses = extractAddresses(config);
  const balances = await fetchWalletBalances(addresses);

  const adminSettings = await db
    .selectFrom("admin_settings")
    .select(["minimum_balance_sol", "minimum_balance_usdc"])
    .where("id", "=", 1)
    .executeTakeFirst();

  const minSol = adminSettings?.minimum_balance_sol ?? 0.001;
  const minUsdc = adminSettings?.minimum_balance_usdc ?? 0.01;
  const isFunded = checkBalancesMeetMinimum(
    balances as WalletBalances,
    minSol,
    minUsdc,
  );

  await db
    .updateTable("wallets")
    .set({
      cached_balances: JSON.stringify(balances),
      balances_cached_at: new Date(),
      funding_status: isFunded ? "funded" : wallet.funding_status,
    })
    .where("id", "=", id)
    .execute();

  return c.json({ ...balances, isFunded });
});

walletsRoutes.post(
  "/organization/:orgId",
  createResourceLimiter,
  arktypeValidator("json", CreateWalletSchema),
  async (c) => {
    const user = c.get("user");
    const orgId = parseInt(c.req.param("orgId"));
    const body = c.req.valid("json");

    if (!user.is_admin) {
      const membership = await db
        .selectFrom("user_organizations")
        .select("role")
        .where("user_id", "=", user.id)
        .where("organization_id", "=", orgId)
        .executeTakeFirst();

      if (!membership) {
        return c.json({ error: "Organization not found" }, 404);
      }

      if (membership.role !== "owner") {
        return c.json(
          { error: "Only organization owners can create wallets" },
          403,
        );
      }
    }

    const walletConfig = body.wallet_config as WalletConfig;
    const addresses = extractAddresses(walletConfig);

    if (!addresses.solana && !addresses.evm) {
      return c.json({ error: "At least one wallet address is required" }, 400);
    }

    const wallet = await db
      .insertInto("wallets")
      .values({
        organization_id: orgId,
        name: body.name,
        wallet_config: JSON.stringify(body.wallet_config),
        funding_status: "pending",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    enqueueBalanceCheck(wallet.id, addresses.solana).catch((err) => {
      logger.error(
        `Failed to enqueue balance check for wallet ${wallet.id}: ${err}`,
      );
    });

    return c.json(wallet, 201);
  },
);

walletsRoutes.put(
  "/:id",
  modifyResourceLimiter,
  arktypeValidator("json", UpdateWalletSchema),
  async (c) => {
    const user = c.get("user");
    const id = parseInt(c.req.param("id"));
    const body = c.req.valid("json");

    const wallet = await db
      .selectFrom("wallets")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!wallet) {
      return c.json({ error: "Wallet not found" }, 404);
    }

    if (!user.is_admin && wallet.organization_id) {
      const membership = await db
        .selectFrom("user_organizations")
        .select("role")
        .where("user_id", "=", user.id)
        .where("organization_id", "=", wallet.organization_id)
        .executeTakeFirst();

      if (!membership || membership.role !== "owner") {
        return c.json(
          { error: "Only organization owners can update wallets" },
          403,
        );
      }
    }

    if (!user.is_admin && wallet.organization_id === null) {
      return c.json({ error: "Wallet not found" }, 404);
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.wallet_config !== undefined) {
      updateData.wallet_config = JSON.stringify(body.wallet_config);
      updateData.funding_status = "pending"; // Reset funding status on config change
      updateData.cached_balances = null; // Clear balance cache
      updateData.balances_cached_at = null;
    }

    if (Object.keys(updateData).length === 0) {
      return c.json(wallet);
    }

    const updated = await db
      .updateTable("wallets")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    if (body.wallet_config) {
      const addresses = extractAddresses(body.wallet_config as WalletConfig);
      enqueueBalanceCheck(updated.id, addresses.solana).catch((err) => {
        logger.error(
          `Failed to enqueue balance check for wallet ${updated.id}: ${err}`,
        );
      });
    }

    return c.json(updated);
  },
);

walletsRoutes.delete("/:id", modifyResourceLimiter, async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const wallet = await db
    .selectFrom("wallets")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!wallet) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  if (!user.is_admin && wallet.organization_id) {
    const membership = await db
      .selectFrom("user_organizations")
      .select("role")
      .where("user_id", "=", user.id)
      .where("organization_id", "=", wallet.organization_id)
      .executeTakeFirst();

    if (!membership || membership.role !== "owner") {
      return c.json(
        { error: "Only organization owners can delete wallets" },
        403,
      );
    }
  }

  if (!user.is_admin && wallet.organization_id === null) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  const tenantsUsingWallet = await db
    .selectFrom("tenants")
    .select("id")
    .where("wallet_id", "=", id)
    .execute();

  if (tenantsUsingWallet.length > 0) {
    return c.json(
      { error: "Cannot delete wallet that is assigned to tenants" },
      400,
    );
  }

  await db.deleteFrom("wallets").where("id", "=", id).execute();

  return c.json({ success: true });
});

walletsRoutes.get("/admin/master", requireAdmin, async (c) => {
  const masterWallets = await db
    .selectFrom("wallets")
    .selectAll()
    .where("organization_id", "is", null)
    .orderBy("name", "asc")
    .execute();

  return c.json(masterWallets);
});

walletsRoutes.post(
  "/admin/master",
  requireAdmin,
  arktypeValidator("json", CreateWalletSchema),
  async (c) => {
    const body = c.req.valid("json");

    const wallet = await db
      .insertInto("wallets")
      .values({
        organization_id: null,
        name: body.name,
        wallet_config: JSON.stringify(body.wallet_config),
        funding_status: "funded",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return c.json(wallet, 201);
  },
);
