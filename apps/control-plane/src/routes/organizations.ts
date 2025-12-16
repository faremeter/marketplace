import { Hono } from "hono";
import { db } from "../server.js";
import { requireAuth } from "../middleware/auth.js";
import { encryptWalletKeys } from "../lib/crypto.js";
import { fetchWalletBalances } from "../lib/balances.js";
import { logger } from "../logger.js";
import { syncToNode } from "../lib/sync.js";
import { createHealthCheck, upsertNodeDnsRecord } from "../lib/dns.js";
import {
  enqueueCertProvisioning,
  enqueueWalletFunding,
  enqueueTenantDeletion,
} from "../lib/queue.js";
import { Keypair } from "@solana/web3.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

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
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.backend_url",
      "tenants.is_active",
      "tenants.status",
      "tenants.wallet_status",
      "tenants.upstream_auth_header",
      "tenants.upstream_auth_value",
      "tenants.created_at",
      "tenants.default_price_usdc",
      "tenants.default_scheme",
    ])
    .where("organization_id", "=", id)
    .orderBy("created_at", "desc")
    .execute();

  const tenantIds = tenants.map((t) => t.id);

  const tenantNodes =
    tenantIds.length > 0
      ? await db
          .selectFrom("tenant_nodes")
          .select([
            "tenant_nodes.tenant_id",
            "tenant_nodes.node_id",
            "tenant_nodes.cert_status",
            "tenant_nodes.is_primary",
          ])
          .where("tenant_nodes.tenant_id", "in", tenantIds)
          .execute()
      : [];

  const nodesByTenant: Record<
    number,
    { id: number; cert_status: string | null; is_primary: boolean }[]
  > = {};
  for (const tn of tenantNodes) {
    const arr =
      nodesByTenant[tn.tenant_id] ?? (nodesByTenant[tn.tenant_id] = []);
    arr.push({
      id: tn.node_id,
      cert_status: tn.cert_status,
      is_primary: tn.is_primary,
    });
  }

  const result = tenants.map((t) => ({
    ...t,
    nodes: nodesByTenant[t.id] ?? [],
  }));

  return c.json(result);
});

function generateWalletConfig(): WalletConfig {
  const solKeypair = Keypair.generate();
  const evmKey = generatePrivateKey();
  const evmAddress = privateKeyToAccount(evmKey).address;

  return {
    solana: {
      "mainnet-beta": {
        address: solKeypair.publicKey.toBase58(),
        key: "[" + solKeypair.secretKey.toString() + "]",
      },
    },
    evm: {
      base: { key: evmKey, address: evmAddress },
      polygon: { key: evmKey, address: evmAddress },
      monad: { key: evmKey, address: evmAddress },
    },
  };
}

organizationsRoutes.put("/:id/tenants/:tenantId", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));
  const tenantId = parseInt(c.req.param("tenantId"));
  const body = await c.req.json();

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "node_id", "organization_id"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant || tenant.organization_id !== orgId) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const updateData: Record<string, unknown> = {};
  if (body.backend_url !== undefined) updateData.backend_url = body.backend_url;
  if (body.is_active !== undefined) updateData.is_active = body.is_active;
  if (body.upstream_auth_header !== undefined)
    updateData.upstream_auth_header = body.upstream_auth_header;
  if (body.upstream_auth_value !== undefined)
    updateData.upstream_auth_value = body.upstream_auth_value;
  if (body.default_price_usdc !== undefined)
    updateData.default_price_usdc = body.default_price_usdc;
  if (body.default_scheme !== undefined)
    updateData.default_scheme = body.default_scheme;

  const result = await db
    .updateTable("tenants")
    .set(updateData)
    .where("id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  if (result.node_id) {
    syncToNode(result.node_id).catch((err) => logger.error(String(err)));
  }

  return c.json(result);
});

organizationsRoutes.delete("/:id/tenants/:tenantId", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));
  const tenantId = parseInt(c.req.param("tenantId"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "name", "status", "wallet_config", "organization_id"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant || tenant.organization_id !== orgId) {
    return c.json({ error: "Proxy not found" }, 404);
  }

  if (tenant.status === "pending") {
    return c.json(
      { error: "Cannot delete proxy while initialization is in progress" },
      400,
    );
  }

  if (tenant.status === "deleting") {
    return c.json({ error: "Proxy is already being deleted" }, 400);
  }

  const walletConfig = tenant.wallet_config as WalletConfig | null;
  if (walletConfig) {
    const addresses = extractAddresses(walletConfig);

    if (addresses.solana || addresses.evm) {
      try {
        const balances = await fetchWalletBalances(addresses);

        const hasNonZeroBalance =
          parseFloat(balances.solana?.native || "0") > 0 ||
          parseFloat(balances.solana?.usdc || "0") > 0 ||
          parseFloat(balances.base?.native || "0") > 0 ||
          parseFloat(balances.base?.usdc || "0") > 0 ||
          parseFloat(balances.polygon?.native || "0") > 0 ||
          parseFloat(balances.polygon?.usdc || "0") > 0 ||
          parseFloat(balances.monad?.native || "0") > 0 ||
          parseFloat(balances.monad?.usdc || "0") > 0;

        if (hasNonZeroBalance) {
          return c.json(
            {
              error: "Please complete a payout before deleting this proxy",
              hasWalletFunds: true,
            },
            400,
          );
        }
      } catch (err) {
        logger.error(
          `Failed to check wallet balances for tenant ${tenantId}: ${err}`,
        );
        return c.json({ error: "Failed to verify wallet is empty" }, 500);
      }
    }
  }

  await db
    .updateTable("tenants")
    .set({ status: "deleting" })
    .where("id", "=", tenantId)
    .execute();

  await enqueueTenantDeletion(tenant.id, tenant.name);

  return c.json({ success: true });
});

organizationsRoutes.get("/:id/tenants/check-name", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));
  const name = c.req.query("name");

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (!name?.trim()) {
    return c.json({ available: false });
  }

  const existing = await db
    .selectFrom("tenants")
    .select("id")
    .where("name", "=", name.trim())
    .executeTakeFirst();

  return c.json({ available: !existing });
});

organizationsRoutes.post("/:id/tenants", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (!body.name?.trim()) {
    return c.json({ error: "Tenant name is required" }, 400);
  }

  if (!body.backend_url?.trim()) {
    return c.json({ error: "Backend URL is required" }, 400);
  }

  // Find 2 active nodes with least tenant count
  const nodesWithCounts = await db
    .selectFrom("nodes")
    .leftJoin("tenant_nodes", "tenant_nodes.node_id", "nodes.id")
    .select(["nodes.id", "nodes.public_ip", "nodes.status"])
    .select((eb) => [eb.fn.count<number>("tenant_nodes.id").as("tenant_count")])
    .where("nodes.status", "=", "active")
    .where("nodes.public_ip", "is not", null)
    .groupBy("nodes.id")
    .orderBy("tenant_count", "asc")
    .limit(2)
    .execute();

  if (nodesWithCounts.length < 2) {
    return c.json({ error: "Not enough active nodes available" }, 400);
  }

  const nodeIds = nodesWithCounts.map((n) => n.id);

  // Get funding amounts from admin settings
  const adminSettings = await db
    .selectFrom("admin_settings")
    .select(["default_sol_native_amount", "default_sol_usdc_amount"])
    .where("id", "=", 1)
    .executeTakeFirst();

  const solAmount = adminSettings?.default_sol_native_amount ?? 0.01;
  const usdcAmount = adminSettings?.default_sol_usdc_amount ?? 0.01;

  // Generate wallet config server-side
  const walletConfig = generateWalletConfig();
  const solanaAddress = walletConfig.solana?.["mainnet-beta"]?.address;

  const tenant = await db
    .insertInto("tenants")
    .values({
      name: body.name.trim(),
      backend_url: body.backend_url.trim(),
      node_id: nodeIds[0],
      organization_id: orgId,
      wallet_config: JSON.stringify(
        encryptWalletKeys(walletConfig as Record<string, unknown>),
      ),
      wallet_status: solanaAddress ? "pending" : "funded",
      default_price_usdc: body.default_price_usdc ?? 0,
      default_scheme: body.default_scheme ?? "exact",
      upstream_auth_header: body.upstream_auth_header?.trim() || null,
      upstream_auth_value: body.upstream_auth_value?.trim() || null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Enqueue wallet funding if solana address exists
  if (solanaAddress) {
    enqueueWalletFunding(tenant.id, solanaAddress, solAmount, usdcAmount).catch(
      (err) => logger.error(`Failed to enqueue wallet funding: ${err}`),
    );
  }

  for (const [i, nodeId] of nodeIds.entries()) {
    const isPrimary = i === 0;
    const node = nodesWithCounts.find((n) => n.id === nodeId);

    if (!node) continue;

    const result = await db
      .insertInto("tenant_nodes")
      .values({
        tenant_id: tenant.id,
        node_id: nodeId,
        is_primary: isPrimary,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (node.public_ip) {
      const healthCheckId = await createHealthCheck(
        tenant.name,
        node.public_ip,
      );
      if (healthCheckId) {
        await db
          .updateTable("tenant_nodes")
          .set({ health_check_id: healthCheckId })
          .where("id", "=", result.id)
          .execute();
      }

      upsertNodeDnsRecord(
        tenant.name,
        nodeId,
        node.public_ip,
        healthCheckId,
      ).catch((err) => logger.error(`Failed to create DNS record: ${err}`));
    }

    if (node.status === "active") {
      enqueueCertProvisioning(nodeId, tenant.name).catch((err) =>
        logger.error(`Failed to enqueue cert provisioning: ${err}`),
      );
    }

    syncToNode(nodeId).catch((err) => logger.error(String(err)));
  }

  return c.json(tenant, 201);
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
