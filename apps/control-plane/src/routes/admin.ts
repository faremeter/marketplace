import { Hono } from "hono";
import { db } from "../server.js";
import { requireAdmin } from "../middleware/auth.js";
import { syncToNode } from "../lib/sync.js";
import { logger } from "../logger.js";
import { encryptWalletKeys } from "../lib/crypto.js";
import { fetchWalletBalances } from "../lib/balances.js";
import {
  createHealthCheck,
  upsertNodeDnsRecord,
  deleteHealthCheck,
  deleteNodeDnsRecord,
} from "../lib/dns.js";
import {
  enqueueCertProvisioning,
  enqueueTenantDeletion,
  checkAndUpdateTenantStatus,
} from "../lib/queue.js";

export const adminRoutes = new Hono();

adminRoutes.use("*", requireAdmin);

adminRoutes.get("/users", async (c) => {
  const users = await db
    .selectFrom("users")
    .select(["id", "email", "is_admin", "email_verified", "created_at"])
    .orderBy("created_at", "desc")
    .execute();

  return c.json(users);
});

adminRoutes.get("/users/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  const user = await db
    .selectFrom("users")
    .select(["id", "email", "is_admin", "email_verified", "created_at"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

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
      "user_organizations.role",
    ])
    .where("user_organizations.user_id", "=", id)
    .execute();

  return c.json({ ...user, organizations });
});

adminRoutes.put("/users/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const updateData: Record<string, unknown> = {};
  if (body.is_admin !== undefined) updateData.is_admin = body.is_admin;
  if (body.email_verified !== undefined)
    updateData.email_verified = body.email_verified;

  const user = await db
    .updateTable("users")
    .set(updateData)
    .where("id", "=", id)
    .returning(["id", "email", "is_admin", "email_verified", "created_at"])
    .executeTakeFirst();

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

adminRoutes.delete("/users/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const currentUser = c.get("user");

  if (currentUser.id === id) {
    return c.json({ error: "Cannot delete yourself" }, 400);
  }

  const result = await db
    .deleteFrom("users")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ deleted: true });
});

adminRoutes.get("/organizations", async (c) => {
  const organizations = await db
    .selectFrom("organizations")
    .leftJoin(
      "user_organizations",
      "organizations.id",
      "user_organizations.organization_id",
    )
    .leftJoin("tenants", "organizations.id", "tenants.organization_id")
    .select([
      "organizations.id",
      "organizations.name",
      "organizations.slug",
      "organizations.is_admin",
      "organizations.created_at",
    ])
    .select((eb) => [
      eb.fn
        .count<number>("user_organizations.id")
        .distinct()
        .as("member_count"),
      eb.fn.count<number>("tenants.id").distinct().as("tenant_count"),
    ])
    .groupBy("organizations.id")
    .orderBy("organizations.id", "asc")
    .execute();

  return c.json(organizations);
});

adminRoutes.get("/organizations/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  const org = await db
    .selectFrom("organizations")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!org) {
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
    .execute();

  const tenants = await db
    .selectFrom("tenants")
    .selectAll()
    .where("organization_id", "=", id)
    .execute();

  return c.json({ ...org, members, tenants });
});

adminRoutes.get("/tenants", async (c) => {
  const tenants = await db
    .selectFrom("tenants")
    .leftJoin("organizations", "organizations.id", "tenants.organization_id")
    .leftJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.backend_url",
      "tenants.organization_id",
      "tenants.default_price_usdc",
      "tenants.default_scheme",
      "tenants.is_active",
      "tenants.status",
      "tenants.wallet_id",
      "tenants.upstream_auth_header",
      "tenants.upstream_auth_value",
      "tenants.created_at",
      "organizations.name as organization_name",
      "wallets.name as wallet_name",
      "wallets.funding_status as wallet_funding_status",
      "wallets.organization_id as wallet_organization_id",
    ])
    .orderBy("tenants.created_at", "desc")
    .execute();

  const tenantNodes = await db
    .selectFrom("tenant_nodes")
    .innerJoin("nodes", "nodes.id", "tenant_nodes.node_id")
    .select([
      "tenant_nodes.tenant_id",
      "tenant_nodes.node_id",
      "tenant_nodes.cert_status",
      "tenant_nodes.is_primary",
      "nodes.name as node_name",
    ])
    .execute();

  const nodesByTenant: Record<
    number,
    {
      id: number;
      name: string;
      cert_status: string | null;
      is_primary: boolean;
    }[]
  > = {};
  for (const tn of tenantNodes) {
    const arr =
      nodesByTenant[tn.tenant_id] ?? (nodesByTenant[tn.tenant_id] = []);
    arr.push({
      id: tn.node_id,
      name: tn.node_name,
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

adminRoutes.post("/tenants", async (c) => {
  const body = await c.req.json();
  const nodeIds: number[] =
    body.node_ids ?? (body.node_id ? [body.node_id] : []);

  // Get or default to master wallet
  let walletId = body.wallet_id;

  if (!walletId) {
    // Try to find master wallet (organization_id = null)
    const masterWallet = await db
      .selectFrom("wallets")
      .select("id")
      .where("organization_id", "is", null)
      .executeTakeFirst();

    if (masterWallet) {
      walletId = masterWallet.id;
    }
  }

  const tenant = await db
    .insertInto("tenants")
    .values({
      name: body.name,
      backend_url: body.backend_url,
      node_id: nodeIds[0] ?? null,
      organization_id: body.organization_id ?? null,
      wallet_id: walletId ?? null,
      default_price_usdc: body.default_price_usdc ?? 0,
      default_scheme: body.default_scheme ?? "exact",
      upstream_auth_header: body.upstream_auth_header ?? null,
      upstream_auth_value: body.upstream_auth_value ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  for (const [i, nodeId] of nodeIds.entries()) {
    const isPrimary = i === 0;

    const node = await db
      .selectFrom("nodes")
      .select(["id", "public_ip", "status"])
      .where("id", "=", nodeId)
      .executeTakeFirst();

    if (!node) {
      logger.warn(`Node ${nodeId} not found, skipping`);
      continue;
    }

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

  // Check if tenant can immediately transition to active
  // (e.g., if no wallet and no nodes)
  await checkAndUpdateTenantStatus(tenant.id);

  return c.json(tenant, 201);
});

adminRoutes.put("/tenants/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.backend_url !== undefined) updateData.backend_url = body.backend_url;
  if (body.organization_id !== undefined)
    updateData.organization_id = body.organization_id;
  if (body.node_id !== undefined) updateData.node_id = body.node_id;
  if (body.is_active !== undefined) updateData.is_active = body.is_active;
  if (body.upstream_auth_header !== undefined)
    updateData.upstream_auth_header = body.upstream_auth_header;
  if (body.upstream_auth_value !== undefined)
    updateData.upstream_auth_value = body.upstream_auth_value;
  if (body.wallet_id !== undefined) updateData.wallet_id = body.wallet_id;

  const result = await db
    .updateTable("tenants")
    .set(updateData)
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  // Sync to all nodes the tenant is on
  const tenantNodes = await db
    .selectFrom("tenant_nodes")
    .select("node_id")
    .where("tenant_id", "=", id)
    .execute();

  for (const tn of tenantNodes) {
    syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
  }

  return c.json(result);
});

adminRoutes.delete("/tenants/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  const tenant = await db
    .selectFrom("tenants")
    .leftJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.status",
      "tenants.wallet_id",
      "wallets.wallet_config",
    ])
    .where("tenants.id", "=", id)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  // Check tenant status
  if (tenant.status === "pending") {
    return c.json(
      { error: "Cannot delete tenant while initialization is in progress" },
      400,
    );
  }

  if (tenant.status === "deleting") {
    return c.json({ error: "Tenant is already being deleted" }, 400);
  }

  // Check wallet funds if tenant has a wallet
  if (tenant.wallet_id && tenant.wallet_config) {
    const walletConfig = tenant.wallet_config as WalletConfig;
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
              error: "Cannot delete tenant with funds in wallet",
              hasWalletFunds: true,
            },
            400,
          );
        }
      } catch (err) {
        logger.error(
          `Failed to check wallet balances for tenant ${id}: ${err}`,
        );
        return c.json({ error: "Failed to verify wallet is empty" }, 500);
      }
    }
  }

  // Set status to deleting
  await db
    .updateTable("tenants")
    .set({ status: "deleting" })
    .where("id", "=", id)
    .execute();

  // Enqueue deletion job
  await enqueueTenantDeletion(tenant.id, tenant.name);

  return c.json({ success: true });
});

adminRoutes.post("/tenants/:id/nodes", async (c) => {
  const tenantId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const nodeId = body.node_id;

  if (!nodeId) {
    return c.json({ error: "node_id is required" }, 400);
  }

  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "name"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const node = await db
    .selectFrom("nodes")
    .select(["id", "public_ip", "status"])
    .where("id", "=", nodeId)
    .executeTakeFirst();

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  const existing = await db
    .selectFrom("tenant_nodes")
    .select(["id"])
    .where("tenant_id", "=", tenantId)
    .where("node_id", "=", nodeId)
    .executeTakeFirst();

  if (existing) {
    return c.json({ error: "Node already assigned to tenant" }, 400);
  }

  const hasOtherNodes = await db
    .selectFrom("tenant_nodes")
    .select(["id"])
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  const isPrimary = !hasOtherNodes;

  const result = await db
    .insertInto("tenant_nodes")
    .values({
      tenant_id: tenantId,
      node_id: nodeId,
      is_primary: isPrimary,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (node.public_ip) {
    const healthCheckId = await createHealthCheck(tenant.name, node.public_ip);
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

  return c.json({ success: true, is_primary: isPrimary }, 201);
});

adminRoutes.delete("/tenants/:id/nodes/:nodeId", async (c) => {
  const tenantId = parseInt(c.req.param("id"));
  const nodeId = parseInt(c.req.param("nodeId"));

  const tenantNode = await db
    .selectFrom("tenant_nodes")
    .select(["id", "is_primary", "cert_status", "health_check_id"])
    .where("tenant_id", "=", tenantId)
    .where("node_id", "=", nodeId)
    .executeTakeFirst();

  if (!tenantNode) {
    return c.json({ error: "Node not assigned to tenant" }, 404);
  }

  if (
    tenantNode.cert_status === "pending" ||
    tenantNode.cert_status === "deleting"
  ) {
    return c.json(
      { error: "Cannot remove node while operation is in progress" },
      400,
    );
  }

  const tenant = await db
    .selectFrom("tenants")
    .select(["name"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  await db
    .updateTable("tenant_nodes")
    .set({ cert_status: "deleting" })
    .where("tenant_id", "=", tenantId)
    .where("node_id", "=", nodeId)
    .execute();

  const cleanup = async () => {
    try {
      if (tenantNode.health_check_id) {
        await deleteHealthCheck(tenantNode.health_check_id);
      }
      await deleteNodeDnsRecord(tenant.name, nodeId);

      await db
        .deleteFrom("tenant_nodes")
        .where("tenant_id", "=", tenantId)
        .where("node_id", "=", nodeId)
        .execute();

      if (tenantNode.is_primary) {
        const nextNode = await db
          .selectFrom("tenant_nodes")
          .select(["id", "node_id"])
          .where("tenant_id", "=", tenantId)
          .orderBy("id", "asc")
          .executeTakeFirst();

        if (nextNode) {
          await db
            .updateTable("tenant_nodes")
            .set({ is_primary: true })
            .where("id", "=", nextNode.id)
            .execute();

          await db
            .updateTable("tenants")
            .set({ node_id: nextNode.node_id })
            .where("id", "=", tenantId)
            .execute();

          syncToNode(nextNode.node_id).catch((err) =>
            logger.error(String(err)),
          );
        } else {
          await db
            .updateTable("tenants")
            .set({ node_id: null })
            .where("id", "=", tenantId)
            .execute();
        }
      }

      syncToNode(nodeId).catch((err) => logger.error(String(err)));
      logger.info(`Removed node ${nodeId} from tenant ${tenant.name}`);
    } catch (err) {
      logger.error(
        `Failed to cleanup node ${nodeId} from tenant ${tenant.name}: ${err}`,
      );
      await db
        .deleteFrom("tenant_nodes")
        .where("tenant_id", "=", tenantId)
        .where("node_id", "=", nodeId)
        .execute();
    }
  };

  cleanup();

  return c.json({ success: true });
});

adminRoutes.get("/tenants/:tenantId/endpoints", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId"));

  const tenant = await db
    .selectFrom("tenants")
    .select("id")
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const endpoints = await db
    .selectFrom("endpoints")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("is_active", "=", true)
    .orderBy("priority", "asc")
    .orderBy("created_at", "desc")
    .execute();

  return c.json(endpoints);
});

adminRoutes.put("/tenants/:tenantId/endpoints/:endpointId", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId"));
  const endpointId = parseInt(c.req.param("endpointId"));
  const body = await c.req.json();

  const updateData: Record<string, unknown> = {};
  if (body.path !== undefined) {
    const inputPath = body.path;
    // Process path pattern similar to endpoints.ts
    if (inputPath.startsWith("^")) {
      updateData.path = inputPath;
      updateData.path_pattern = inputPath;
    } else if (inputPath.includes("{")) {
      const regex = "^" + inputPath.replace(/\{[^}]+\}/g, "[^/]+") + "$";
      updateData.path = inputPath;
      updateData.path_pattern = regex;
    } else {
      updateData.path = inputPath;
      updateData.path_pattern = inputPath;
    }
  }
  if (body.price_usdc !== undefined) updateData.price_usdc = body.price_usdc;
  if (body.scheme !== undefined) updateData.scheme = body.scheme;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.priority !== undefined) updateData.priority = body.priority;

  const result = await db
    .updateTable("endpoints")
    .set(updateData)
    .where("id", "=", endpointId)
    .where("tenant_id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Endpoint not found" }, 404);
  }

  // Sync to all nodes the tenant is on
  const tenantNodes = await db
    .selectFrom("tenant_nodes")
    .select("node_id")
    .where("tenant_id", "=", tenantId)
    .execute();

  for (const tn of tenantNodes) {
    syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
  }

  return c.json(result);
});

adminRoutes.get("/transactions", async (c) => {
  const limit = parseInt(c.req.query("limit") || "100");
  const offset = parseInt(c.req.query("offset") || "0");

  const transactions = await db
    .selectFrom("transactions")
    .leftJoin("tenants", "tenants.id", "transactions.tenant_id")
    .select([
      "transactions.id",
      "transactions.endpoint_id",
      "transactions.tenant_id",
      "transactions.amount_usdc",
      "transactions.tx_hash",
      "transactions.network",
      "transactions.request_path",
      "transactions.created_at",
      "tenants.name as tenant_name",
    ])
    .orderBy("transactions.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .execute();

  const countResult = await db
    .selectFrom("transactions")
    .select(db.fn.count<number>("id").as("count"))
    .executeTakeFirst();

  return c.json({
    transactions,
    total: countResult?.count || 0,
    limit,
    offset,
  });
});

adminRoutes.get("/nodes", async (c) => {
  const nodes = await db
    .selectFrom("nodes")
    .leftJoin("tenants", "tenants.node_id", "nodes.id")
    .select([
      "nodes.id",
      "nodes.name",
      "nodes.internal_ip",
      "nodes.status",
      "nodes.wireguard_public_key",
      "nodes.wireguard_address",
      "nodes.created_at",
      db.fn.count<number>("tenants.id").as("tenant_count"),
    ])
    .groupBy("nodes.id")
    .orderBy("nodes.created_at", "desc")
    .execute();

  return c.json(nodes);
});

adminRoutes.get("/nodes/:id/tenants", async (c) => {
  const id = parseInt(c.req.param("id"));

  const tenants = await db
    .selectFrom("tenant_nodes")
    .innerJoin("tenants", "tenants.id", "tenant_nodes.tenant_id")
    .leftJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.backend_url",
      "tenants.is_active",
      "tenants.wallet_id",
      "wallets.funding_status as wallet_funding_status",
      "tenant_nodes.is_primary",
      "tenant_nodes.cert_status",
    ])
    .where("tenant_nodes.node_id", "=", id)
    .execute();

  return c.json(tenants);
});

adminRoutes.get("/cert-status", async (c) => {
  const statuses = await db
    .selectFrom("tenant_nodes")
    .innerJoin("tenants", "tenants.id", "tenant_nodes.tenant_id")
    .innerJoin("nodes", "nodes.id", "tenant_nodes.node_id")
    .select([
      "tenant_nodes.id",
      "tenants.name as tenant_name",
      "nodes.name as node_name",
      "tenant_nodes.node_id",
      "tenant_nodes.cert_status",
      "tenant_nodes.is_primary",
    ])
    .orderBy("tenants.name")
    .orderBy("nodes.id")
    .execute();

  return c.json(statuses);
});

adminRoutes.get("/nodes/:id/health", async (c) => {
  const id = parseInt(c.req.param("id"));

  if (process.env.NODE_ENV === "development") {
    return c.json({ healthy: true, dev: true });
  }

  const node = await db
    .selectFrom("nodes")
    .select(["internal_ip"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!node?.internal_ip) {
    return c.json({
      healthy: false,
      error: "Node not found or no internal IP",
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${node.internal_ip}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return c.json({ healthy: response.ok });
  } catch {
    return c.json({ healthy: false });
  }
});

adminRoutes.get("/stats", async (c) => {
  const [usersCount, orgsCount, tenantsCount, nodesCount, transactionsCount] =
    await Promise.all([
      db
        .selectFrom("users")
        .select(db.fn.count<number>("id").as("count"))
        .executeTakeFirst(),
      db
        .selectFrom("organizations")
        .select(db.fn.count<number>("id").as("count"))
        .executeTakeFirst(),
      db
        .selectFrom("tenants")
        .select(db.fn.count<number>("id").as("count"))
        .executeTakeFirst(),
      db
        .selectFrom("nodes")
        .select(db.fn.count<number>("id").as("count"))
        .executeTakeFirst(),
      db
        .selectFrom("transactions")
        .select(db.fn.count<number>("id").as("count"))
        .executeTakeFirst(),
    ]);

  return c.json({
    users: usersCount?.count || 0,
    organizations: orgsCount?.count || 0,
    tenants: tenantsCount?.count || 0,
    nodes: nodesCount?.count || 0,
    transactions: transactionsCount?.count || 0,
  });
});

interface WalletConfig {
  solana?: {
    "mainnet-beta"?: {
      address: string;
      key: string;
    };
  };
  evm?: {
    base?: { address: string; key: string };
    polygon?: { address: string; key: string };
    monad?: { address: string; key: string };
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

adminRoutes.get("/settings", async (c) => {
  const settings = await db
    .selectFrom("admin_settings")
    .selectAll()
    .executeTakeFirst();

  if (!settings) {
    return c.json({ error: "Settings not found" }, 404);
  }

  const walletConfig = settings.wallet_config as WalletConfig | null;
  const addresses = extractAddresses(walletConfig);

  return c.json({
    hasWallet: walletConfig !== null,
    addresses,
    minimumBalanceSol: settings.minimum_balance_sol,
    minimumBalanceUsdc: settings.minimum_balance_usdc,
    updatedAt: settings.updated_at,
  });
});

adminRoutes.put("/settings", async (c) => {
  const body = await c.req.json();

  const updateData: Record<string, unknown> = {
    updated_at: new Date(),
  };

  if (body.wallet_config !== undefined) {
    updateData.wallet_config = body.wallet_config
      ? JSON.stringify(encryptWalletKeys(body.wallet_config))
      : null;
  }

  if (body.minimum_balance_sol !== undefined) {
    const amount = parseFloat(body.minimum_balance_sol);
    if (isNaN(amount) || amount < 0.001 || amount > 1) {
      return c.json(
        { error: "Minimum SOL balance must be between 0.001 and 1" },
        400,
      );
    }
    updateData.minimum_balance_sol = amount;
  }

  if (body.minimum_balance_usdc !== undefined) {
    const amount = parseFloat(body.minimum_balance_usdc);
    if (isNaN(amount) || amount < 0.001 || amount > 100) {
      return c.json(
        { error: "Minimum USDC balance must be between 0.001 and 100" },
        400,
      );
    }
    updateData.minimum_balance_usdc = amount;
  }

  const settings = await db
    .updateTable("admin_settings")
    .set(updateData)
    .where("id", "=", 1)
    .returningAll()
    .executeTakeFirst();

  if (!settings) {
    return c.json({ error: "Settings not found" }, 404);
  }

  const walletConfig = body.wallet_config as WalletConfig | null;
  const addresses = extractAddresses(walletConfig);

  return c.json({
    hasWallet: walletConfig !== null,
    addresses,
    minimumBalanceSol: settings.minimum_balance_sol,
    minimumBalanceUsdc: settings.minimum_balance_usdc,
    updatedAt: settings.updated_at,
  });
});

adminRoutes.get("/settings/balances", async (c) => {
  const settings = await db
    .selectFrom("admin_settings")
    .select("wallet_config")
    .executeTakeFirst();

  if (!settings || !settings.wallet_config) {
    return c.json({ error: "No wallet configured" }, 404);
  }

  const walletConfig = settings.wallet_config as WalletConfig;
  const addresses = extractAddresses(walletConfig);

  if (!addresses.solana && !addresses.evm) {
    return c.json({ error: "No wallet addresses found" }, 404);
  }

  try {
    const balances = await fetchWalletBalances(addresses);
    return c.json(balances);
  } catch (error) {
    logger.error(`Failed to fetch master wallet balances: ${error}`);
    return c.json({ error: "Failed to fetch balances" }, 500);
  }
});
