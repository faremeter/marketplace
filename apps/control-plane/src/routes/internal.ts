import { Hono } from "hono";
import { db } from "../db/instance.js";
import { enqueueTransactionRecording } from "../lib/queue.js";
import { logger } from "../logger.js";
import { arktypeValidator } from "@hono/arktype-validator";
import { InternalTransactionSchema } from "../lib/schemas.js";
import { toDomainInfo, buildTenantDomain } from "../lib/domain.js";

export const internalRoutes = new Hono();

internalRoutes.get("/nodes/:id/sync", async (c) => {
  const id = parseInt(c.req.param("id"));

  const node = await db
    .selectFrom("nodes")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  const tenants = await db
    .selectFrom("tenants")
    .innerJoin("tenant_nodes", "tenant_nodes.tenant_id", "tenants.id")
    .innerJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.backend_url",
      "tenants.default_price_usdc",
      "tenants.default_scheme",
      "tenants.upstream_auth_header",
      "tenants.upstream_auth_value",
      "tenants.org_slug",
      "wallets.wallet_config",
    ])
    .where("tenant_nodes.node_id", "=", id)
    .where("tenants.is_active", "=", true)
    .where("tenants.status", "=", "active")
    .where("wallets.funding_status", "=", "funded")
    .execute();

  const config: Record<string, unknown> = {};
  for (const tenant of tenants) {
    const endpoints = await db
      .selectFrom("endpoints")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    const domain = buildTenantDomain(toDomainInfo(tenant));
    config[domain] = {
      name: tenant.name,
      proxy_name: tenant.name,
      domain,
      org_slug: tenant.org_slug ?? null,
      backend_url: tenant.backend_url,
      wallet_config: tenant.wallet_config,
      default_price_usdc: tenant.default_price_usdc,
      default_scheme: tenant.default_scheme,
      upstream_auth_header: tenant.upstream_auth_header,
      upstream_auth_value: tenant.upstream_auth_value,
      endpoints: endpoints.map((e) => ({
        id: e.id,
        path_pattern: e.path_pattern,
        price_usdc: e.price_usdc,
        scheme: e.scheme,
        priority: e.priority,
      })),
    };
  }

  return c.json({
    node_id: node.id,
    node_name: node.name,
    tenant_count: tenants.length,
    config,
  });
});

internalRoutes.post(
  "/transactions",
  arktypeValidator("json", InternalTransactionSchema),
  async (c) => {
    const body = c.req.valid("json");

    // Business logic: paid transactions require tx_hash and network
    if (body.amount_usdc > 0 && (!body.tx_hash || !body.network)) {
      return c.json(
        { error: "Paid transactions require tx_hash and network" },
        400,
      );
    }

    // Lookup tenant by name + org_slug (for org_slug format) or name + legacy format
    let tenant: { id: number; organization_id: number | null } | undefined;

    if (body.org_slug) {
      // org_slug format: lookup by name AND org_slug
      tenant = await db
        .selectFrom("tenants")
        .select(["id", "organization_id"])
        .where("name", "=", body.tenant_name)
        .where("org_slug", "=", body.org_slug)
        .executeTakeFirst();
    } else {
      // Legacy format: lookup by name only (org_slug is null)
      tenant = await db
        .selectFrom("tenants")
        .select(["id", "organization_id"])
        .where("name", "=", body.tenant_name)
        .where("org_slug", "is", null)
        .executeTakeFirst();
    }

    if (!tenant) {
      logger.warn(
        `Transaction received for unknown tenant: ${body.tenant_name}${body.org_slug ? ` (org: ${body.org_slug})` : ""}`,
      );
      return c.json({ error: "Tenant not found" }, 404);
    }

    // Validate endpoint belongs to tenant if provided
    if (body.endpoint_id) {
      const endpoint = await db
        .selectFrom("endpoints")
        .select("id")
        .where("id", "=", body.endpoint_id)
        .where("tenant_id", "=", tenant.id)
        .executeTakeFirst();

      if (!endpoint) {
        return c.json({ error: "Endpoint does not belong to tenant" }, 400);
      }
    }

    try {
      await enqueueTransactionRecording({
        ngx_request_id: body.ngx_request_id,
        tx_hash: body.tx_hash ?? null,
        tenant_id: tenant.id,
        organization_id: tenant.organization_id,
        endpoint_id: body.endpoint_id ?? null,
        amount_usdc: body.amount_usdc,
        network: body.network ?? null,
        request_path: body.request_path,
        client_ip: body.client_ip ?? null,
        request_method: body.request_method ?? null,
        metadata: (body.metadata as Record<string, unknown>) ?? null,
      });

      return c.json({ success: true });
    } catch (error) {
      logger.error(`Failed to enqueue transaction: ${error}`);
      return c.json({ error: "Failed to enqueue transaction" }, 500);
    }
  },
);
