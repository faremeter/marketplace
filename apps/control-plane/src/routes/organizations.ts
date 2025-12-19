import { Hono } from "hono";
import { randomBytes } from "crypto";
import { db } from "../server.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchWalletBalances } from "../lib/balances.js";
import { logger } from "../logger.js";
import { syncToNode } from "../lib/sync.js";
import { createHealthCheck, upsertNodeDnsRecord } from "../lib/dns.js";
import {
  enqueueCertProvisioning,
  enqueueTenantDeletion,
} from "../lib/queue.js";

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
    .leftJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.backend_url",
      "tenants.is_active",
      "tenants.status",
      "tenants.wallet_id",
      "tenants.upstream_auth_header",
      "tenants.upstream_auth_value",
      "tenants.created_at",
      "tenants.default_price_usdc",
      "tenants.default_scheme",
      "wallets.name as wallet_name",
      "wallets.funding_status as wallet_funding_status",
    ])
    .where("tenants.organization_id", "=", id)
    .orderBy("tenants.created_at", "desc")
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
  if (body.wallet_id !== undefined) {
    // Validate wallet belongs to this org
    if (body.wallet_id !== null) {
      const wallet = await db
        .selectFrom("wallets")
        .select(["id", "organization_id"])
        .where("id", "=", body.wallet_id)
        .executeTakeFirst();

      if (!wallet || wallet.organization_id !== orgId) {
        return c.json({ error: "Wallet not found" }, 404);
      }
    }
    updateData.wallet_id = body.wallet_id;
  }

  const result = await db
    .updateTable("tenants")
    .set(updateData)
    .where("id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Tenant not found" }, 404);
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
    .leftJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.status",
      "tenants.wallet_id",
      "tenants.organization_id",
      "wallets.wallet_config",
    ])
    .where("tenants.id", "=", tenantId)
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

organizationsRoutes.get("/:id/can-create-proxy", async (c) => {
  const orgId = parseInt(c.req.param("id"));

  const adminSettings = await db
    .selectFrom("admin_settings")
    .select(["minimum_balance_sol", "minimum_balance_usdc"])
    .where("id", "=", 1)
    .executeTakeFirst();

  const minSol = adminSettings?.minimum_balance_sol ?? 0.001;
  const minUsdc = adminSettings?.minimum_balance_usdc ?? 0.01;

  const wallets = await db
    .selectFrom("wallets")
    .select(["wallet_config", "funding_status"])
    .where("organization_id", "=", orgId)
    .execute();

  if (wallets.length === 0) {
    return c.json({
      available: false,
      reason: "no_wallet",
      minimumSol: minSol,
      minimumUsdc: minUsdc,
    });
  }

  // First check if any wallet has funding_status = "funded" (cached status)
  const hasFundedWallet = wallets.some((w) => w.funding_status === "funded");
  if (hasFundedWallet) {
    return c.json({ available: true });
  }

  // Fallback: fetch live balances for wallets with Solana addresses
  for (const wallet of wallets) {
    const walletConfig = wallet.wallet_config as {
      solana?: { "mainnet-beta"?: { address?: string } };
    } | null;
    const solanaAddress = walletConfig?.solana?.["mainnet-beta"]?.address;

    if (!solanaAddress) continue;

    try {
      const balances = await fetchWalletBalances({
        solana: solanaAddress,
        evm: null,
      });
      const solBalance = parseFloat(balances.solana.native);
      const usdcBalance = parseFloat(balances.solana.usdc);

      if (solBalance >= minSol && usdcBalance >= minUsdc) {
        return c.json({ available: true });
      }
    } catch {
      // RPC failure, continue checking other wallets
    }
  }

  return c.json({
    available: false,
    reason: "insufficient_funds",
    minimumSol: minSol,
    minimumUsdc: minUsdc,
  });
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

  if (!body.wallet_id) {
    return c.json({ error: "Wallet ID is required" }, 400);
  }

  // Validate wallet belongs to this org
  const wallet = await db
    .selectFrom("wallets")
    .selectAll()
    .where("id", "=", body.wallet_id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!wallet) {
    return c.json(
      { error: "Wallet not found or does not belong to this organization" },
      400,
    );
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

  const tenant = await db
    .insertInto("tenants")
    .values({
      name: body.name.trim(),
      backend_url: body.backend_url.trim(),
      node_id: nodeIds[0],
      organization_id: orgId,
      wallet_id: body.wallet_id,
      default_price_usdc: body.default_price_usdc ?? 0,
      default_scheme: body.default_scheme ?? "exact",
      upstream_auth_header: body.upstream_auth_header?.trim() || null,
      upstream_auth_value: body.upstream_auth_value?.trim() || null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

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

// Invitation routes

organizationsRoutes.get("/:id/invitations", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!membership && !user.is_admin) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const invitations = await db
    .selectFrom("organization_invitations")
    .leftJoin("users", "users.id", "organization_invitations.invited_by")
    .select([
      "organization_invitations.id",
      "organization_invitations.email",
      "organization_invitations.role",
      "organization_invitations.token",
      "organization_invitations.expires_at",
      "organization_invitations.created_at",
      "users.email as invited_by_email",
    ])
    .where("organization_invitations.organization_id", "=", orgId)
    .where("organization_invitations.accepted_at", "is", null)
    .where("organization_invitations.expires_at", ">", new Date())
    .orderBy("organization_invitations.created_at", "desc")
    .execute();

  return c.json(invitations);
});

organizationsRoutes.post("/:id/invitations", async (c) => {
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

  if (
    membership &&
    !["owner", "admin"].includes(membership.role) &&
    !user.is_admin
  ) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  if (!body.email?.trim()) {
    return c.json({ error: "Email is required" }, 400);
  }

  const email = body.email.trim().toLowerCase();

  // Check if user is already a member
  const existingUser = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (existingUser) {
    const existingMembership = await db
      .selectFrom("user_organizations")
      .select("id")
      .where("user_id", "=", existingUser.id)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();

    if (existingMembership) {
      return c.json({ error: "User is already a member" }, 409);
    }
  }

  // Check for existing pending invitation
  const existingInvitation = await db
    .selectFrom("organization_invitations")
    .select("id")
    .where("organization_id", "=", orgId)
    .where("email", "=", email)
    .where("accepted_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();

  if (existingInvitation) {
    return c.json(
      { error: "An invitation is already pending for this email" },
      409,
    );
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await db
    .insertInto("organization_invitations")
    .values({
      organization_id: orgId,
      email,
      token,
      role: body.role || "member",
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(invitation, 201);
});

organizationsRoutes.delete("/:id/invitations/:invitationId", async (c) => {
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));
  const invitationId = parseInt(c.req.param("invitationId"));

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", orgId)
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

  const invitation = await db
    .selectFrom("organization_invitations")
    .select("id")
    .where("id", "=", invitationId)
    .where("organization_id", "=", orgId)
    .executeTakeFirst();

  if (!invitation) {
    return c.json({ error: "Invitation not found" }, 404);
  }

  await db
    .deleteFrom("organization_invitations")
    .where("id", "=", invitationId)
    .execute();

  return c.json({ deleted: true });
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
