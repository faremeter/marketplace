import { Hono } from "hono";
import { db } from "../db/instance.js";
import { logger } from "../logger.js";
import {
  parseCursorPagination,
  buildCursorResponse,
} from "../lib/pagination.js";

export const proxiesRoutes = new Hono();

interface ProxyListItem {
  id: number;
  name: string;
  org_slug: string | null;
  backend_url: string;
  default_price_usdc: number;
  default_scheme: string;
  tags: string[];
}

interface ProxyDetail extends ProxyListItem {
  endpoint_count: number;
}

proxiesRoutes.get("/", async (c) => {
  const { cursor, limit } = parseCursorPagination(
    c.req.query("cursor"),
    c.req.query("limit"),
  );

  try {
    let query = db
      .selectFrom("tenants")
      .select([
        "id",
        "name",
        "org_slug",
        "backend_url",
        "default_price_usdc",
        "default_scheme",
        "tags",
      ])
      .where("is_active", "=", true)
      .where("status", "=", "active")
      .orderBy("id", "asc")
      .limit(limit + 1);

    if (cursor !== null) {
      query = query.where("id", ">", cursor);
    }

    const results = (await query.execute()) as ProxyListItem[];

    return c.json(buildCursorResponse(results, limit));
  } catch (error) {
    logger.error("Proxies list error", { error });
    return c.json({ error: "Failed to list proxies" }, 500);
  }
});

proxiesRoutes.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Invalid proxy ID" }, 400);
  }

  try {
    const proxy = await db
      .selectFrom("tenants")
      .select([
        "id",
        "name",
        "org_slug",
        "backend_url",
        "default_price_usdc",
        "default_scheme",
        "tags",
      ])
      .where("id", "=", id)
      .where("is_active", "=", true)
      .where("status", "=", "active")
      .executeTakeFirst();

    if (!proxy) {
      return c.json({ error: "Proxy not found" }, 404);
    }

    const endpointCount = await db
      .selectFrom("endpoints")
      .select(db.fn.count("id").as("count"))
      .where("tenant_id", "=", id)
      .where("is_active", "=", true)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    const result: ProxyDetail = {
      ...(proxy as ProxyListItem),
      endpoint_count: Number(endpointCount?.count ?? 0),
    };

    return c.json({ data: result });
  } catch (error) {
    logger.error("Proxy detail error", { error });
    return c.json({ error: "Failed to get proxy" }, 500);
  }
});

proxiesRoutes.get("/:id/openapi", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Invalid proxy ID" }, 400);
  }

  try {
    const proxy = await db
      .selectFrom("tenants")
      .select(["id", "name", "openapi_spec"])
      .where("id", "=", id)
      .where("is_active", "=", true)
      .where("status", "=", "active")
      .executeTakeFirst();

    if (!proxy) {
      return c.json({ error: "Proxy not found" }, 404);
    }

    if (!proxy.openapi_spec) {
      return c.json({ error: "No OpenAPI spec available" }, 404);
    }

    return c.json({
      data: {
        id: proxy.id,
        name: proxy.name,
        spec: proxy.openapi_spec,
      },
    });
  } catch (error) {
    logger.error("Proxy OpenAPI error", { error });
    return c.json({ error: "Failed to get OpenAPI spec" }, 500);
  }
});
