import { Hono } from "hono";
import { db } from "../db/instance.js";
import { requireAdmin } from "../middleware/auth.js";
import { syncToNode } from "../lib/sync.js";
import { logger } from "../logger.js";
import {
  encryptWalletKeys,
  type WalletConfig as CryptoWalletConfig,
} from "../lib/crypto.js";
import { fetchWalletBalances } from "../lib/balances.js";
import {
  createHealthCheck,
  upsertNodeDnsRecord,
  deleteHealthCheck,
  deleteNodeDnsRecord,
} from "../lib/dns.js";
import { toDomainInfo, type TenantDomainInfo } from "../lib/domain.js";
import {
  enqueueCertProvisioning,
  enqueueTenantDeletion,
  enqueueTenantRename,
  checkAndUpdateTenantStatus,
} from "../lib/queue.js";
import {
  setupAccountWithAddresses,
  updateAccountAddresses,
  findAccountByName,
  getTransactionsForAccount,
  type CorbitsTransaction,
} from "../lib/corbits-dash.js";
import { validateProxyName } from "../lib/proxy-name.js";
import { parsePagination } from "../lib/validation.js";
import { arktypeValidator } from "@hono/arktype-validator";
import {
  AdminCreateTenantSchema,
  AdminUpdateTenantSchema,
  AdminUpdateEndpointSchema,
  AdminUpdateUserSchema,
  AdminUpdateSettingsSchema,
  AdminAssignNodeSchema,
  AdminImportOrgsSchema,
} from "../lib/schemas.js";
import { slugify, generateSlugSuffix } from "../lib/slug.js";
import {
  getPlatformEarnings,
  getOrganizationEarnings,
  getTenantEarnings,
  getEndpointEarnings,
  getCatchAllEarnings,
  getEarningsByPeriod,
  type Granularity,
} from "../lib/analytics.js";

export const adminRoutes = new Hono();

// In-memory cache for Corbits transactions
interface TransactionCacheEntry {
  transactions: CorbitsTransaction[];
  cachedAt: number;
}
const transactionCache = new Map<number, TransactionCacheEntry>();
const TRANSACTIONS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

adminRoutes.use("*", requireAdmin);

adminRoutes.get("/analytics", async (c) => {
  const analytics = await getPlatformEarnings();
  return c.json(analytics);
});

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

adminRoutes.put(
  "/users/:id",
  arktypeValidator("json", AdminUpdateUserSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = c.req.valid("json");

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
  },
);

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
      "organizations.onboarding_completed",
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

adminRoutes.post(
  "/organizations/import",
  arktypeValidator("json", AdminImportOrgsSchema),
  async (c) => {
    const { names, skip_duplicates = true } = c.req.valid("json");

    const created: { name: string; slug: string }[] = [];
    const skipped: { name: string; slug: string }[] = [];
    const failed: { name: string; error: string }[] = [];

    for (const name of names) {
      try {
        let slug = slugify(name);

        const existing = await db
          .selectFrom("organizations")
          .select("id")
          .where("slug", "=", slug)
          .executeTakeFirst();

        if (existing) {
          if (skip_duplicates) {
            skipped.push({ name, slug });
            continue;
          }

          const maxRetries = 5;
          for (let i = 0; i < maxRetries; i++) {
            slug = `${slugify(name)}-${generateSlugSuffix()}`;
            const exists = await db
              .selectFrom("organizations")
              .select("id")
              .where("slug", "=", slug)
              .executeTakeFirst();
            if (!exists) break;
            if (i === maxRetries - 1) {
              throw new Error(
                `Could not generate unique slug after ${maxRetries} attempts`,
              );
            }
          }
        }

        await db.insertInto("organizations").values({ name, slug }).execute();

        created.push({ name, slug });
      } catch (err) {
        failed.push({
          name,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return c.json({ created, skipped, failed });
  },
);

adminRoutes.post("/organizations/check-slugs", async (c) => {
  const { slugs } = await c.req.json<{ slugs: string[] }>();

  if (!Array.isArray(slugs) || slugs.length === 0) {
    return c.json({ existing: [] });
  }

  const existing = await db
    .selectFrom("organizations")
    .select("slug")
    .where("slug", "in", slugs)
    .execute();

  return c.json({ existing: existing.map((o) => o.slug) });
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
    .selectAll("tenants")
    .where("organization_id", "=", id)
    .execute();

  // Add organization_slug to each tenant for URL generation
  const tenantsWithSlug = tenants.map((t) => ({
    ...t,
    organization_slug: org.slug,
  }));

  return c.json({ ...org, members, tenants: tenantsWithSlug });
});

adminRoutes.get("/wallets", async (c) => {
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
      "tenants.org_slug",
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

adminRoutes.get("/tenants/check-name", async (c) => {
  const name = c.req.query("name");
  const excludeId = c.req.query("excludeId");
  const organizationId = c.req.query("organization_id");
  const orgSlug = c.req.query("org_slug");

  if (!name?.trim()) {
    return c.json({ available: false });
  }

  let existing;

  if (orgSlug !== undefined) {
    if (orgSlug === "" || orgSlug === "null") {
      let query = db
        .selectFrom("tenants")
        .select("id")
        .where("name", "=", name.trim())
        .where("org_slug", "is", null);

      if (excludeId) {
        query = query.where("id", "!=", parseInt(excludeId));
      }

      existing = await query.executeTakeFirst();
    } else {
      let query = db
        .selectFrom("tenants")
        .select("id")
        .where("name", "=", name.trim())
        .where("org_slug", "=", orgSlug);

      if (excludeId) {
        query = query.where("id", "!=", parseInt(excludeId));
      }

      existing = await query.executeTakeFirst();
    }
  } else if (organizationId) {
    let query = db
      .selectFrom("tenants")
      .select("id")
      .where("name", "=", name.trim())
      .where("organization_id", "=", parseInt(organizationId))
      .where("org_slug", "is not", null);

    if (excludeId) {
      query = query.where("id", "!=", parseInt(excludeId));
    }

    existing = await query.executeTakeFirst();
  } else {
    let query = db
      .selectFrom("tenants")
      .select("id")
      .where("name", "=", name.trim())
      .where("org_slug", "is", null);

    if (excludeId) {
      query = query.where("id", "!=", parseInt(excludeId));
    }

    existing = await query.executeTakeFirst();
  }

  return c.json({ available: !existing });
});

adminRoutes.post(
  "/tenants",
  arktypeValidator("json", AdminCreateTenantSchema),
  async (c) => {
    const body = c.req.valid("json");
    const nodeIds: number[] =
      body.node_ids ?? (body.node_id ? [body.node_id] : []);

    const nameValidation = validateProxyName(body.name);
    if (!nameValidation.valid) {
      return c.json({ error: nameValidation.error }, 400);
    }
    const sanitizedName = nameValidation.sanitized;

    let walletId = body.wallet_id;

    if (!walletId) {
      const masterWallet = await db
        .selectFrom("wallets")
        .select("id")
        .where("organization_id", "is", null)
        .executeTakeFirst();

      if (masterWallet) {
        walletId = masterWallet.id;
      }
    }

    let orgSlug: string | null = null;

    if (body.organization_id) {
      const org = await db
        .selectFrom("organizations")
        .select("slug")
        .where("id", "=", body.organization_id)
        .executeTakeFirst();

      if (!org) {
        return c.json({ error: "Organization not found" }, 404);
      }
      orgSlug = org.slug;
    }

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: sanitizedName,
        backend_url: body.backend_url,
        organization_id: body.organization_id ?? null,
        wallet_id: walletId ?? null,
        default_price_usdc: body.default_price_usdc ?? 0,
        default_scheme: body.default_scheme ?? "exact",
        upstream_auth_header: body.upstream_auth_header ?? null,
        upstream_auth_value: body.upstream_auth_value ?? null,
        org_slug: orgSlug,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Build domain info for DNS/cert operations
    const domainInfo: TenantDomainInfo = {
      proxyName: sanitizedName,
      orgSlug,
    };

    const activeNodeIds: number[] = [];

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
          domainInfo,
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
          domainInfo,
          nodeId,
          node.public_ip,
          healthCheckId,
        ).catch((err) => logger.error(`Failed to create DNS record: ${err}`));
      }

      if (node.status === "active") {
        activeNodeIds.push(nodeId);
      }

      syncToNode(nodeId).catch((err) => logger.error(String(err)));
    }

    if (activeNodeIds.length > 0) {
      enqueueCertProvisioning(activeNodeIds, sanitizedName, orgSlug).catch(
        (err) => logger.error(`Failed to enqueue cert provisioning: ${err}`),
      );
    }

    await checkAndUpdateTenantStatus(tenant.id);

    if (walletId) {
      const wallet = await db
        .selectFrom("wallets")
        .select("wallet_config")
        .where("id", "=", walletId)
        .executeTakeFirst();

      if (wallet?.wallet_config) {
        const config = wallet.wallet_config as WalletConfig;
        const accessToken = Math.random().toString(36).substring(2, 7);
        const addresses = {
          solana: config.solana?.["mainnet-beta"]?.address,
          base: config.evm?.base?.address,
          polygon: config.evm?.polygon?.address,
          monad: config.evm?.monad?.address,
        };

        setupAccountWithAddresses(tenant.name, accessToken, addresses).catch(
          (err) =>
            logger.error(
              `Failed to setup corbits dash account for ${tenant.name}: ${err}`,
            ),
        );
      }
    }

    return c.json({ ...tenant, organization_slug: orgSlug }, 201);
  },
);

adminRoutes.put(
  "/tenants/:id",
  arktypeValidator("json", AdminUpdateTenantSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = c.req.valid("json");

    const tenant = await db
      .selectFrom("tenants")
      .select(["id", "name", "status", "org_slug"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (!tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    // If organization_id is changing and org_slug not provided, derive org_slug from new org
    let derivedOrgSlug: string | null | undefined;
    if (body.organization_id !== undefined && body.org_slug === undefined) {
      if (body.organization_id === null) {
        derivedOrgSlug = null;
      } else {
        const org = await db
          .selectFrom("organizations")
          .select(["id", "slug"])
          .where("id", "=", body.organization_id)
          .executeTakeFirst();
        if (!org) {
          return c.json({ error: "Organization not found" }, 404);
        }
        derivedOrgSlug = org.slug;
      }
    }

    if (
      body.name !== undefined ||
      body.org_slug !== undefined ||
      derivedOrgSlug !== undefined
    ) {
      let targetName = tenant.name;

      if (body.name !== undefined) {
        const nameValidation = validateProxyName(body.name);
        if (!nameValidation.valid) {
          return c.json({ error: nameValidation.error }, 400);
        }
        targetName = nameValidation.sanitized;
      }

      const targetOrgSlug =
        body.org_slug !== undefined
          ? body.org_slug || null
          : derivedOrgSlug !== undefined
            ? derivedOrgSlug
            : tenant.org_slug;

      const isNameChanging = targetName !== tenant.name;
      const isOrgSlugChanging = targetOrgSlug !== tenant.org_slug;

      if (isNameChanging || isOrgSlugChanging) {
        if (tenant.status !== "active") {
          return c.json(
            {
              error:
                "Cannot rename tenant while another operation is in progress",
            },
            400,
          );
        }

        const tenantNodes = await db
          .selectFrom("tenant_nodes")
          .select(["cert_status"])
          .where("tenant_id", "=", id)
          .execute();

        const hasCertInFlight = tenantNodes.some(
          (n) => n.cert_status === "pending" || n.cert_status === "deleting",
        );

        if (hasCertInFlight) {
          return c.json(
            {
              error:
                "Cannot rename tenant while certificate operations are in progress",
            },
            400,
          );
        }

        let existing: { id: number } | undefined;
        if (targetOrgSlug) {
          existing = await db
            .selectFrom("tenants")
            .select(["id"])
            .where("name", "=", targetName)
            .where("org_slug", "=", targetOrgSlug)
            .where("id", "!=", id)
            .executeTakeFirst();
        } else {
          existing = await db
            .selectFrom("tenants")
            .select("id")
            .where("name", "=", targetName)
            .where("org_slug", "is", null)
            .where("id", "!=", id)
            .executeTakeFirst();
        }

        if (existing) {
          return c.json({ error: "Name already taken" }, 400);
        }

        const updateFields: {
          status: string;
          org_slug?: string | null;
          organization_id?: number | null;
        } = {
          status: "pending",
        };
        if (isOrgSlugChanging) {
          updateFields.org_slug = targetOrgSlug;
        }
        if (body.organization_id !== undefined) {
          updateFields.organization_id = body.organization_id;
        }

        await db
          .updateTable("tenants")
          .set(updateFields)
          .where("id", "=", id)
          .execute();

        await enqueueTenantRename(
          id,
          tenant.name,
          targetName,
          tenant.org_slug ?? null,
          targetOrgSlug ?? null,
        );

        return c.json({
          id: tenant.id,
          name: targetName,
          status: "pending",
        });
      }
    }

    if (tenant.status !== "active" && tenant.status !== "pending") {
      return c.json(
        {
          error: "Cannot modify tenant while another operation is in progress",
        },
        400,
      );
    }

    if (tenant.status === "pending") {
      const allowedPendingFields = ["wallet_id"];
      const requestedFields = Object.keys(body).filter(
        (k) => body[k as keyof typeof body] !== undefined,
      );
      const hasDisallowedFields = requestedFields.some(
        (f) => !allowedPendingFields.includes(f),
      );
      if (hasDisallowedFields) {
        return c.json(
          {
            error:
              "Cannot modify tenant while initializing. Only wallet assignment is allowed.",
          },
          400,
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.backend_url !== undefined)
      updateData.backend_url = body.backend_url;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.upstream_auth_header !== undefined)
      updateData.upstream_auth_header = body.upstream_auth_header;
    if (body.upstream_auth_value !== undefined)
      updateData.upstream_auth_value = body.upstream_auth_value;

    let newWalletConfig: WalletConfig | null = null;
    if (body.wallet_id !== undefined) {
      updateData.wallet_id = body.wallet_id;
      if (body.wallet_id !== null) {
        const wallet = await db
          .selectFrom("wallets")
          .select("wallet_config")
          .where("id", "=", body.wallet_id)
          .executeTakeFirst();
        newWalletConfig = wallet?.wallet_config as WalletConfig | null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      const current = await db
        .selectFrom("tenants")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return c.json(current);
    }

    const result = await db
      .updateTable("tenants")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    const tenantNodes = await db
      .selectFrom("tenant_nodes")
      .select("node_id")
      .where("tenant_id", "=", id)
      .execute();

    for (const tn of tenantNodes) {
      syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
    }

    if (newWalletConfig) {
      const addresses = {
        solana: newWalletConfig.solana?.["mainnet-beta"]?.address,
        base: newWalletConfig.evm?.base?.address,
        polygon: newWalletConfig.evm?.polygon?.address,
        monad: newWalletConfig.evm?.monad?.address,
      };

      updateAccountAddresses(tenant.name, addresses).catch((err) =>
        logger.error(
          `Failed to update corbits dash addresses for ${tenant.name}: ${err}`,
        ),
      );
    }

    if (body.wallet_id !== undefined && body.wallet_id !== null) {
      await checkAndUpdateTenantStatus(id);
    }

    return c.json(result);
  },
);

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
      "tenants.org_slug",
      "wallets.wallet_config",
    ])
    .where("tenants.id", "=", id)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  if (tenant.status === "deleting") {
    return c.json({ error: "Tenant is already being deleted" }, 400);
  }

  const tenantNodes = await db
    .selectFrom("tenant_nodes")
    .select(["cert_status"])
    .where("tenant_id", "=", id)
    .execute();

  const hasCertInFlight = tenantNodes.some(
    (n) => n.cert_status === "pending" || n.cert_status === "deleting",
  );

  if (hasCertInFlight) {
    return c.json(
      { error: "Cannot delete while certificate operations are in progress" },
      400,
    );
  }

  await db
    .updateTable("tenants")
    .set({ status: "deleting" })
    .where("id", "=", id)
    .execute();

  await enqueueTenantDeletion(tenant.id, tenant.name, tenant.org_slug ?? null);

  return c.json({ success: true });
});

adminRoutes.post(
  "/tenants/:id/nodes",
  arktypeValidator("json", AdminAssignNodeSchema),
  async (c) => {
    const tenantId = parseInt(c.req.param("id"));
    const body = c.req.valid("json");
    const nodeId = body.node_id;

    const tenant = await db
      .selectFrom("tenants")
      .select(["id", "name", "org_slug"])
      .where("id", "=", tenantId)
      .executeTakeFirst();

    if (!tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    const domainInfo = toDomainInfo(tenant);

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
      const healthCheckId = await createHealthCheck(domainInfo, node.public_ip);
      if (healthCheckId) {
        await db
          .updateTable("tenant_nodes")
          .set({ health_check_id: healthCheckId })
          .where("id", "=", result.id)
          .execute();
      }

      upsertNodeDnsRecord(
        domainInfo,
        nodeId,
        node.public_ip,
        healthCheckId,
      ).catch((err) => logger.error(`Failed to create DNS record: ${err}`));
    }

    if (node.status === "active") {
      enqueueCertProvisioning([nodeId], tenant.name, domainInfo.orgSlug).catch(
        (err) => logger.error(`Failed to enqueue cert provisioning: ${err}`),
      );
    }

    syncToNode(nodeId).catch((err) => logger.error(String(err)));

    return c.json({ success: true, is_primary: isPrimary }, 201);
  },
);

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
    .select(["name", "org_slug"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const domainInfo = toDomainInfo(tenant);

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
      await deleteNodeDnsRecord(domainInfo, nodeId);

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

          syncToNode(nextNode.node_id).catch((err) =>
            logger.error(String(err)),
          );
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

adminRoutes.put(
  "/tenants/:tenantId/endpoints/:endpointId",
  arktypeValidator("json", AdminUpdateEndpointSchema),
  async (c) => {
    const tenantId = parseInt(c.req.param("tenantId"));
    const endpointId = parseInt(c.req.param("endpointId"));
    const body = c.req.valid("json");

    const updateData: Record<string, unknown> = {};
    if (body.path !== undefined) {
      const inputPath = body.path;
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
    if (body.description !== undefined)
      updateData.description = body.description;
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

    const tenantNodes = await db
      .selectFrom("tenant_nodes")
      .select("node_id")
      .where("tenant_id", "=", tenantId)
      .execute();

    for (const tn of tenantNodes) {
      syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
    }

    return c.json(result);
  },
);

adminRoutes.get("/transactions", async (c) => {
  const { limit, offset } = parsePagination(
    c.req.query("limit"),
    c.req.query("offset"),
    100,
  );

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

adminRoutes.get("/tenants/:id/transactions", async (c) => {
  const tenantId = parseInt(c.req.param("id"));
  const { limit, offset } = parsePagination(
    c.req.query("limit"),
    c.req.query("offset"),
    10,
  );

  const transactions = await db
    .selectFrom("transactions")
    .select([
      "id",
      "endpoint_id",
      "tenant_id",
      "organization_id",
      "amount_usdc",
      "tx_hash",
      "network",
      "request_path",
      "client_ip",
      "request_method",
      "metadata",
      "ngx_request_id",
      "created_at",
    ])
    .where("tenant_id", "=", tenantId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset)
    .execute();

  const countResult = await db
    .selectFrom("transactions")
    .select(db.fn.count<number>("id").as("count"))
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  return c.json({
    transactions,
    total: countResult?.count || 0,
    limit,
    offset,
  });
});

adminRoutes.get("/tenants/:id/corbits-transactions", async (c) => {
  const tenantId = parseInt(c.req.param("id"));
  const { limit, offset } = parsePagination(
    c.req.query("limit"),
    c.req.query("offset"),
    10,
  );
  const forceRefresh = c.req.query("refresh") === "true";

  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "name"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const cached = transactionCache.get(tenantId);
  const isCacheFresh =
    cached &&
    !forceRefresh &&
    Date.now() - cached.cachedAt < TRANSACTIONS_CACHE_TTL_MS;

  if (isCacheFresh) {
    const paginatedTransactions = cached.transactions.slice(
      offset,
      offset + limit,
    );
    return c.json({
      transactions: paginatedTransactions,
      total: cached.transactions.length,
      limit,
      offset,
      cached: true,
      cached_at: new Date(cached.cachedAt).toISOString(),
    });
  }

  try {
    const account = await findAccountByName(tenant.name);
    if (!account) {
      return c.json({
        transactions: [],
        total: 0,
        limit,
        offset,
        error: "No Corbits account",
      });
    }

    const response = await getTransactionsForAccount(account.id, {
      limit: 100,
    });

    transactionCache.set(tenantId, {
      transactions: response.data,
      cachedAt: Date.now(),
    });

    const paginatedTransactions = response.data.slice(offset, offset + limit);
    return c.json({
      transactions: paginatedTransactions,
      total: response.data.length,
      limit,
      offset,
      cached: false,
    });
  } catch (err) {
    logger.error(
      `Failed to fetch Corbits transactions for ${tenant.name}: ${err}`,
    );
    // Return cached data if available, even if stale
    if (cached) {
      const paginatedTransactions = cached.transactions.slice(
        offset,
        offset + limit,
      );
      return c.json({
        transactions: paginatedTransactions,
        total: cached.transactions.length,
        limit,
        offset,
        cached: true,
        stale: true,
        cached_at: new Date(cached.cachedAt).toISOString(),
      });
    }
    return c.json({ error: "Failed to fetch transactions" }, 500);
  }
});

adminRoutes.get("/tenants-with-wallets", async (c) => {
  const tenants = await db
    .selectFrom("tenants")
    .leftJoin("organizations", "organizations.id", "tenants.organization_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.organization_id",
      "tenants.org_slug",
      "organizations.name as organization_name",
    ])
    .where("tenants.wallet_id", "is not", null)
    .where("tenants.is_active", "=", true)
    .orderBy("organizations.name", "asc")
    .orderBy("tenants.name", "asc")
    .execute();

  return c.json(tenants);
});

adminRoutes.get("/nodes", async (c) => {
  const nodes = await db
    .selectFrom("nodes")
    .leftJoin("tenant_nodes", "tenant_nodes.node_id", "nodes.id")
    .select([
      "nodes.id",
      "nodes.name",
      "nodes.internal_ip",
      "nodes.status",
      "nodes.wireguard_public_key",
      "nodes.wireguard_address",
      "nodes.created_at",
      db.fn.count<number>("tenant_nodes.tenant_id").as("tenant_count"),
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

  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
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

adminRoutes.put(
  "/settings",
  arktypeValidator("json", AdminUpdateSettingsSchema),
  async (c) => {
    const body = c.req.valid("json");

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (body.wallet_config !== undefined) {
      updateData.wallet_config = body.wallet_config
        ? JSON.stringify(
            encryptWalletKeys(body.wallet_config as CryptoWalletConfig),
          )
        : null;
    }

    if (body.minimum_balance_sol !== undefined) {
      updateData.minimum_balance_sol = body.minimum_balance_sol;
    }

    if (body.minimum_balance_usdc !== undefined) {
      updateData.minimum_balance_usdc = body.minimum_balance_usdc;
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
  },
);

adminRoutes.get("/waitlist", async (c) => {
  const waitlist = await db
    .selectFrom("waitlist")
    .select(["id", "email", "whitelisted", "signed_up", "created_at"])
    .orderBy("created_at", "desc")
    .execute();

  return c.json(waitlist);
});

adminRoutes.patch("/waitlist/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{ whitelisted: boolean }>();

  const entry = await db
    .selectFrom("waitlist")
    .select(["id", "signed_up"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  if (entry.signed_up && !body.whitelisted) {
    return c.json(
      { error: "Cannot un-whitelist a user who has signed up" },
      400,
    );
  }

  const result = await db
    .updateTable("waitlist")
    .set({ whitelisted: body.whitelisted })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  return c.json(result);
});

adminRoutes.delete("/waitlist/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  const result = await db
    .deleteFrom("waitlist")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Entry not found" }, 404);
  }

  return c.json({ deleted: true });
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

adminRoutes.get("/organizations/:id/analytics", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) {
    return c.json({ error: "Invalid organization ID" }, 400);
  }

  try {
    const earnings = await getOrganizationEarnings(id);
    return c.json(earnings);
  } catch (error) {
    logger.error(`Failed to get organization analytics: ${error}`);
    return c.json({ error: "Failed to get analytics" }, 500);
  }
});

adminRoutes.get("/tenants/:id/analytics", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) {
    return c.json({ error: "Invalid tenant ID" }, 400);
  }

  try {
    const earnings = await getTenantEarnings(id);
    return c.json(earnings);
  } catch (error) {
    logger.error(`Failed to get tenant analytics: ${error}`);
    return c.json({ error: "Failed to get analytics" }, 500);
  }
});

adminRoutes.get(
  "/tenants/:tenantId/endpoints/:endpointId/analytics",
  async (c) => {
    const endpointId = parseInt(c.req.param("endpointId"));
    if (isNaN(endpointId)) {
      return c.json({ error: "Invalid endpoint ID" }, 400);
    }

    try {
      const earnings = await getEndpointEarnings(endpointId);
      return c.json(earnings);
    } catch (error) {
      logger.error(`Failed to get endpoint analytics: ${error}`);
      return c.json({ error: "Failed to get analytics" }, 500);
    }
  },
);

adminRoutes.get("/tenants/:tenantId/catch-all/analytics", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId"));
  if (isNaN(tenantId)) {
    return c.json({ error: "Invalid tenant ID" }, 400);
  }

  try {
    const earnings = await getCatchAllEarnings(tenantId);
    return c.json(earnings);
  } catch (error) {
    logger.error(`Failed to get catch-all analytics: ${error}`);
    return c.json({ error: "Failed to get analytics" }, 500);
  }
});

adminRoutes.get("/analytics/earnings", async (c) => {
  const level = c.req.query("level") as "organization" | "tenant" | "endpoint";
  const idStr = c.req.query("id");
  const granularityParam = c.req.query("granularity") || "month";
  const periodsStr = c.req.query("periods");

  if (!level || !["organization", "tenant", "endpoint"].includes(level)) {
    return c.json(
      { error: "Invalid level. Must be organization, tenant, or endpoint" },
      400,
    );
  }

  if (!idStr) {
    return c.json({ error: "ID is required" }, 400);
  }

  const id = parseInt(idStr);
  if (isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  if (!["day", "week", "month"].includes(granularityParam)) {
    return c.json(
      { error: "Invalid granularity. Must be day, week, or month" },
      400,
    );
  }
  const granularity = granularityParam as Granularity;

  const periods = periodsStr ? parseInt(periodsStr) : 12;
  if (isNaN(periods) || periods < 1 || periods > 365) {
    return c.json({ error: "Invalid periods. Must be between 1 and 365" }, 400);
  }

  try {
    const data = await getEarningsByPeriod(level, id, granularity, periods);
    return c.json(data);
  } catch (error) {
    logger.error(`Failed to get earnings analytics: ${error}`);
    return c.json({ error: "Failed to get analytics" }, 500);
  }
});
