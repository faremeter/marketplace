import "../tests/setup/env.js";
import t from "tap";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { endpointPathToOpenApiPath, syncOpenApiSpec } from "./openapi-sync.js";

await setupTestSchema();

async function createTenant(name: string, openapiSpec?: unknown) {
  return db
    .insertInto("tenants")
    .values({
      name,
      organization_id: null,
      backend_url: "http://backend.example.com",
      default_price_usdc: 0.01,
      default_scheme: "exact",
      openapi_spec: openapiSpec ? JSON.stringify(openapiSpec) : undefined,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createEndpoint(
  tenantId: number,
  path: string | null,
  pathPattern: string,
  opts: {
    description?: string | null;
    openapi_source_paths?: string[];
    is_active?: boolean;
    priority?: number;
  } = {},
) {
  return db
    .insertInto("endpoints")
    .values({
      tenant_id: tenantId,
      path,
      path_pattern: pathPattern,
      priority: opts.priority ?? 100,
      is_active: opts.is_active ?? true,
      description: opts.description ?? null,
      openapi_source_paths: opts.openapi_source_paths ?? undefined,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTenantSpec(tenantId: number): Promise<any> {
  const tenant = await db
    .selectFrom("tenants")
    .select(["openapi_spec"])
    .where("id", "=", tenantId)
    .executeTakeFirst();
  return tenant?.openapi_spec ?? null;
}

t.beforeEach(async () => {
  await clearTestData();
});

// ---------------------------------------------------------------------------
// endpointPathToOpenApiPath - pure function tests
// ---------------------------------------------------------------------------

await t.test("endpointPathToOpenApiPath", async (t) => {
  // --- non-regex paths returned as-is ---

  await t.test("returns OpenAPI-style path as-is", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("/users/{id}", "^/users/[^/]+$"),
      "/users/{id}",
    );
  });

  await t.test("returns OpenAPI path with multiple params as-is", async (t) => {
    t.equal(
      endpointPathToOpenApiPath(
        "/users/{userId}/posts/{postId}",
        "^/users/[^/]+/posts/[^/]+$",
      ),
      "/users/{userId}/posts/{postId}",
    );
  });

  await t.test("returns literal path as-is", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("/users/list", "/users/list"),
      "/users/list",
    );
  });

  await t.test("returns root path as-is", async (t) => {
    t.equal(endpointPathToOpenApiPath("/", "/"), "/");
  });

  await t.test("returns path with trailing slash as-is", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("/api/users/", "/api/users/"),
      "/api/users/",
    );
  });

  await t.test("returns empty string path as-is", async (t) => {
    t.equal(endpointPathToOpenApiPath("", ""), "");
  });

  // --- regex conversion: successful cases ---

  await t.test("converts simple regex with one param", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/users/[^/]+$", "^/users/[^/]+$"),
      "/users/{param1}",
    );
  });

  await t.test("converts regex with multiple params", async (t) => {
    t.equal(
      endpointPathToOpenApiPath(
        "^/users/[^/]+/posts/[^/]+$",
        "^/users/[^/]+/posts/[^/]+$",
      ),
      "/users/{param1}/posts/{param2}",
    );
  });

  await t.test("converts regex with wildcard .*", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/api/.*$", "^/api/.*$"),
      "/api/{wildcard}",
    );
  });

  await t.test("converts regex with both [^/]+ and .*", async (t) => {
    t.equal(
      endpointPathToOpenApiPath(
        "^/api/[^/]+/proxy/.*$",
        "^/api/[^/]+/proxy/.*$",
      ),
      "/api/{param1}/proxy/{wildcard}",
    );
  });

  await t.test("converts regex with only ^ prefix, no $ suffix", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/api/[^/]+/data", "^/api/[^/]+/data"),
      "/api/{param1}/data",
    );
  });

  await t.test(
    "converts simple regex with no metacharacters after stripping",
    async (t) => {
      t.equal(
        endpointPathToOpenApiPath("^/simple/path$", "^/simple/path$"),
        "/simple/path",
      );
    },
  );

  // --- regex conversion: null path falls through to pattern ---

  await t.test(
    "null path with convertible pattern returns converted path",
    async (t) => {
      t.equal(
        endpointPathToOpenApiPath(null, "^/users/[^/]+$"),
        "/users/{param1}",
      );
    },
  );

  await t.test(
    "null path with unconvertible pattern returns null",
    async (t) => {
      t.equal(endpointPathToOpenApiPath(null, "^/api/v[0-9]+/users$"), null);
    },
  );

  await t.test("null path with simple pattern returns path", async (t) => {
    t.equal(endpointPathToOpenApiPath(null, "^/simple$"), "/simple");
  });

  // --- regex conversion: unconvertible patterns return null ---

  await t.test("returns null for character class [0-9]+", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/api/v[0-9]+/users$", "^/api/v[0-9]+/users$"),
      null,
    );
  });

  await t.test("returns null for alternation (a|b)", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/(users|posts)$", "^/(users|posts)$"),
      null,
    );
  });

  await t.test("returns null for + quantifier", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/[a-z]+/data$", "^/[a-z]+/data$"),
      null,
    );
  });

  await t.test("returns null for ? quantifier", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/api/v1?/users$", "^/api/v1?/users$"),
      null,
    );
  });

  await t.test("returns null for escaped character \\.", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/api/v1\\.0/users$", "^/api/v1\\.0/users$"),
      null,
    );
  });

  await t.test("returns null for nested groups", async (t) => {
    t.equal(
      endpointPathToOpenApiPath(
        "^/api/(v[0-9]+)/users$",
        "^/api/(v[0-9]+)/users$",
      ),
      null,
    );
  });

  await t.test("returns null for $ in middle of pattern", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/api/$special$", "^/api/$special$"),
      null,
    );
  });

  await t.test("returns null for ^ in middle of pattern", async (t) => {
    t.equal(
      endpointPathToOpenApiPath("^/api/^nested$", "^/api/^nested$"),
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// syncOpenApiSpec - integration tests
// ---------------------------------------------------------------------------

await t.test("syncOpenApiSpec", async (t) => {
  // --- fresh spec generation (no existing spec) ---

  await t.test("generates fresh spec when no spec exists", async (t) => {
    const tenant = await createTenant("Test API");
    await createEndpoint(tenant.id, "/users/{id}", "^/users/[^/]+$", {
      description: "Get user by ID",
    });

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.ok(spec);
    t.equal(spec.openapi, "3.0.3");
    t.equal(spec.info.title, "Test API");
    t.equal(spec.info.version, "1.0.0");
    t.ok(spec.paths["/users/{id}"]);
    t.equal(spec.paths["/users/{id}"].get.summary, "Get user by ID");
    t.ok(spec.paths["/users/{id}"].get.responses["200"]);
  });

  await t.test("uses tenant name as spec title in fresh spec", async (t) => {
    const tenant = await createTenant("My Cool Service");
    await createEndpoint(tenant.id, "/ping", "/ping");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.info.title, "My Cool Service");
  });

  await t.test(
    "generates valid spec with empty paths when no active endpoints",
    async (t) => {
      const tenant = await createTenant("Empty API");

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.ok(spec);
      t.equal(spec.openapi, "3.0.3");
      t.same(spec.paths, {});
    },
  );

  // --- multiple endpoints ---

  await t.test("includes all active endpoints in spec", async (t) => {
    const tenant = await createTenant("Multi API");
    await createEndpoint(tenant.id, "/users", "/users", {
      description: "List users",
    });
    await createEndpoint(tenant.id, "/posts/{id}", "^/posts/[^/]+$", {
      description: "Get post",
    });
    await createEndpoint(tenant.id, "/health", "/health", {
      description: "Health check",
    });

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(Object.keys(spec.paths).length, 3);
    t.ok(spec.paths["/users"]);
    t.ok(spec.paths["/posts/{id}"]);
    t.ok(spec.paths["/health"]);
  });

  // --- filtering ---

  await t.test("excludes inactive endpoints", async (t) => {
    const tenant = await createTenant("Active API");
    await createEndpoint(tenant.id, "/active", "/active");
    await createEndpoint(tenant.id, "/deleted", "/deleted", {
      is_active: false,
    });

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.ok(spec.paths["/active"]);
    t.notOk(spec.paths["/deleted"]);
    t.equal(Object.keys(spec.paths).length, 1);
  });

  await t.test("skips unconvertible regex endpoints", async (t) => {
    const tenant = await createTenant("Regex API");
    await createEndpoint(tenant.id, "/users/{id}", "^/users/[^/]+$");
    await createEndpoint(
      tenant.id,
      "^/api/v[0-9]+/data$",
      "^/api/v[0-9]+/data$",
    );

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.ok(spec.paths["/users/{id}"]);
    t.equal(Object.keys(spec.paths).length, 1);
  });

  await t.test(
    "handles endpoint with null path and unconvertible regex",
    async (t) => {
      const tenant = await createTenant("Null Path API");
      await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path: null,
          path_pattern: "^/api/v[0-9]+$",
          priority: 100,
          is_active: true,
        })
        .execute();

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.ok(spec);
      t.same(spec.paths, {});
    },
  );

  await t.test(
    "handles endpoint with null path but convertible regex",
    async (t) => {
      const tenant = await createTenant("Null Path Convertible");
      await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path: null,
          path_pattern: "^/users/[^/]+$",
          priority: 100,
          is_active: true,
          description: "From regex",
        })
        .execute();

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/users/{param1}"]);
      t.equal(spec.paths["/users/{param1}"].get.summary, "From regex");
    },
  );

  // --- description fallback ---

  await t.test("uses description as summary when present", async (t) => {
    const tenant = await createTenant("Desc API");
    await createEndpoint(tenant.id, "/users", "/users", {
      description: "List all users",
    });

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.paths["/users"].get.summary, "List all users");
  });

  await t.test("uses fallback summary when description is null", async (t) => {
    const tenant = await createTenant("No Desc API");
    await createEndpoint(tenant.id, "/users", "/users", {
      description: null,
    });

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.paths["/users"].get.summary, "Endpoint: /users");
  });

  await t.test(
    "uses empty string description as-is (nullish coalescing)",
    async (t) => {
      const tenant = await createTenant("Empty Desc API");
      await createEndpoint(tenant.id, "/users", "/users", {
        description: "",
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      // ?? only coalesces null/undefined, not empty string
      t.equal(spec.paths["/users"].get.summary, "");
    },
  );

  await t.test("lineage fallback summary uses source path name", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: { title: "API", version: "1.0.0" },
      paths: {},
    };

    const tenant = await createTenant("Lineage Fallback", baseSpec);
    await createEndpoint(tenant.id, "/missing", "/missing", {
      openapi_source_paths: ["/missing"],
      description: null,
    });

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.paths["/missing"].get.summary, "Endpoint: /missing");
  });

  // --- lineage (openapi_source_paths) behavior ---

  await t.test(
    "lineage endpoint preserves original path item from base spec",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/users/{id}": {
            get: {
              summary: "Get user",
              operationId: "getUser",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": { description: "User found" },
                "404": { description: "User not found" },
              },
            },
            delete: {
              summary: "Delete user",
              responses: { "204": { description: "Deleted" } },
            },
          },
        },
      };

      const tenant = await createTenant("Lineage API", baseSpec);
      await createEndpoint(tenant.id, "/users/{id}", "^/users/[^/]+$", {
        openapi_source_paths: ["/users/{id}"],
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      const pathItem = spec.paths["/users/{id}"];
      // Entire original path item preserved including all methods
      t.equal(pathItem.get.summary, "Get user");
      t.equal(pathItem.get.operationId, "getUser");
      t.ok(pathItem.get.parameters);
      t.ok(pathItem.get.responses["404"]);
      t.equal(pathItem.delete.summary, "Delete user");
    },
  );

  await t.test(
    "lineage endpoint generates stub when source path not in base spec",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        paths: {},
      };

      const tenant = await createTenant("Stub API", baseSpec);
      await createEndpoint(tenant.id, "/missing", "/missing", {
        openapi_source_paths: ["/gone-path"],
        description: "Was imported but path removed from spec",
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/gone-path"]);
      t.equal(
        spec.paths["/gone-path"].get.summary,
        "Was imported but path removed from spec",
      );
      t.ok(spec.paths["/gone-path"].get.responses["200"]);
    },
  );

  await t.test(
    "endpoint with multiple openapi_source_paths adds all paths",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              summary: "List users",
              responses: { "200": { description: "OK" } },
            },
          },
          "/users/{id}": {
            get: {
              summary: "Get user",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const tenant = await createTenant("Multi Source API", baseSpec);
      await createEndpoint(tenant.id, "/users", "/users", {
        openapi_source_paths: ["/users", "/users/{id}"],
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/users"]);
      t.ok(spec.paths["/users/{id}"]);
      t.equal(spec.paths["/users"].get.summary, "List users");
      t.equal(spec.paths["/users/{id}"].get.summary, "Get user");
    },
  );

  await t.test(
    "endpoint with multiple source paths - mix of existing and missing",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/exists": {
            get: {
              summary: "Exists",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const tenant = await createTenant("Mix Source API", baseSpec);
      await createEndpoint(tenant.id, "/exists", "/exists", {
        openapi_source_paths: ["/exists", "/does-not-exist"],
        description: "Mixed endpoint",
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      // Existing path preserved from base
      t.equal(spec.paths["/exists"].get.summary, "Exists");
      // Missing path gets stub with endpoint description
      t.equal(spec.paths["/does-not-exist"].get.summary, "Mixed endpoint");
    },
  );

  await t.test(
    "empty openapi_source_paths array treated as no lineage",
    async (t) => {
      const tenant = await createTenant("Empty Lineage API");
      await createEndpoint(tenant.id, "/manual", "/manual", {
        openapi_source_paths: [],
        description: "Manual endpoint",
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      // Should be treated as manual (no lineage), path derived from endpoint.path
      t.ok(spec.paths["/manual"]);
      t.equal(spec.paths["/manual"].get.summary, "Manual endpoint");
    },
  );

  // --- existing spec preservation ---

  await t.test("preserves openapi version from existing spec", async (t) => {
    const baseSpec = {
      openapi: "3.1.0",
      info: { title: "API", version: "1.0.0" },
      paths: {},
    };

    const tenant = await createTenant("Version API", baseSpec);
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.openapi, "3.1.0");
  });

  await t.test("preserves info block from existing spec", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: {
        title: "Original Title",
        version: "2.5.0",
        description: "Full API description",
      },
      paths: {},
    };

    const tenant = await createTenant("Info API", baseSpec);
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.info.title, "Original Title");
    t.equal(spec.info.version, "2.5.0");
    t.equal(spec.info.description, "Full API description");
  });

  await t.test("preserves servers from existing spec", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: { title: "API", version: "1.0.0" },
      servers: [
        { url: "https://api.example.com" },
        { url: "https://staging.example.com" },
      ],
      paths: {},
    };

    const tenant = await createTenant("Servers API", baseSpec);
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.servers.length, 2);
    t.equal(spec.servers[0].url, "https://api.example.com");
    t.equal(spec.servers[1].url, "https://staging.example.com");
  });

  await t.test("preserves components from existing spec", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: { title: "API", version: "1.0.0" },
      components: {
        schemas: {
          User: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
        },
      },
      paths: {},
    };

    const tenant = await createTenant("Components API", baseSpec);
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.ok(spec.components.schemas.User);
    t.ok(spec.components.securitySchemes.bearerAuth);
  });

  await t.test("preserves tags from existing spec", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: { title: "API", version: "1.0.0" },
      tags: [
        { name: "users", description: "User operations" },
        { name: "admin", description: "Admin operations" },
      ],
      paths: {},
    };

    const tenant = await createTenant("Tags API", baseSpec);
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.tags.length, 2);
    t.equal(spec.tags[0].name, "users");
  });

  await t.test("preserves security from existing spec", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: { title: "API", version: "1.0.0" },
      security: [{ bearerAuth: [] }],
      paths: {},
    };

    const tenant = await createTenant("Security API", baseSpec);
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.security.length, 1);
    t.same(spec.security[0], { bearerAuth: [] });
  });

  await t.test("preserves externalDocs from existing spec", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: { title: "API", version: "1.0.0" },
      externalDocs: {
        description: "Full documentation",
        url: "https://docs.example.com",
      },
      paths: {},
    };

    const tenant = await createTenant("ExtDocs API", baseSpec);
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.equal(spec.externalDocs.url, "https://docs.example.com");
  });

  // --- existing spec with missing/null paths ---

  await t.test("handles existing spec with no paths key", async (t) => {
    // Force a spec with no paths key into the DB
    const tenant = await createTenant("No Paths Key");
    await db
      .updateTable("tenants")
      .set({
        openapi_spec: JSON.stringify({
          openapi: "3.0.1",
          info: { title: "API", version: "1.0.0" },
        }),
      })
      .where("id", "=", tenant.id)
      .execute();
    await createEndpoint(tenant.id, "/test", "/test");

    await syncOpenApiSpec(tenant.id);

    const spec = await getTenantSpec(tenant.id);
    t.ok(spec.paths["/test"]);
  });

  // --- path removal ---

  await t.test(
    "removes path when its lineage endpoint is deleted",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/users/{id}": {
            get: {
              summary: "Get user",
              responses: { "200": { description: "OK" } },
            },
          },
          "/posts": {
            get: {
              summary: "List posts",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const tenant = await createTenant("Delete API", baseSpec);
      // Only create one endpoint - simulating the other was deleted
      await createEndpoint(tenant.id, "/posts", "/posts", {
        openapi_source_paths: ["/posts"],
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/posts"]);
      t.notOk(spec.paths["/users/{id}"]);
    },
  );

  await t.test(
    "removes all paths when all endpoints are inactive",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/users": {
            get: {
              summary: "List",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const tenant = await createTenant("All Deleted API", baseSpec);
      await createEndpoint(tenant.id, "/users", "/users", {
        openapi_source_paths: ["/users"],
        is_active: false,
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.same(spec.paths, {});
      // But base spec structure is still preserved
      t.equal(spec.openapi, "3.0.1");
      t.equal(spec.info.title, "API");
    },
  );

  // --- duplicate/overlapping paths ---

  await t.test(
    "two endpoints with same converted path - last one wins",
    async (t) => {
      const tenant = await createTenant("Dupe API");
      await createEndpoint(tenant.id, "/users", "/users", {
        description: "First",
        priority: 100,
      });
      await createEndpoint(tenant.id, "/users", "/users", {
        description: "Second",
        priority: 200,
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.equal(Object.keys(spec.paths).length, 1);
      // Both map to "/users", second overwrites first (ordered by priority asc)
      t.equal(spec.paths["/users"].get.summary, "Second");
    },
  );

  // --- mixed endpoint types ---

  await t.test(
    "handles mix of lineage, manual, and unconvertible endpoints",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        paths: {
          "/imported": {
            get: {
              summary: "Imported",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const tenant = await createTenant("Mixed API", baseSpec);
      // Lineage endpoint
      await createEndpoint(tenant.id, "/imported", "^/imported$", {
        openapi_source_paths: ["/imported"],
      });
      // Manual OpenAPI-style endpoint
      await createEndpoint(tenant.id, "/manual/{id}", "^/manual/[^/]+$", {
        description: "Manual with param",
      });
      // Manual literal endpoint
      await createEndpoint(tenant.id, "/literal", "/literal", {
        description: "Literal path",
      });
      // Unconvertible regex - should be skipped
      await createEndpoint(tenant.id, "^/regex/v[0-9]+$", "^/regex/v[0-9]+$");
      // Inactive - should be skipped
      await createEndpoint(tenant.id, "/inactive", "/inactive", {
        is_active: false,
      });

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.equal(Object.keys(spec.paths).length, 3);
      // Lineage preserved from base
      t.equal(spec.paths["/imported"].get.summary, "Imported");
      // Manual with param included
      t.equal(spec.paths["/manual/{id}"].get.summary, "Manual with param");
      // Literal included
      t.equal(spec.paths["/literal"].get.summary, "Literal path");
      // Unconvertible regex skipped
      t.notOk(spec.paths["^/regex/v[0-9]+$"]);
      t.notOk(spec.paths["/regex/v[0-9]+"]);
      // Inactive skipped
      t.notOk(spec.paths["/inactive"]);
    },
  );

  // --- idempotency ---

  await t.test("calling sync twice produces identical result", async (t) => {
    const tenant = await createTenant("Idempotent API");
    await createEndpoint(tenant.id, "/users", "/users", {
      description: "List users",
    });
    await createEndpoint(tenant.id, "/posts/{id}", "^/posts/[^/]+$", {
      description: "Get post",
    });

    await syncOpenApiSpec(tenant.id);
    const spec1 = await getTenantSpec(tenant.id);

    await syncOpenApiSpec(tenant.id);
    const spec2 = await getTenantSpec(tenant.id);

    t.same(spec1, spec2);
  });

  await t.test(
    "calling sync three times with existing spec is idempotent",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "API", version: "1.0.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/users": {
            get: {
              summary: "List",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const tenant = await createTenant("Triple Sync", baseSpec);
      await createEndpoint(tenant.id, "/users", "/users", {
        openapi_source_paths: ["/users"],
      });
      await createEndpoint(tenant.id, "/extra", "/extra");

      await syncOpenApiSpec(tenant.id);
      await syncOpenApiSpec(tenant.id);
      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.equal(spec.openapi, "3.0.1");
      t.equal(spec.servers.length, 1);
      t.ok(spec.paths["/users"]);
      t.ok(spec.paths["/extra"]);
      t.equal(Object.keys(spec.paths).length, 2);
    },
  );

  // --- tenant isolation ---

  await t.test("syncing one tenant does not affect another", async (t) => {
    const tenantA = await createTenant("Tenant A");
    const tenantB = await createTenant("Tenant B");
    await createEndpoint(tenantA.id, "/a-endpoint", "/a-endpoint");
    await createEndpoint(tenantB.id, "/b-endpoint", "/b-endpoint");

    await syncOpenApiSpec(tenantA.id);

    const specA = await getTenantSpec(tenantA.id);
    const specB = await getTenantSpec(tenantB.id);

    t.ok(specA);
    t.ok(specA.paths["/a-endpoint"]);
    t.notOk(specA.paths["/b-endpoint"]);
    // Tenant B should not have a spec yet (never synced)
    t.equal(specB, null);
  });

  await t.test(
    "syncing both tenants independently produces correct specs",
    async (t) => {
      const tenantA = await createTenant("Tenant A");
      const tenantB = await createTenant("Tenant B");
      await createEndpoint(tenantA.id, "/a-only", "/a-only");
      await createEndpoint(tenantB.id, "/b-only", "/b-only");

      await syncOpenApiSpec(tenantA.id);
      await syncOpenApiSpec(tenantB.id);

      const specA = await getTenantSpec(tenantA.id);
      const specB = await getTenantSpec(tenantB.id);

      t.equal(specA.info.title, "Tenant A");
      t.ok(specA.paths["/a-only"]);
      t.notOk(specA.paths["/b-only"]);

      t.equal(specB.info.title, "Tenant B");
      t.ok(specB.paths["/b-only"]);
      t.notOk(specB.paths["/a-only"]);
    },
  );

  // --- non-existent tenant ---

  await t.test("does nothing for non-existent tenant", async (t) => {
    await syncOpenApiSpec(999999);
    t.pass("no error thrown");
  });

  // --- spec cleared then re-synced ---

  await t.test("regenerates fresh spec after spec was deleted", async (t) => {
    const baseSpec = {
      openapi: "3.0.1",
      info: { title: "Original", version: "1.0.0" },
      paths: {
        "/users": {
          get: { summary: "List", responses: { "200": { description: "OK" } } },
        },
      },
    };

    const tenant = await createTenant("Cleared API", baseSpec);
    await createEndpoint(tenant.id, "/users", "/users", {
      openapi_source_paths: ["/users"],
    });

    // Sync with existing spec
    await syncOpenApiSpec(tenant.id);
    let spec = await getTenantSpec(tenant.id);
    t.equal(spec.openapi, "3.0.1");

    // Clear the spec (simulating DELETE /openapi/spec)
    await db
      .updateTable("tenants")
      .set({ openapi_spec: null })
      .where("id", "=", tenant.id)
      .execute();

    // Sync again - should generate fresh since spec is now null
    await syncOpenApiSpec(tenant.id);

    spec = await getTenantSpec(tenant.id);
    // Fresh spec uses 3.0.3 and tenant name
    t.equal(spec.openapi, "3.0.3");
    t.equal(spec.info.title, "Cleared API");
    // Endpoint still has lineage but base spec is gone, so stub is generated
    t.ok(spec.paths["/users"]);
  });

  // --- full rebuild replaces stale paths ---

  await t.test(
    "rebuild removes paths from endpoints that were deactivated between syncs",
    async (t) => {
      const tenant = await createTenant("Deactivate API");
      await createEndpoint(tenant.id, "/keep", "/keep");
      const ep2 = await createEndpoint(tenant.id, "/remove", "/remove");

      await syncOpenApiSpec(tenant.id);

      let spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/keep"]);
      t.ok(spec.paths["/remove"]);

      // Deactivate ep2
      await db
        .updateTable("endpoints")
        .set({ is_active: false })
        .where("id", "=", ep2.id)
        .execute();

      await syncOpenApiSpec(tenant.id);

      spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/keep"]);
      t.notOk(spec.paths["/remove"]);
      t.equal(Object.keys(spec.paths).length, 1);
    },
  );

  await t.test(
    "rebuild adds paths from endpoints created between syncs",
    async (t) => {
      const tenant = await createTenant("Add Between API");
      await createEndpoint(tenant.id, "/first", "/first");

      await syncOpenApiSpec(tenant.id);

      let spec = await getTenantSpec(tenant.id);
      t.equal(Object.keys(spec.paths).length, 1);

      // Add another endpoint
      await createEndpoint(tenant.id, "/second", "/second");

      await syncOpenApiSpec(tenant.id);

      spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/first"]);
      t.ok(spec.paths["/second"]);
      t.equal(Object.keys(spec.paths).length, 2);
    },
  );

  await t.test(
    "rebuild reflects updated endpoint path between syncs",
    async (t) => {
      const tenant = await createTenant("Update Path API");
      const ep = await createEndpoint(tenant.id, "/old-name", "/old-name", {
        description: "Renamed",
      });

      await syncOpenApiSpec(tenant.id);

      let spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/old-name"]);

      // Update the endpoint path
      await db
        .updateTable("endpoints")
        .set({ path: "/new-name", path_pattern: "/new-name" })
        .where("id", "=", ep.id)
        .execute();

      await syncOpenApiSpec(tenant.id);

      spec = await getTenantSpec(tenant.id);
      t.notOk(spec.paths["/old-name"]);
      t.ok(spec.paths["/new-name"]);
      t.equal(spec.paths["/new-name"].get.summary, "Renamed");
    },
  );

  await t.test(
    "rebuild reflects updated endpoint description between syncs",
    async (t) => {
      const tenant = await createTenant("Update Desc API");
      const ep = await createEndpoint(tenant.id, "/users", "/users", {
        description: "Old description",
      });

      await syncOpenApiSpec(tenant.id);

      let spec = await getTenantSpec(tenant.id);
      t.equal(spec.paths["/users"].get.summary, "Old description");

      // Update description
      await db
        .updateTable("endpoints")
        .set({ description: "New description" })
        .where("id", "=", ep.id)
        .execute();

      await syncOpenApiSpec(tenant.id);

      spec = await getTenantSpec(tenant.id);
      t.equal(spec.paths["/users"].get.summary, "New description");
    },
  );

  // --- OpenAPI-style param name preservation ---

  await t.test(
    "preserves original {paramName} from OpenAPI-style path in spec",
    async (t) => {
      const tenant = await createTenant("Param Name API");
      // Simulates what processPathPattern does: path keeps original, pattern is regex
      await createEndpoint(
        tenant.id,
        "/users/{userId}/posts/{postId}",
        "^/users/[^/]+/posts/[^/]+$",
        { description: "Get user post" },
      );

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      // Original param names preserved because path is non-regex
      t.ok(spec.paths["/users/{userId}/posts/{postId}"]);
      t.notOk(spec.paths["/users/{param1}/posts/{param2}"]);
    },
  );

  await t.test(
    "uses synthetic {paramN} names when only raw regex is available",
    async (t) => {
      const tenant = await createTenant("Raw Regex API");
      // User entered raw regex, so path also starts with ^
      await createEndpoint(
        tenant.id,
        "^/users/[^/]+/posts/[^/]+$",
        "^/users/[^/]+/posts/[^/]+$",
        { description: "Raw regex endpoint" },
      );

      await syncOpenApiSpec(tenant.id);

      const spec = await getTenantSpec(tenant.id);
      t.ok(spec.paths["/users/{param1}/posts/{param2}"]);
    },
  );

  // --- manual endpoint add then remove lifecycle ---

  await t.test(
    "adding then removing manual endpoint returns spec to original state",
    async (t) => {
      const baseSpec = {
        openapi: "3.0.1",
        info: { title: "Lifecycle API", version: "1.0.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/users": {
            get: {
              summary: "List users",
              responses: { "200": { description: "OK" } },
            },
          },
          "/users/{id}": {
            get: {
              summary: "Get user",
              parameters: [{ name: "id", in: "path", required: true }],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const tenant = await createTenant("Lifecycle API", baseSpec);
      // Create the imported endpoints with lineage
      await createEndpoint(tenant.id, "/users", "/users", {
        openapi_source_paths: ["/users"],
      });
      await createEndpoint(tenant.id, "/users/{id}", "^/users/[^/]+$", {
        openapi_source_paths: ["/users/{id}"],
      });

      // Sync to baseline
      await syncOpenApiSpec(tenant.id);
      const baselineSpec = await getTenantSpec(tenant.id);
      t.equal(Object.keys(baselineSpec.paths).length, 2);

      // Add a manual endpoint
      const manual = await createEndpoint(tenant.id, "/health", "/health", {
        description: "Health check",
      });
      await syncOpenApiSpec(tenant.id);

      let spec = await getTenantSpec(tenant.id);
      t.equal(Object.keys(spec.paths).length, 3);
      t.ok(spec.paths["/health"]);

      // Remove the manual endpoint
      await db
        .updateTable("endpoints")
        .set({ is_active: false })
        .where("id", "=", manual.id)
        .execute();
      await syncOpenApiSpec(tenant.id);

      spec = await getTenantSpec(tenant.id);
      // Back to just the 2 imported paths
      t.equal(Object.keys(spec.paths).length, 2);
      t.ok(spec.paths["/users"]);
      t.ok(spec.paths["/users/{id}"]);
      t.notOk(spec.paths["/health"]);
      // Original path details still preserved
      t.equal(spec.paths["/users"].get.summary, "List users");
      t.ok(spec.paths["/users/{id}"].get.parameters);
      // Non-path structure still intact
      t.equal(spec.servers.length, 1);
    },
  );
});
