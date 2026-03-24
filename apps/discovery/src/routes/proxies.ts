import { Hono } from "hono";
import { db } from "../db/instance.js";
import { logger } from "../logger.js";
import { buildProxyUrl } from "../lib/proxy-url.js";
import {
  parseCursorPagination,
  buildCursorResponse,
} from "../lib/pagination.js";

export const proxiesRoutes = new Hono();

interface ProxyListItem {
  id: number;
  name: string;
  org_slug: string | null;
  default_price: number;
  default_scheme: string;
  tags: string[];
}

interface EndpointListItem {
  id: number;
  path_pattern: string;
  description: string | null;
  price: number | null;
  scheme: string | null;
  tags: string[];
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
        "default_price",
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
    const withUrls = results.map((r) => ({
      ...r,
      url: buildProxyUrl(r.name, r.org_slug),
    }));

    return c.json(buildCursorResponse(withUrls, limit));
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
        "default_price",
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

    const tokenPrices = await db
      .selectFrom("token_prices")
      .select(["token_symbol", "mint_address", "network", "amount", "decimals"])
      .where("tenant_id", "=", id)
      .where("endpoint_id", "is", null)
      .orderBy("token_symbol", "asc")
      .execute();

    const result = {
      ...(proxy as ProxyListItem),
      url: buildProxyUrl(proxy.name, proxy.org_slug),
      endpoint_count: Number(endpointCount?.count ?? 0),
      token_prices: tokenPrices,
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

proxiesRoutes.get("/:id/endpoints/:endpointId", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const endpointId = parseInt(c.req.param("endpointId"), 10);

  if (isNaN(id) || isNaN(endpointId)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  try {
    const proxy = await db
      .selectFrom("tenants")
      .select(["id"])
      .where("id", "=", id)
      .where("is_active", "=", true)
      .where("status", "=", "active")
      .executeTakeFirst();

    if (!proxy) {
      return c.json({ error: "Proxy not found" }, 404);
    }

    const endpoint = await db
      .selectFrom("endpoints")
      .select([
        "id",
        "path_pattern",
        "description",
        "price",
        "scheme",
        "priority",
        "tags",
        "created_at",
      ])
      .where("id", "=", endpointId)
      .where("tenant_id", "=", id)
      .where("is_active", "=", true)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (!endpoint) {
      return c.json({ error: "Endpoint not found" }, 404);
    }

    const tokenPrices = await db
      .selectFrom("token_prices")
      .select(["token_symbol", "mint_address", "network", "amount", "decimals"])
      .where("tenant_id", "=", id)
      .where("endpoint_id", "=", endpointId)
      .orderBy("token_symbol", "asc")
      .execute();

    return c.json({ data: { ...endpoint, token_prices: tokenPrices } });
  } catch (error) {
    logger.error("Endpoint detail error", { error });
    return c.json({ error: "Failed to get endpoint" }, 500);
  }
});

proxiesRoutes.get("/:id/endpoints", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Invalid proxy ID" }, 400);
  }

  try {
    const proxy = await db
      .selectFrom("tenants")
      .select(["id"])
      .where("id", "=", id)
      .where("is_active", "=", true)
      .where("status", "=", "active")
      .executeTakeFirst();

    if (!proxy) {
      return c.json({ error: "Proxy not found" }, 404);
    }

    const { cursor, limit } = parseCursorPagination(
      c.req.query("cursor"),
      c.req.query("limit"),
    );

    let query = db
      .selectFrom("endpoints")
      .select(["id", "path_pattern", "description", "price", "scheme", "tags"])
      .where("tenant_id", "=", id)
      .where("is_active", "=", true)
      .where("deleted_at", "is", null)
      .orderBy("id", "asc")
      .limit(limit + 1);

    if (cursor !== null) {
      query = query.where("id", ">", cursor);
    }

    const results = (await query.execute()) as EndpointListItem[];
    return c.json(buildCursorResponse(results, limit));
  } catch (error) {
    logger.error("Proxy endpoints error", { error });
    return c.json({ error: "Failed to list endpoints" }, 500);
  }
});
