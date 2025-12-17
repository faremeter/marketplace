import { Hono } from "hono";
import { db } from "../server.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { fetchWalletBalances } from "../lib/balances.js";
import { enqueueBalanceCheck } from "../lib/queue.js";
import { logger } from "../logger.js";

export const walletsRoutes = new Hono();

walletsRoutes.use("*", requireAuth);

interface WalletConfig {
  solana?: {
    "mainnet-beta"?: {
      address: string;
    };
  };
  evm?: {
    base?: { address: string };
    polygon?: { address: string };
    monad?: { address: string };
  };
}

function extractAddresses(walletConfig: WalletConfig | null): {
  solana: string | null;
  evm: string | null;
} {
  if (!walletConfig) {
    return { solana: null, evm: null };
  }
  return {
    solana: walletConfig.solana?.["mainnet-beta"]?.address ?? null,
    evm: walletConfig.evm?.base?.address ?? null,
  };
}

// List wallets for an organization
walletsRoutes.get("/organization/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("orgId"));

  // Check membership unless admin
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

// Get single wallet
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

  // Check access - admin can see all, user can only see their org's wallets
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

  // Non-admin can't see master wallets (org_id = null)
  if (!user.is_admin && wallet.organization_id === null) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  return c.json(wallet);
});

// Get wallet balances
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

  // Check access
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

  const config = wallet.wallet_config as WalletConfig;
  const addresses = extractAddresses(config);

  const balances = await fetchWalletBalances(addresses);
  return c.json(balances);
});

// Create wallet for an organization
walletsRoutes.post("/organization/:orgId", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("orgId"));
  const body = await c.req.json();

  // Check membership and owner role
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

  if (!body.name?.trim()) {
    return c.json({ error: "Wallet name is required" }, 400);
  }

  if (!body.wallet_config) {
    return c.json({ error: "Wallet config is required" }, 400);
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
      name: body.name.trim(),
      wallet_config: JSON.stringify(body.wallet_config),
      funding_status: "pending",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Enqueue balance check
  if (addresses.solana) {
    enqueueBalanceCheck(wallet.id, addresses.solana).catch((err) => {
      logger.error(
        `Failed to enqueue balance check for wallet ${wallet.id}: ${err}`,
      );
    });
  }

  return c.json(wallet, 201);
});

// Update wallet
walletsRoutes.put("/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const wallet = await db
    .selectFrom("wallets")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!wallet) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  // Check access
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

  // Re-enqueue balance check if config changed
  if (body.wallet_config) {
    const addresses = extractAddresses(body.wallet_config as WalletConfig);
    if (addresses.solana) {
      enqueueBalanceCheck(updated.id, addresses.solana).catch((err) => {
        logger.error(
          `Failed to enqueue balance check for wallet ${updated.id}: ${err}`,
        );
      });
    }
  }

  return c.json(updated);
});

// Delete wallet
walletsRoutes.delete("/:id", async (c) => {
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

  // Check access
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

  // Check if wallet is assigned to any tenants
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

// Admin routes for master wallet management
walletsRoutes.get("/admin/master", requireAdmin, async (c) => {
  const masterWallets = await db
    .selectFrom("wallets")
    .selectAll()
    .where("organization_id", "is", null)
    .orderBy("name", "asc")
    .execute();

  return c.json(masterWallets);
});

walletsRoutes.post("/admin/master", requireAdmin, async (c) => {
  const body = await c.req.json();

  if (!body.name?.trim()) {
    return c.json({ error: "Wallet name is required" }, 400);
  }

  if (!body.wallet_config) {
    return c.json({ error: "Wallet config is required" }, 400);
  }

  const wallet = await db
    .insertInto("wallets")
    .values({
      organization_id: null,
      name: body.name.trim(),
      wallet_config: JSON.stringify(body.wallet_config),
      funding_status: "funded",
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(wallet, 201);
});

// Admin: list all wallets
walletsRoutes.get("/admin/all", requireAdmin, async (c) => {
  const wallets = await db
    .selectFrom("wallets")
    .leftJoin("organizations", "organizations.id", "wallets.organization_id")
    .select([
      "wallets.id",
      "wallets.organization_id",
      "wallets.name",
      "wallets.wallet_config",
      "wallets.funding_status",
      "wallets.created_at",
      "organizations.name as organization_name",
    ])
    .orderBy("wallets.created_at", "desc")
    .execute();

  return c.json(wallets);
});
