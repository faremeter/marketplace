import { Hono } from "hono";
import { db } from "../server.js";
import { requireAuth } from "../middleware/auth.js";
import { encryptWalletKeys } from "../lib/crypto.js";
import { fetchWalletBalances } from "../lib/balances.js";
import { logger } from "../logger.js";

export const organizationsRoutes = new Hono();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

organizationsRoutes.use("*", requireAuth);

organizationsRoutes.get("/", async (c) => {
  const user = c.get("user");

  const organizations = await db
    .selectFrom("user_organizations")
    .innerJoin(
      "organizations",
      "organizations.id",
      "user_organizations.organization_id",
    )
    .select([
      "organizations.id",
      "organizations.name",
      "organizations.slug",
      "organizations.created_at",
      "user_organizations.role",
    ])
    .where("user_organizations.user_id", "=", user.id)
    .orderBy("organizations.name", "asc")
    .execute();

  return c.json(organizations);
});

organizationsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  if (!body.name) {
    return c.json({ error: "Organization name is required" }, 400);
  }

  let slug = body.slug || slugify(body.name);

  const existingSlug = await db
    .selectFrom("organizations")
    .select("id")
    .where("slug", "=", slug)
    .executeTakeFirst();

  if (existingSlug) {
    slug = `${slug}-${Date.now()}`;
  }

  const org = await db
    .insertInto("organizations")
    .values({
      name: body.name,
      slug,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await db
    .insertInto("user_organizations")
    .values({
      user_id: user.id,
      organization_id: org.id,
      role: "owner",
    })
    .execute();

  return c.json({ ...org, role: "owner" }, 201);
});

organizationsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const org = await db
    .selectFrom("organizations")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  return c.json({ ...org, role: membership?.role || "admin" });
});

organizationsRoutes.put("/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (membership && membership.role !== "owner" && !user.is_admin) {
    return c.json({ error: "Only owners can update the organization" }, 403);
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.slug !== undefined) {
    const existingSlug = await db
      .selectFrom("organizations")
      .select("id")
      .where("slug", "=", body.slug)
      .where("id", "!=", id)
      .executeTakeFirst();

    if (existingSlug) {
      return c.json({ error: "Slug already in use" }, 409);
    }
    updateData.slug = body.slug;
  }

  const org = await db
    .updateTable("organizations")
    .set(updateData)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  return c.json(org);
});

organizationsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (membership && membership.role !== "owner" && !user.is_admin) {
    return c.json({ error: "Only owners can delete the organization" }, 403);
  }

  await db.deleteFrom("organizations").where("id", "=", id).execute();

  return c.json({ deleted: true });
});

organizationsRoutes.get("/:id/members", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const members = await db
    .selectFrom("user_organizations")
    .innerJoin("users", "users.id", "user_organizations.user_id")
    .select([
      "users.id",
      "users.email",
      "user_organizations.role",
      "user_organizations.joined_at",
    ])
    .where("user_organizations.organization_id", "=", id)
    .orderBy("user_organizations.joined_at", "asc")
    .execute();

  return c.json(members);
});

organizationsRoutes.post("/:id/members", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (
    membership &&
    !["owner", "admin"].includes(membership.role) &&
    !user.is_admin
  ) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  if (!body.email) {
    return c.json({ error: "Email is required" }, 400);
  }

  const targetUser = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", body.email.toLowerCase().trim())
    .executeTakeFirst();

  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const existingMembership = await db
    .selectFrom("user_organizations")
    .select("id")
    .where("user_id", "=", targetUser.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (existingMembership) {
    return c.json({ error: "User is already a member" }, 409);
  }

  await db
    .insertInto("user_organizations")
    .values({
      user_id: targetUser.id,
      organization_id: id,
      role: body.role || "member",
    })
    .execute();

  return c.json({ success: true }, 201);
});

organizationsRoutes.delete("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));
  const targetUserId = parseInt(c.req.param("userId"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (user.id === targetUserId) {
    await db
      .deleteFrom("user_organizations")
      .where("user_id", "=", targetUserId)
      .where("organization_id", "=", orgId)
      .execute();
    return c.json({ deleted: true });
  }

  if (
    membership &&
    !["owner", "admin"].includes(membership.role) &&
    !user.is_admin
  ) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  await db
    .deleteFrom("user_organizations")
    .where("user_id", "=", targetUserId)
    .where("organization_id", "=", orgId)
    .execute();

  return c.json({ deleted: true });
});

organizationsRoutes.get("/:id/tenants", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const tenants = await db
    .selectFrom("tenants")
    .selectAll()
    .where("organization_id", "=", id)
    .orderBy("created_at", "desc")
    .execute();

  return c.json(tenants);
});

interface WalletConfig {
  solana?: {
    "mainnet-beta"?: {
      address: string;
      key?: string;
    };
  };
  evm?: {
    base?: { address: string; key?: string };
    polygon?: { address: string; key?: string };
    monad?: { address: string; key?: string };
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

organizationsRoutes.get("/:id/wallet", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const org = await db
    .selectFrom("organizations")
    .select("wallet_config")
    .where("id", "=", id)
    .executeTakeFirst();

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const walletConfig = org.wallet_config as WalletConfig | null;
  const addresses = extractAddresses(walletConfig);

  return c.json({
    hasWallet: walletConfig !== null,
    addresses,
  });
});

organizationsRoutes.put("/:id/wallet", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (membership && membership.role !== "owner" && !user.is_admin) {
    return c.json({ error: "Only owners can manage wallets" }, 403);
  }

  if (!body.wallet_config) {
    return c.json({ error: "wallet_config is required" }, 400);
  }

  const encryptedConfig = encryptWalletKeys(body.wallet_config);

  await db
    .updateTable("organizations")
    .set({ wallet_config: JSON.stringify(encryptedConfig) })
    .where("id", "=", id)
    .execute();

  const addresses = extractAddresses(body.wallet_config as WalletConfig);

  return c.json({
    hasWallet: true,
    addresses,
  });
});

organizationsRoutes.get("/:id/wallet/balances", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", id)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const org = await db
    .selectFrom("organizations")
    .select("wallet_config")
    .where("id", "=", id)
    .executeTakeFirst();

  if (!org || !org.wallet_config) {
    return c.json({ error: "No wallet configured" }, 404);
  }

  const walletConfig = org.wallet_config as WalletConfig;
  const addresses = extractAddresses(walletConfig);

  if (!addresses.solana && !addresses.evm) {
    return c.json({ error: "No wallet addresses found" }, 404);
  }

  try {
    const balances = await fetchWalletBalances(addresses);
    return c.json(balances);
  } catch (error) {
    logger.error(`Failed to fetch balances: ${error}`);
    return c.json({ error: "Failed to fetch balances" }, 500);
  }
});
