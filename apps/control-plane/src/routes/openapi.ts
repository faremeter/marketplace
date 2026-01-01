import { Hono } from "hono";
import { db } from "../server.js";
import { syncToNode } from "../lib/sync.js";
import { logger } from "../logger.js";
import { requireTenantAccess } from "../middleware/auth.js";
import {
  createResourceLimiter,
  modifyResourceLimiter,
} from "../middleware/rate-limit.js";
import { arktypeValidator } from "@hono/arktype-validator";
import { OpenApiImportSchema, ValidatePatternSchema } from "../lib/schemas.js";

export const openapiRoutes = new Hono();

openapiRoutes.use("*", requireTenantAccess);

interface OpenApiSpec {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, PathItem>;
  [key: string]: unknown;
}

interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  head?: OperationObject;
  options?: OperationObject;
  trace?: OperationObject;
  summary?: string;
  description?: string;
  [key: string]: unknown;
}

interface OperationObject {
  summary?: string;
  description?: string;
  operationId?: string;
  [key: string]: unknown;
}

function validateOpenApiSpec(spec: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["Spec must be a JSON object"] };
  }

  const s = spec as OpenApiSpec;

  if (!s.openapi) {
    errors.push("Missing 'openapi' field");
  } else if (!s.openapi.startsWith("3.")) {
    errors.push("Only OpenAPI 3.x specs are supported");
  }

  if (!s.paths || typeof s.paths !== "object") {
    errors.push("Missing or invalid 'paths' object");
  } else {
    for (const path of Object.keys(s.paths)) {
      if (!path.startsWith("/")) {
        errors.push(`Path '${path}' must start with '/'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function openApiPathToRegex(path: string): string {
  // Escape special regex chars except {}
  const escaped = path.replace(/[.*+?^$|()[\]\\]/g, "\\$&");
  // Replace {param} with [^/]+
  const regex = escaped.replace(/\{[^}]+\}/g, "[^/]+");
  return `^${regex}$`;
}

function extractPathsFromSpec(spec: OpenApiSpec): {
  path: string;
  pattern: string;
  description: string | null;
}[] {
  const paths: {
    path: string;
    pattern: string;
    description: string | null;
  }[] = [];

  if (!spec.paths) return paths;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (path === "/" || path === "/*") continue;

    const item = pathItem as PathItem;
    // Get description from path-level or first operation
    let description: string | null = item.summary || item.description || null;
    if (!description) {
      const methods = [
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "head",
        "options",
        "trace",
      ] as const;
      for (const method of methods) {
        const op = item[method] as OperationObject | undefined;
        if (op?.summary || op?.description) {
          description = op.summary || op.description || null;
          break;
        }
      }
    }

    paths.push({
      path,
      pattern: openApiPathToRegex(path),
      description,
    });
  }

  return paths;
}

function testPatternMatch(pattern: string, path: string): boolean {
  try {
    const regex = new RegExp(pattern);
    return regex.test(path);
  } catch {
    return false;
  }
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// GET /openapi/spec - Get stored OpenAPI spec
openapiRoutes.get("/spec", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");

  const tenant = await db
    .selectFrom("tenants")
    .select(["openapi_spec"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  return c.json({
    spec: tenant.openapi_spec ?? null,
    hasSpec: tenant.openapi_spec !== null,
  });
});

// DELETE /openapi/spec - Remove stored OpenAPI spec
openapiRoutes.delete("/spec", modifyResourceLimiter, async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");

  const result = await db
    .updateTable("tenants")
    .set({ openapi_spec: null })
    .where("id", "=", tenantId)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  return c.json({ success: true });
});

// POST /openapi/import - Import OpenAPI spec and create endpoints
openapiRoutes.post(
  "/import",
  createResourceLimiter,
  arktypeValidator("json", OpenApiImportSchema),
  async (c) => {
    const tenantId = parseInt(c.req.param("tenantId") ?? "");
    const body = c.req.valid("json");

    const validation = validateOpenApiSpec(body.spec);
    if (!validation.valid) {
      return c.json(
        { error: "Invalid OpenAPI spec", details: validation.errors },
        400,
      );
    }

    const spec = body.spec as OpenApiSpec;
    const paths = extractPathsFromSpec(spec);

    if (paths.length === 0) {
      return c.json({ error: "No paths found in spec" }, 400);
    }

    // Store the spec on tenant
    await db
      .updateTable("tenants")
      .set({ openapi_spec: JSON.stringify(spec) })
      .where("id", "=", tenantId)
      .execute();

    // Get existing endpoints to check for duplicates
    const existingEndpoints = await db
      .selectFrom("endpoints")
      .select(["id", "path_pattern"])
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .execute();

    const existingPatternMap = new Map(
      existingEndpoints.map((e) => [e.path_pattern, e.id]),
    );

    // Create or update endpoints for each path
    const created: string[] = [];
    const linked: string[] = [];

    for (const pathInfo of paths) {
      const existingId = existingPatternMap.get(pathInfo.pattern);

      if (existingId) {
        // Update existing endpoint with lineage
        await db
          .updateTable("endpoints")
          .set({ openapi_source_paths: [pathInfo.path] })
          .where("id", "=", existingId)
          .execute();
        linked.push(pathInfo.path);
      } else {
        // Create new endpoint
        await db
          .insertInto("endpoints")
          .values({
            tenant_id: tenantId,
            path: pathInfo.path,
            path_pattern: pathInfo.pattern,
            description: pathInfo.description,
            priority: 100,
            is_active: true,
            openapi_source_paths: [pathInfo.path],
          })
          .execute();
        created.push(pathInfo.path);
      }
    }

    // Sync to all nodes
    const tenantNodes = await db
      .selectFrom("tenant_nodes")
      .select("node_id")
      .where("tenant_id", "=", tenantId)
      .execute();

    for (const tn of tenantNodes) {
      syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
    }

    return c.json({
      success: true,
      created: created.length,
      linked: linked.length,
      paths: {
        created,
        linked,
      },
    });
  },
);

// GET /openapi/export - Export endpoints as OpenAPI spec
openapiRoutes.get("/export", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const includeOrphans = c.req.query("include_orphans") === "true";

  const tenant = await db
    .selectFrom("tenants")
    .select([
      "name",
      "backend_url",
      "openapi_spec",
      "default_price_usdc",
      "default_scheme",
    ])
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
    .execute();

  // Start with stored spec as base, or create minimal spec
  let baseSpec: OpenApiSpec;
  if (tenant.openapi_spec) {
    baseSpec = tenant.openapi_spec as OpenApiSpec;
  } else {
    baseSpec = {
      openapi: "3.0.3",
      info: {
        title: tenant.name,
        version: "1.0.0",
      },
      paths: {},
    };
  }

  const exportedSpec: OpenApiSpec = {
    ...baseSpec,
    paths: { ...baseSpec.paths },
  };

  const warnings: string[] = [];
  const orphanEndpoints: { pattern: string; description: string | null }[] = [];

  for (const endpoint of endpoints) {
    const sourcePaths = endpoint.openapi_source_paths as string[] | null;

    if (sourcePaths && sourcePaths.length > 0) {
      // Has lineage - add pricing extension to each source path
      for (const sourcePath of sourcePaths) {
        if (!exportedSpec.paths) {
          exportedSpec.paths = {};
        }
        if (!exportedSpec.paths[sourcePath]) {
          exportedSpec.paths[sourcePath] = {};
        }

        // Add pricing extension at path level
        (exportedSpec.paths[sourcePath] as Record<string, unknown>)[
          "x-402-pricing"
        ] = {
          price_usdc: endpoint.price_usdc ?? tenant.default_price_usdc,
          scheme: endpoint.scheme ?? tenant.default_scheme,
          endpoint_id: endpoint.id,
        };
      }
    } else {
      // Orphan endpoint - no lineage
      orphanEndpoints.push({
        pattern: endpoint.path_pattern,
        description: endpoint.description,
      });

      if (includeOrphans) {
        // Try to convert regex pattern to path-like format
        let displayPath = endpoint.path_pattern;
        // Remove ^ and $ anchors
        displayPath = displayPath.replace(/^\^/, "").replace(/\$$/, "");
        // Replace [^/]+ with {param}
        let paramCount = 0;
        displayPath = displayPath.replace(
          /\[\^\/\]\+/g,
          () => `{param${++paramCount}}`,
        );
        // Replace .* with {wildcard}
        displayPath = displayPath.replace(/\.\*/g, "{wildcard}");

        if (!exportedSpec.paths) {
          exportedSpec.paths = {};
        }
        exportedSpec.paths[displayPath] = {
          "x-402-orphan": true,
          "x-402-original-pattern": endpoint.path_pattern,
          "x-402-pricing": {
            price_usdc: endpoint.price_usdc ?? tenant.default_price_usdc,
            scheme: endpoint.scheme ?? tenant.default_scheme,
            endpoint_id: endpoint.id,
          },
        };
      } else {
        warnings.push(
          `Endpoint '${endpoint.path_pattern}' has no OpenAPI lineage and will not be exported`,
        );
      }
    }
  }

  return c.json({
    spec: exportedSpec,
    warnings,
    orphanEndpoints,
    stats: {
      totalEndpoints: endpoints.length,
      withLineage: endpoints.length - orphanEndpoints.length,
      orphans: orphanEndpoints.length,
    },
  });
});

// POST /openapi/validate-pattern - Validate regex pattern against stored spec
openapiRoutes.post(
  "/validate-pattern",
  arktypeValidator("json", ValidatePatternSchema),
  async (c) => {
    const tenantId = parseInt(c.req.param("tenantId") ?? "");
    const body = c.req.valid("json");
    const pattern = body.pattern;

    // Check if pattern is valid regex
    if (!isValidRegex(pattern)) {
      return c.json({
        valid: false,
        isValidRegex: false,
        matches: [],
        error: "Invalid regex pattern",
      });
    }

    const tenant = await db
      .selectFrom("tenants")
      .select(["openapi_spec"])
      .where("id", "=", tenantId)
      .executeTakeFirst();

    if (!tenant) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    if (!tenant.openapi_spec) {
      return c.json({
        valid: true,
        isValidRegex: true,
        matches: [],
        hasSpec: false,
      });
    }

    const spec = tenant.openapi_spec as OpenApiSpec;
    const specPaths = Object.keys(spec.paths || {});

    // Test pattern against each path in the spec
    const matches: string[] = [];
    for (const path of specPaths) {
      if (testPatternMatch(pattern, path)) {
        matches.push(path);
      }
    }

    return c.json({
      valid: true,
      isValidRegex: true,
      matches,
      hasSpec: true,
      totalSpecPaths: specPaths.length,
    });
  },
);
