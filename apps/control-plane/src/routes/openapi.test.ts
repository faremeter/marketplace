import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { openapiRoutes } from "./openapi.js";
import { OPENAPI_USPTO } from "../tests/fixtures/openapi-spec.js";

const app = new Hono();
app.route("/api/tenants/:tenantId/openapi", openapiRoutes);

await setupTestSchema();

interface TestUser {
  id: number;
  token: string;
}

async function createUser(email: string, isAdmin = false): Promise<TestUser> {
  const user = await db
    .insertInto("users")
    .values({
      email,
      password_hash: "hash",
      is_admin: isAdmin,
    })
    .returning(["id", "email"])
    .executeTakeFirstOrThrow();

  const token = signToken({ userId: user.id, email: user.email, isAdmin });
  return { id: user.id, token };
}

async function createOrg(name: string, slug: string) {
  return db
    .insertInto("organizations")
    .values({ name, slug })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function addMember(userId: number, orgId: number, role = "member") {
  await db
    .insertInto("user_organizations")
    .values({ user_id: userId, organization_id: orgId, role })
    .execute();
}

async function createTenant(orgId: number, name: string) {
  return db
    .insertInto("tenants")
    .values({
      name,
      organization_id: orgId,
      backend_url: "http://backend.example.com",
      default_price_usdc: 0.01,
      default_scheme: "exact",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("GET /api/tenants/:tenantId/openapi/spec", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/tenants/1/openapi/spec");
    t.equal(res.status, 401);
  });

  await t.test("returns 403 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/spec`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 403);
  });

  await t.test("returns null spec when none stored", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/spec`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.spec, null);
    t.equal(data.hasSpec, false);
  });

  await t.test("returns stored spec when present", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spec: OPENAPI_USPTO }),
    });

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/spec`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.hasSpec, true);
    t.ok(data.spec);
    t.equal(data.spec.openapi, OPENAPI_USPTO.openapi);
  });
});

await t.test("handles non-numeric tenantId", async (t) => {
  const user = await createUser("member@example.com");

  const res = await app.request("/api/tenants/invalid/openapi/spec", {
    headers: { Cookie: `auth_token=${user.token}` },
  });
  // parseInt("invalid") returns NaN (falsy), middleware returns 400
  t.equal(res.status, 400);
});

await t.test("DELETE /api/tenants/:tenantId/openapi/spec", async (t) => {
  await t.test("clears stored spec", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await db
      .updateTable("tenants")
      .set({ openapi_spec: JSON.stringify(OPENAPI_USPTO) })
      .where("id", "=", tenant.id)
      .execute();

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/spec`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);
  });
});

await t.test("POST /api/tenants/:tenantId/openapi/import", async (t) => {
  await t.test("rejects invalid spec - missing openapi field", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spec: { paths: { "/test": {} } },
      }),
    });
    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("Invalid"));
  });

  await t.test("rejects spec with no paths", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spec: {
          openapi: "3.0.0",
          info: { title: "Test", version: "1.0.0" },
          paths: { "/": {} },
        },
      }),
    });
    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("No paths"));
  });

  await t.test("imports valid spec and creates endpoints", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spec: OPENAPI_USPTO }),
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);
    t.ok(data.created >= 2);
  });

  await t.test("rejects OpenAPI 2.x spec", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spec: {
          swagger: "2.0",
          info: { title: "Test", version: "1.0.0" },
          paths: { "/users": { get: {} } },
        },
      }),
    });
    t.equal(res.status, 400);
  });

  await t.test(
    "links to existing endpoint instead of creating duplicate",
    async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spec: OPENAPI_USPTO }),
      });

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/import`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spec: OPENAPI_USPTO }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.created, 0);
      t.ok(data.linked >= 2);
    },
  );

  await t.test("handles paths with parameters", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const specWithParams = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users/{userId}": { get: { summary: "Get user" } },
        "/users/{userId}/posts/{postId}": { get: { summary: "Get post" } },
      },
    };

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spec: specWithParams }),
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.created, 2);
  });
});

await t.test("GET /api/tenants/:tenantId/openapi/export", async (t) => {
  await t.test("returns minimal spec when none stored", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/export`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.spec);
    t.equal(data.spec.openapi, "3.0.3");
  });

  await t.test("exports endpoints with pricing info", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spec: OPENAPI_USPTO }),
    });

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/export`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.stats);
    t.ok(data.stats.totalEndpoints >= 2);
  });

  await t.test("reports orphan endpoints in warnings", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await db
      .insertInto("endpoints")
      .values({
        tenant_id: tenant.id,
        path: "/manual/endpoint",
        path_pattern: "^/manual/endpoint$",
        priority: 1,
        is_active: true,
      })
      .execute();

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/export`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.stats.orphans, 1);
    t.ok(data.warnings.length > 0);
  });

  await t.test("includes orphans when requested", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await db
      .insertInto("endpoints")
      .values({
        tenant_id: tenant.id,
        path: "/manual/endpoint",
        path_pattern: "^/manual/endpoint$",
        priority: 1,
        is_active: true,
      })
      .execute();

    const res = await app.request(
      `/api/tenants/${tenant.id}/openapi/export?include_orphans=true`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(Object.keys(data.spec.paths).length > 0);
  });

  await t.test("excludes inactive endpoints from export", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spec: OPENAPI_USPTO }),
    });

    await db
      .updateTable("endpoints")
      .set({ is_active: false })
      .where("tenant_id", "=", tenant.id)
      .execute();

    const res = await app.request(`/api/tenants/${tenant.id}/openapi/export`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.stats.totalEndpoints, 0);
  });
});

await t.test(
  "POST /api/tenants/:tenantId/openapi/validate-pattern",
  async (t) => {
    await t.test("rejects invalid regex", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/validate-pattern`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pattern: "[invalid" }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.valid, false);
      t.equal(data.isValidRegex, false);
    });

    await t.test("returns no matches when no spec stored", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/validate-pattern`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pattern: "^/api/.*$" }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.valid, true);
      t.equal(data.hasSpec, false);
      t.same(data.matches, []);
    });

    await t.test("validates pattern against stored spec", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spec: OPENAPI_USPTO }),
      });

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/validate-pattern`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pattern: "^/.*$" }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.valid, true);
      t.equal(data.isValidRegex, true);
    });

    await t.test("returns matched paths from spec", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const testSpec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/api/users": { get: {} },
          "/api/posts": { get: {} },
          "/health": { get: {} },
        },
      };

      await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spec: testSpec }),
      });

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/validate-pattern`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pattern: "^/api/.*$" }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.matches.length, 2);
      t.ok(data.matches.includes("/api/users"));
      t.ok(data.matches.includes("/api/posts"));
    });

    await t.test("returns total spec paths count", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const testSpec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/api/users": { get: {} },
          "/api/posts": { get: {} },
          "/health": { get: {} },
        },
      };

      await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spec: testSpec }),
      });

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/validate-pattern`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pattern: "^/nomatch$" }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.matches.length, 0);
      t.equal(data.totalSpecPaths, 3);
    });
  },
);

await t.test(
  "POST /api/tenants/:tenantId/openapi/import - edge cases",
  async (t) => {
    await t.test("handles OpenAPI 3.1.0 spec", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const spec310 = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/api/v3/users": { get: {} },
        },
      };

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/import`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spec: spec310 }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.created, 1);
      t.ok(data.paths.created.includes("/api/v3/users"));
    });

    await t.test("handles paths with trailing slashes", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const specWithTrailingSlash = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/api/users/": { get: {} },
          "/api/posts/": { get: {} },
        },
      };

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/import`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spec: specWithTrailingSlash }),
        },
      );
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.created, 2);
      t.ok(data.paths.created.includes("/api/users/"));
    });

    await t.test(
      "re-import creates new paths (existing endpoints persist)",
      async (t) => {
        const user = await createUser("member@example.com");
        const org = await createOrg("Team", "team");
        await addMember(user.id, org.id);
        const tenant = await createTenant(org.id, "my-tenant");

        const firstSpec = {
          openapi: "3.0.0",
          info: { title: "Test", version: "1.0.0" },
          paths: {
            "/api/v1/users": { get: {} },
            "/api/v1/posts": { get: {} },
          },
        };

        await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spec: firstSpec }),
        });

        // Re-import with different paths - these are added, not replacing
        const secondSpec = {
          openapi: "3.0.0",
          info: { title: "Test", version: "2.0.0" },
          paths: {
            "/api/v2/users": { get: {} },
            "/api/v2/comments": { get: {} },
          },
        };

        const res = await app.request(
          `/api/tenants/${tenant.id}/openapi/import`,
          {
            method: "POST",
            headers: {
              Cookie: `auth_token=${user.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ spec: secondSpec }),
          },
        );

        t.equal(res.status, 200);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        // Should create 2 new paths
        t.equal(data.created, 2);
        t.ok(data.paths.created.includes("/api/v2/users"));
        t.ok(data.paths.created.includes("/api/v2/comments"));
      },
    );

    await t.test("handles spec with many paths efficiently", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      // Create spec with many unique paths
      const paths: Record<string, object> = {};
      for (let i = 0; i < 50; i++) {
        paths[`/api/resource${i}`] = { get: {} };
      }

      const spec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths,
      };

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/import`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spec }),
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.created, 50);
    });
  },
);

await t.test(
  "POST /api/tenants/:tenantId/openapi/validate-pattern - edge cases",
  async (t) => {
    await t.test("rejects empty pattern string", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request(
        `/api/tenants/${tenant.id}/openapi/validate-pattern`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pattern: "" }),
        },
      );
      t.equal(res.status, 400);
    });

    await t.test(
      "handles tenant with no spec imported gracefully",
      async (t) => {
        const user = await createUser("member@example.com");
        const org = await createOrg("Team", "team");
        await addMember(user.id, org.id);
        const tenant = await createTenant(org.id, "my-tenant");

        // No spec imported - should return hasSpec: false
        const res = await app.request(
          `/api/tenants/${tenant.id}/openapi/validate-pattern`,
          {
            method: "POST",
            headers: {
              Cookie: `auth_token=${user.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ pattern: "^/api/.*$" }),
          },
        );
        t.equal(res.status, 200);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        t.equal(data.hasSpec, false);
        t.equal(data.matches.length, 0);
      },
    );
  },
);

await t.test("OpenAPI spec auto-sync with endpoint mutations", async (t) => {
  await t.test(
    "import spec then add manual endpoint preserves imported spec structure",
    async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      // Import the USPTO spec
      const importRes = await app.request(
        `/api/tenants/${tenant.id}/openapi/import`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spec: OPENAPI_USPTO }),
        },
      );
      t.equal(importRes.status, 200);

      // Manually add an endpoint (simulating the endpoint route sync)
      const { syncOpenApiSpec } = await import("../lib/openapi-sync.js");
      await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path: "/health",
          path_pattern: "/health",
          priority: 100,
          is_active: true,
          description: "Health check",
        })
        .execute();

      await syncOpenApiSpec(tenant.id);

      // Verify spec via GET /spec
      const specRes = await app.request(
        `/api/tenants/${tenant.id}/openapi/spec`,
        {
          headers: { Cookie: `auth_token=${user.token}` },
        },
      );
      t.equal(specRes.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const specData = (await specRes.json()) as any;
      t.equal(specData.hasSpec, true);

      const spec = specData.spec;
      // Original info preserved
      t.equal(spec.info.title, "USPTO Data Set API");
      t.equal(spec.info.version, "1.0.0");
      // Original servers preserved
      t.ok(spec.servers);
      t.equal(spec.servers.length, 1);
      // Original components preserved
      t.ok(spec.components);
      // Imported paths preserved (with lineage endpoints still active)
      t.ok(
        spec.paths["/{dataset}/{version}/fields"] ||
          spec.paths["/{dataset}/{version}/records"],
      );
      // Manual endpoint included
      t.ok(spec.paths["/health"]);
    },
  );

  await t.test(
    "import spec then delete imported endpoint removes path from spec",
    async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      // Import spec
      await app.request(`/api/tenants/${tenant.id}/openapi/import`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spec: OPENAPI_USPTO }),
      });

      // Get all endpoints to find one to delete
      const endpoints = await db
        .selectFrom("endpoints")
        .selectAll()
        .where("tenant_id", "=", tenant.id)
        .where("is_active", "=", true)
        .execute();

      // Find the fields endpoint
      const fieldsEndpoint = endpoints.find(
        (e) =>
          (e.openapi_source_paths as string[] | null)?.[0] ===
          "/{dataset}/{version}/fields",
      );
      if (!fieldsEndpoint) {
        t.fail("expected fieldsEndpoint");
        return;
      }

      // Soft-delete it
      await db
        .updateTable("endpoints")
        .set({ is_active: false, deleted_at: new Date() })
        .where("id", "=", fieldsEndpoint.id)
        .execute();

      const { syncOpenApiSpec } = await import("../lib/openapi-sync.js");
      await syncOpenApiSpec(tenant.id);

      const tenantRow = await db
        .selectFrom("tenants")
        .select(["openapi_spec"])
        .where("id", "=", tenant.id)
        .executeTakeFirst();

      if (!tenantRow) {
        t.fail("expected tenantRow");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = tenantRow.openapi_spec as any;
      t.notOk(spec.paths["/{dataset}/{version}/fields"]);
      // Other path should still exist
      t.ok(spec.paths["/{dataset}/{version}/records"]);
    },
  );

  await t.test(
    "import spec, add manual endpoint, remove it - spec returns to imported paths only",
    async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      // Import spec
      const importRes = await app.request(
        `/api/tenants/${tenant.id}/openapi/import`,
        {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spec: OPENAPI_USPTO }),
        },
      );
      t.equal(importRes.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const importData = (await importRes.json()) as any;
      const importedCount = importData.created + importData.linked;

      // Add manual endpoint
      const { syncOpenApiSpec } = await import("../lib/openapi-sync.js");
      const manual = await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path: "/health",
          path_pattern: "/health",
          priority: 100,
          is_active: true,
          description: "Health check",
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await syncOpenApiSpec(tenant.id);

      // Verify manual endpoint is in spec
      let tenantRow = await db
        .selectFrom("tenants")
        .select(["openapi_spec"])
        .where("id", "=", tenant.id)
        .executeTakeFirst();
      if (!tenantRow) {
        t.fail("expected tenantRow");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let spec = tenantRow.openapi_spec as any;
      t.ok(spec.paths["/health"], "manual endpoint present after add");
      const pathCountWithManual = Object.keys(spec.paths).length;
      t.equal(pathCountWithManual, importedCount + 1);

      // Remove the manual endpoint
      await db
        .updateTable("endpoints")
        .set({ is_active: false, deleted_at: new Date() })
        .where("id", "=", manual.id)
        .execute();

      await syncOpenApiSpec(tenant.id);

      // Verify spec reverts to imported-only
      tenantRow = await db
        .selectFrom("tenants")
        .select(["openapi_spec"])
        .where("id", "=", tenant.id)
        .executeTakeFirst();
      if (!tenantRow) {
        t.fail("expected tenantRow after remove");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spec = tenantRow.openapi_spec as any;
      t.notOk(spec.paths["/health"], "manual endpoint gone after remove");
      t.equal(Object.keys(spec.paths).length, importedCount);
      // Original imported paths still intact
      t.ok(spec.paths["/{dataset}/{version}/fields"]);
      t.ok(spec.paths["/{dataset}/{version}/records"]);
      // Original spec metadata preserved
      t.equal(spec.info.title, "USPTO Data Set API");
      t.ok(spec.servers);
      t.ok(spec.components);
    },
  );
});
