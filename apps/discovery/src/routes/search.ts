import { Hono } from "hono";
import { sql } from "kysely";
import { db } from "../db/instance.js";
import { logger } from "../logger.js";

export const searchRoutes = new Hono();

interface TenantResult {
  id: number;
  name: string;
  org_slug: string | null;
  backend_url: string;
  default_price_usdc: number;
  default_scheme: string;
}

interface EndpointResult {
  id: number;
  tenant_id: number;
  tenant_name: string;
  org_slug: string | null;
  path_pattern: string;
  description: string | null;
  price_usdc: number | null;
  scheme: string | null;
}

searchRoutes.get("/", async (c) => {
  const query = c.req.query("q");

  if (!query || query.trim().length === 0) {
    return c.json({ tenants: [], endpoints: [] });
  }

  const searchTerm = query
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  const likePattern = `%${searchTerm}%`;

  try {
    const [tenants, endpoints] = await Promise.all([
      db
        .selectFrom("tenants")
        .select([
          "id",
          "name",
          "org_slug",
          "backend_url",
          "default_price_usdc",
          "default_scheme",
        ])
        .where("is_active", "=", true)
        .where("status", "=", "active")
        .where((eb) =>
          eb.or([
            eb("name", "ilike", likePattern),
            eb("org_slug", "ilike", likePattern),
            eb(sql`openapi_spec::text`, "ilike", likePattern),
          ]),
        )
        .orderBy("name")
        .limit(20)
        .execute() as Promise<TenantResult[]>,

      db
        .selectFrom("endpoints as e")
        .innerJoin("tenants as t", "t.id", "e.tenant_id")
        .select([
          "e.id",
          "e.tenant_id",
          "t.name as tenant_name",
          "t.org_slug",
          "e.path_pattern",
          "e.description",
          "e.price_usdc",
          "e.scheme",
        ])
        .where("e.is_active", "=", true)
        .where("e.deleted_at", "is", null)
        .where("t.is_active", "=", true)
        .where("t.status", "=", "active")
        .where((eb) =>
          eb.or([
            eb("e.path_pattern", "ilike", likePattern),
            eb("e.description", "ilike", likePattern),
          ]),
        )
        .orderBy("t.name")
        .orderBy("e.path_pattern")
        .limit(50)
        .execute() as Promise<EndpointResult[]>,
    ]);

    return c.json({ tenants, endpoints });
  } catch (error) {
    logger.error("Search error", { error });
    return c.json({ error: "Search failed" }, 500);
  }
});
