import { Hono } from "hono";
import { db } from "../db/instance.js";
import { regenWireguardConfig } from "../lib/wireguard.js";
import { deleteNodeDnsRecord, deleteHealthCheck } from "../lib/dns.js";
import { toDomainInfo } from "../lib/domain.js";
import { logger } from "../logger.js";
import { enqueueCertProvisioning } from "../lib/queue.js";
import { requireAdmin } from "../middleware/auth.js";
import { arktypeValidator } from "@hono/arktype-validator";
import { CreateNodeSchema, UpdateNodeSchema } from "../lib/schemas.js";

export const nodesRoutes = new Hono();

nodesRoutes.use("*", requireAdmin);

nodesRoutes.get("/", async (c) => {
  const nodes = await db
    .selectFrom("nodes")
    .selectAll()
    .orderBy("created_at", "desc")
    .execute();
  return c.json(nodes);
});

nodesRoutes.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const node = await db
    .selectFrom("nodes")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }
  return c.json(node);
});

nodesRoutes.post("/", arktypeValidator("json", CreateNodeSchema), async (c) => {
  const body = c.req.valid("json");

  const result = await db
    .insertInto("nodes")
    .values({
      name: body.name,
      internal_ip: body.internal_ip,
      public_ip: body.public_ip ?? null,
      status: body.status ?? "active",
      wireguard_public_key: body.wireguard_public_key ?? null,
      wireguard_address: body.wireguard_address ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (body.wireguard_public_key && body.wireguard_address) {
    await regenWireguardConfig();
  }

  return c.json(result, 201);
});

nodesRoutes.get("/:id/tenants", async (c) => {
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
    .selectAll("tenants")
    .where("tenant_nodes.node_id", "=", id)
    .where("tenants.is_active", "=", true)
    .execute();

  return c.json(tenants);
});

nodesRoutes.put(
  "/:id",
  arktypeValidator("json", UpdateNodeSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = c.req.valid("json");

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.internal_ip !== undefined)
      updateData.internal_ip = body.internal_ip;
    if (body.public_ip !== undefined) updateData.public_ip = body.public_ip;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.wireguard_public_key !== undefined)
      updateData.wireguard_public_key = body.wireguard_public_key;
    if (body.wireguard_address !== undefined)
      updateData.wireguard_address = body.wireguard_address;

    const result = await db
      .updateTable("nodes")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      return c.json({ error: "Node not found" }, 404);
    }

    if (
      body.wireguard_public_key !== undefined ||
      body.wireguard_address !== undefined ||
      body.status !== undefined
    ) {
      await regenWireguardConfig();
    }

    if (body.status === "active") {
      const assignedTenants = await db
        .selectFrom("tenant_nodes")
        .innerJoin("tenants", "tenants.id", "tenant_nodes.tenant_id")
        .select(["tenants.name", "tenants.org_slug"])
        .where("tenant_nodes.node_id", "=", id)
        .execute();

      for (const tenant of assignedTenants) {
        enqueueCertProvisioning(
          [id],
          tenant.name,
          tenant.org_slug ?? null,
        ).catch((err) =>
          logger.error(`Failed to enqueue cert provisioning: ${err}`),
        );
      }
    }

    return c.json(result);
  },
);

nodesRoutes.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  const affectedTenants = await db
    .selectFrom("tenant_nodes")
    .innerJoin("tenants", "tenants.id", "tenant_nodes.tenant_id")
    .select([
      "tenants.name",
      "tenants.org_slug",
      "tenant_nodes.health_check_id",
    ])
    .where("tenant_nodes.node_id", "=", id)
    .execute();

  const result = await db
    .deleteFrom("nodes")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Node not found" }, 404);
  }

  if (result.wireguard_public_key) {
    await regenWireguardConfig();
  }

  for (const tenant of affectedTenants) {
    deleteNodeDnsRecord(toDomainInfo(tenant), id).catch((err) =>
      logger.error(`Failed to delete DNS record: ${err}`),
    );

    if (tenant.health_check_id) {
      deleteHealthCheck(tenant.health_check_id).catch((err) =>
        logger.error(`Failed to delete health check: ${err}`),
      );
    }
  }

  return c.json({ deleted: true, node: result });
});
