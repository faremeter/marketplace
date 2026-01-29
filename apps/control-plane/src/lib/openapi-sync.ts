import { db } from "../db/instance.js";
import { logger } from "../logger.js";

interface OpenApiSpec {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, unknown>;
  [key: string]: unknown;
}

export function endpointPathToOpenApiPath(
  path: string | null,
  pathPattern: string,
): string | null {
  if (path && !path.startsWith("^")) {
    return path;
  }

  let display = pathPattern;
  display = display.replace(/^\^/, "").replace(/\$$/, "");
  let paramCount = 0;
  display = display.replace(/\[\^\/\]\+/g, () => `{param${++paramCount}}`);
  display = display.replace(/\.\*/g, "{wildcard}");

  // If remaining text still has regex metacharacters, cannot convert
  const withoutParams = display.replace(/\{[^}]+\}/g, "");
  if (/[[\]*+?\\(){}|^$]/.test(withoutParams)) {
    return null;
  }

  return display;
}

export async function syncOpenApiSpec(tenantId: number): Promise<void> {
  const tenant = await db
    .selectFrom("tenants")
    .select(["name", "openapi_spec"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) return;

  const endpoints = await db
    .selectFrom("endpoints")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("is_active", "=", true)
    .orderBy("priority", "asc")
    .execute();

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

  const existingPaths = (baseSpec.paths ?? {}) as Record<string, unknown>;
  const newPaths: Record<string, unknown> = {};

  for (const endpoint of endpoints) {
    const sourcePaths = endpoint.openapi_source_paths as string[] | null;

    if (sourcePaths && sourcePaths.length > 0) {
      for (const sp of sourcePaths) {
        if (existingPaths[sp]) {
          newPaths[sp] = existingPaths[sp];
        } else {
          newPaths[sp] = {
            get: {
              summary: endpoint.description ?? `Endpoint: ${sp}`,
              responses: { "200": { description: "Successful response" } },
            },
          };
        }
      }
    } else {
      const openApiPath = endpointPathToOpenApiPath(
        endpoint.path,
        endpoint.path_pattern,
      );
      if (!openApiPath) {
        logger.debug(
          `syncOpenApiSpec: Cannot convert pattern '${endpoint.path_pattern}' to OpenAPI path, skipping`,
        );
        continue;
      }

      newPaths[openApiPath] = {
        get: {
          summary: endpoint.description ?? `Endpoint: ${openApiPath}`,
          responses: { "200": { description: "Successful response" } },
        },
      };
    }
  }

  const updatedSpec: OpenApiSpec = {
    ...baseSpec,
    paths: newPaths,
  };

  await db
    .updateTable("tenants")
    .set({ openapi_spec: JSON.stringify(updatedSpec) })
    .where("id", "=", tenantId)
    .execute();
}
