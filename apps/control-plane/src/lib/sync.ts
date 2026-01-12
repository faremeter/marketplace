import { db } from "../db/instance.js";
import { logger } from "../logger.js";
import { buildTenantDomain, toDomainInfo } from "./domain.js";

export async function buildNodeConfig(nodeId: number) {
  const node = await db
    .selectFrom("nodes")
    .selectAll()
    .where("id", "=", nodeId)
    .executeTakeFirst();

  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  const tenants = await db
    .selectFrom("tenants")
    .innerJoin("tenant_nodes", "tenant_nodes.tenant_id", "tenants.id")
    .innerJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.backend_url",
      "tenants.wallet_id",
      "tenants.default_price_usdc",
      "tenants.default_scheme",
      "tenants.upstream_auth_header",
      "tenants.upstream_auth_value",
      "tenants.org_slug",
      "wallets.wallet_config",
      "wallets.funding_status",
    ])
    .where("tenant_nodes.node_id", "=", nodeId)
    .where("tenants.is_active", "=", true)
    .where("tenants.status", "=", "active")
    .where("wallets.funding_status", "=", "funded")
    .execute();

  const config: Record<string, unknown> = {};
  let skippedCount = 0;

  for (const tenant of tenants) {
    const walletConfig = tenant.wallet_config;
    const fundingStatus = tenant.funding_status;

    if (!walletConfig) {
      logger.warn(
        `buildNodeConfig: Skipping tenant ${tenant.name} (id=${tenant.id}) - no wallet assigned`,
      );
      skippedCount++;
      continue;
    }

    if (fundingStatus !== "funded") {
      logger.warn(
        `buildNodeConfig: Skipping tenant ${tenant.name} (id=${tenant.id}) - wallet not funded (status: ${fundingStatus})`,
      );
      skippedCount++;
      continue;
    }

    const endpoints = await db
      .selectFrom("endpoints")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute();

    const domainInfo = toDomainInfo(tenant);
    const domain = buildTenantDomain(domainInfo);

    config[domain] = {
      name: tenant.name,
      proxy_name: tenant.name,
      domain,
      org_slug: tenant.org_slug ?? null,
      backend_url: tenant.backend_url,
      wallet_config: walletConfig,
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

  if (skippedCount > 0) {
    logger.info(
      `buildNodeConfig: Skipped ${skippedCount} tenant(s) without funded wallets on node ${nodeId}`,
    );
  }

  return {
    node_id: node.id,
    node_name: node.name,
    tenant_count: tenants.length,
    config,
  };
}

const skipSync =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export async function syncToNode(nodeId: number) {
  if (skipSync) {
    logger.info(`[DEV] syncToNode: Would sync to node ${nodeId} (skipped)`);
    return;
  }

  const node = await db
    .selectFrom("nodes")
    .select(["internal_ip", "status"])
    .where("id", "=", nodeId)
    .executeTakeFirst();

  if (!node) {
    logger.error(`syncToNode: Node ${nodeId} not found`);
    return;
  }

  if (node.status !== "active") {
    logger.info(`syncToNode: Node ${nodeId} is not active, skipping`);
    return;
  }

  const config = await buildNodeConfig(nodeId);

  try {
    const response = await fetch(
      `http://${node.internal_ip}:80/internal/config`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      },
    );

    if (!response.ok) {
      logger.error(
        `syncToNode: Failed to push to node ${nodeId}: ${response.status}`,
      );
    } else {
      logger.info(`syncToNode: Pushed config to node ${nodeId}`);
    }
  } catch (err) {
    logger.error(`syncToNode: Error pushing to node ${nodeId}: ${err}`);
  }
}
