import { Hono } from "hono";
import { db } from "../db/instance.js";
import { sql } from "kysely";
import safe from "safe-regex2";
import { arktypeValidator } from "@hono/arktype-validator";
import { parsePagination } from "../lib/validation.js";
import { CreateEndpointSchema, UpdateEndpointSchema } from "../lib/schemas.js";
import { syncToNode } from "../lib/sync.js";
import { syncOpenApiSpec } from "../lib/openapi-sync.js";
import { logger } from "../logger.js";
import { requireTenantAccess } from "../middleware/auth.js";
import {
  createResourceLimiter,
  modifyResourceLimiter,
} from "../middleware/rate-limit.js";

function processPathPattern(input: string): {
  path: string;
  path_pattern: string;
  error?: string;
} {
  // Already regex (starts with ^)
  if (input.startsWith("^")) {
    if (!safe(input)) {
      return {
        path: input,
        path_pattern: input,
        error: "Regex pattern may cause performance issues",
      };
    }
    return { path: input, path_pattern: input };
  }

  // OpenAPI-style with {param} - convert to regex
  if (input.includes("{")) {
    const regex = "^" + input.replace(/\{[^}]+\}/g, "[^/]+") + "$";
    return { path: input, path_pattern: regex };
  }

  // Literal path (for prefix matching in Lua)
  return { path: input, path_pattern: input };
}

async function syncTenantNodes(tenantId: number) {
  const tenant = await db
    .selectFrom("tenants")
    .select("status")
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant || tenant.status === "registered") {
    return;
  }

  const tenantNodes = await db
    .selectFrom("tenant_nodes")
    .select("node_id")
    .where("tenant_id", "=", tenantId)
    .execute();

  for (const tn of tenantNodes) {
    syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
  }
}

export const endpointsRoutes = new Hono();

endpointsRoutes.use("*", requireTenantAccess);

endpointsRoutes.get("/", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const includeDeleted = c.req.query("include_deleted") === "true";

  let query = db
    .selectFrom("endpoints")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .orderBy("priority", "asc")
    .orderBy("created_at", "desc");

  if (!includeDeleted) {
    query = query.where("is_active", "=", true);
  }

  const endpoints = await query.execute();
  return c.json(endpoints);
});

endpointsRoutes.get("/:id", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const id = parseInt(c.req.param("id"));

  const endpoint = await db
    .selectFrom("endpoints")
    .selectAll()
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!endpoint) {
    return c.json({ error: "Endpoint not found" }, 404);
  }
  return c.json(endpoint);
});

endpointsRoutes.post(
  "/",
  createResourceLimiter,
  arktypeValidator("json", CreateEndpointSchema),
  async (c) => {
    const tenantId = parseInt(c.req.param("tenantId") ?? "");
    const body = c.req.valid("json");

    const inputPath = body.path ?? body.path_pattern;

    const catchAllPatterns = ["/", "/*", "^/$", "^/.*$"];
    if (catchAllPatterns.includes(inputPath)) {
      return c.json(
        {
          error:
            "Cannot create catch-all endpoint. Use the default pricing instead.",
        },
        400,
      );
    }

    const processed = processPathPattern(inputPath);
    if (processed.error) {
      return c.json({ error: processed.error }, 400);
    }

    const result = await db
      .insertInto("endpoints")
      .values({
        tenant_id: tenantId,
        path: processed.path,
        path_pattern: processed.path_pattern,
        price: body.price ?? null,
        scheme: body.scheme ?? null,
        description: body.description ?? null,
        priority: body.priority ?? 100,
        is_active: true,
        openapi_source_paths: body.openapi_source_paths ?? undefined,
        tags: body.tags ?? [],
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    syncTenantNodes(tenantId);
    syncOpenApiSpec(tenantId).catch((err) =>
      logger.error(
        `Failed to sync OpenAPI spec for tenant ${tenantId}: ${err}`,
      ),
    );

    return c.json(result, 201);
  },
);

endpointsRoutes.put(
  "/:id",
  modifyResourceLimiter,
  arktypeValidator("json", UpdateEndpointSchema),
  async (c) => {
    const tenantId = parseInt(c.req.param("tenantId") ?? "");
    const id = parseInt(c.req.param("id"));
    const body = c.req.valid("json");

    const updateData: Record<string, unknown> = {};
    if (body.path !== undefined) {
      const processed = processPathPattern(body.path);
      if (processed.error) {
        return c.json({ error: processed.error }, 400);
      }
      updateData.path = processed.path;
      updateData.path_pattern = processed.path_pattern;
    }
    if (body.openapi_source_paths !== undefined)
      updateData.openapi_source_paths = body.openapi_source_paths;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.scheme !== undefined) updateData.scheme = body.scheme;
    if (body.description !== undefined)
      updateData.description = body.description;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const result = await db
      .updateTable("endpoints")
      .set(updateData)
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      return c.json({ error: "Endpoint not found" }, 404);
    }

    syncTenantNodes(tenantId);
    syncOpenApiSpec(tenantId).catch((err) =>
      logger.error(
        `Failed to sync OpenAPI spec for tenant ${tenantId}: ${err}`,
      ),
    );

    return c.json(result);
  },
);

endpointsRoutes.delete("/:id", modifyResourceLimiter, async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const id = parseInt(c.req.param("id"));

  const result = await db
    .updateTable("endpoints")
    .set({
      is_active: false,
      deleted_at: new Date(),
    })
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .where("is_active", "=", true)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Endpoint not found" }, 404);
  }

  syncTenantNodes(tenantId);
  syncOpenApiSpec(tenantId).catch((err) =>
    logger.error(`Failed to sync OpenAPI spec for tenant ${tenantId}: ${err}`),
  );

  return c.json({ deleted: true, endpoint: result });
});

endpointsRoutes.get("/:id/stats", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const id = parseInt(c.req.param("id"));
  const from = c.req.query("from");
  const to = c.req.query("to");

  const endpoint = await db
    .selectFrom("endpoints")
    .selectAll()
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!endpoint) {
    return c.json({ error: "Endpoint not found" }, 404);
  }

  let query = db
    .selectFrom("transactions")
    .select([
      sql<number>`count(*)`.as("total_transactions"),
      sql<number>`coalesce(sum(amount), 0)`.as("total_spent"),
    ])
    .where("endpoint_id", "=", id);

  if (from) {
    query = query.where("created_at", ">=", new Date(from));
  }
  if (to) {
    query = query.where("created_at", "<=", new Date(to));
  }

  const stats = await query.executeTakeFirst();

  return c.json({
    endpoint_id: id,
    path_pattern: endpoint.path_pattern,
    total_transactions: Number(stats?.total_transactions ?? 0),
    total_spent: Number(stats?.total_spent ?? 0),
    period: { from: from ?? null, to: to ?? null },
  });
});

endpointsRoutes.get("/:id/transactions", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const id = parseInt(c.req.param("id"));
  const { limit, offset } = parsePagination(
    c.req.query("limit"),
    c.req.query("offset"),
  );

  const endpoint = await db
    .selectFrom("endpoints")
    .select("id")
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!endpoint) {
    return c.json({ error: "Endpoint not found" }, 404);
  }

  const transactions = await db
    .selectFrom("transactions")
    .selectAll()
    .where("endpoint_id", "=", id)
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset)
    .execute();

  return c.json(transactions);
});
