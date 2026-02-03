import { Hono } from "hono";
import { sql, type SqlBool } from "kysely";
import { db, isTest } from "../db/instance.js";
import { logger } from "../logger.js";
import { buildProxyUrl } from "../lib/proxy-url.js";

export const searchRoutes = new Hono();

interface TenantResult {
  id: number;
  name: string;
  org_slug: string | null;
  default_price_usdc: number;
  default_scheme: string;
  tags: string[];
}

interface EndpointResult {
  id: number;
  proxy_id: number;
  proxy_name: string;
  org_slug: string | null;
  path_pattern: string;
  description: string | null;
  price_usdc: number | null;
  scheme: string | null;
  tags: string[];
}

export function buildTsquery(query: string): string {
  return query
    .trim()
    .replace(/[^\p{L}\p{N}_]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word}:*`)
    .join(" & ");
}

searchRoutes.get("/", async (c) => {
  const query = c.req.query("q");

  if (!query || query.trim().length === 0) {
    return c.json({ proxies: [], endpoints: [] });
  }

  try {
    let tenants: TenantResult[];
    let endpoints: EndpointResult[];

    if (isTest) {
      const searchTerm = query
        .trim()
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      const likePattern = `%${searchTerm}%`;

      [tenants, endpoints] = await Promise.all([
        db
          .selectFrom("tenants")
          .select([
            "id",
            "name",
            "org_slug",
            "default_price_usdc",
            "default_scheme",
            "tags",
          ])
          .where("is_active", "=", true)
          .where("status", "=", "active")
          .where((eb) =>
            eb.or([
              eb("name", "ilike", likePattern),
              eb("org_slug", "ilike", likePattern),
              eb(sql`openapi_spec::text`, "ilike", likePattern),
              eb(sql`tenants.tags::text`, "ilike", likePattern),
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
            "e.tenant_id as proxy_id",
            "t.name as proxy_name",
            "t.org_slug",
            "e.path_pattern",
            "e.description",
            "e.price_usdc",
            "e.scheme",
            "e.tags",
          ])
          .where("e.is_active", "=", true)
          .where("e.deleted_at", "is", null)
          .where("t.is_active", "=", true)
          .where("t.status", "=", "active")
          .where((eb) =>
            eb.or([
              eb("e.path_pattern", "ilike", likePattern),
              eb("e.description", "ilike", likePattern),
              eb(sql`e.tags::text`, "ilike", likePattern),
            ]),
          )
          .orderBy("t.name")
          .orderBy("e.path_pattern")
          .limit(50)
          .execute() as Promise<EndpointResult[]>,
      ]);
    } else {
      const tsqueryExpr = buildTsquery(query);

      if (tsqueryExpr.length === 0) {
        return c.json({ proxies: [], endpoints: [] });
      }

      const tsquery = sql`to_tsquery('simple', ${tsqueryExpr})`;

      [tenants, endpoints] = await Promise.all([
        db
          .selectFrom("tenants")
          .select([
            "id",
            "name",
            "org_slug",
            "default_price_usdc",
            "default_scheme",
            "tags",
          ])
          .where("is_active", "=", true)
          .where("status", "=", "active")
          .where(sql<SqlBool>`search_vector @@ ${tsquery}`)
          .orderBy(sql`ts_rank(search_vector, ${tsquery})`, "desc")
          .limit(20)
          .execute() as Promise<TenantResult[]>,

        db
          .selectFrom("endpoints as e")
          .innerJoin("tenants as t", "t.id", "e.tenant_id")
          .select([
            "e.id",
            "e.tenant_id as proxy_id",
            "t.name as proxy_name",
            "t.org_slug",
            "e.path_pattern",
            "e.description",
            "e.price_usdc",
            "e.scheme",
            "e.tags",
          ])
          .where("e.is_active", "=", true)
          .where("e.deleted_at", "is", null)
          .where("t.is_active", "=", true)
          .where("t.status", "=", "active")
          .where(sql<SqlBool>`e.search_vector @@ ${tsquery}`)
          .orderBy(sql`ts_rank(e.search_vector, ${tsquery})`, "desc")
          .limit(50)
          .execute() as Promise<EndpointResult[]>,
      ]);
    }

    const proxies = tenants.map((t) => ({
      ...t,
      url: buildProxyUrl(t.name, t.org_slug),
    }));
    return c.json({ proxies, endpoints });
  } catch (error) {
    logger.error("Search error", { error });
    return c.json({ error: "Search failed" }, 500);
  }
});
