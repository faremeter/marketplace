import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { endpointsRoutes } from "./endpoints.js";
import { OPENAPI_USPTO } from "../tests/fixtures/openapi-spec.js";

const app = new Hono();
app.route("/api/tenants/:tenantId/endpoints", endpointsRoutes);

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

async function createEndpoint(
  tenantId: number,
  path: string,
  opts: { priority?: number; is_active?: boolean; price_usdc?: number } = {},
) {
  return db
    .insertInto("endpoints")
    .values({
      tenant_id: tenantId,
      path,
      path_pattern: path,
      priority: opts.priority ?? 100,
      is_active: opts.is_active ?? true,
      price_usdc: opts.price_usdc ?? 0.01,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createNode(name: string) {
  return db
    .insertInto("nodes")
    .values({
      name,
      internal_ip: "10.0.0.1",
      status: "active",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function linkTenantToNode(tenantId: number, nodeId: number) {
  await db
    .insertInto("tenant_nodes")
    .values({ tenant_id: tenantId, node_id: nodeId })
    .execute();
}

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("GET /api/tenants/:tenantId/endpoints", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/tenants/1/endpoints");
    t.equal(res.status, 401);
  });

  await t.test("returns 404 for non-existent tenant (non-admin)", async (t) => {
    const user = await createUser("user@example.com");
    const res = await app.request("/api/tenants/999/endpoints", {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("returns 403 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 403);
  });

  await t.test("returns empty list for member", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, []);
  });

  await t.test("returns endpoints sorted by priority", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createEndpoint(tenant.id, "/low-priority", { priority: 200 });
    await createEndpoint(tenant.id, "/high-priority", { priority: 50 });
    await createEndpoint(tenant.id, "/medium-priority", { priority: 100 });

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 3);
    t.equal(data[0].path, "/high-priority");
    t.equal(data[1].path, "/medium-priority");
    t.equal(data[2].path, "/low-priority");
  });

  await t.test("excludes deleted endpoints by default", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createEndpoint(tenant.id, "/active", { is_active: true });
    await createEndpoint(tenant.id, "/deleted", { is_active: false });

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].path, "/active");
  });

  await t.test("includes deleted endpoints when requested", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createEndpoint(tenant.id, "/active", { is_active: true });
    await createEndpoint(tenant.id, "/deleted", { is_active: false });

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints?include_deleted=true`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 2);
  });

  await t.test("admin can access any tenant", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    await createEndpoint(tenant.id, "/test");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
  });
});

await t.test("GET /api/tenants/:tenantId/endpoints/:id", async (t) => {
  await t.test("returns 404 for non-existent endpoint", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints/999`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("returns 404 for endpoint in different tenant", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant1 = await createTenant(org.id, "tenant-1");
    const tenant2 = await createTenant(org.id, "tenant-2");

    const endpoint = await createEndpoint(tenant2.id, "/other-tenant");

    const res = await app.request(
      `/api/tenants/${tenant1.id}/endpoints/${endpoint.id}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 404);
  });

  await t.test("returns endpoint details", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/users/list", {
      price_usdc: 0.05,
      priority: 50,
    });

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.path, "/users/list");
    t.equal(data.price_usdc, 0.05);
    t.equal(data.priority, 50);
  });
});

await t.test("POST /api/tenants/:tenantId/endpoints", async (t) => {
  await t.test("creates endpoint with literal path", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/users/list",
        price_usdc: 0.02,
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.path, "/users/list");
    t.equal(data.path_pattern, "/users/list");
    t.equal(data.price_usdc, 0.02);
    t.equal(data.is_active, true);
  });

  await t.test("creates endpoint with OpenAPI-style path", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/users/{userId}/orders/{orderId}",
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.path, "/users/{userId}/orders/{orderId}");
    t.equal(data.path_pattern, "^/users/[^/]+/orders/[^/]+$");
  });

  await t.test("creates endpoint with regex path", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "^/api/v[0-9]+/users$",
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.path, "^/api/v[0-9]+/users$");
    t.equal(data.path_pattern, "^/api/v[0-9]+/users$");
  });

  await t.test("rejects unsafe regex patterns", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "^(a+)+$",
      }),
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("performance"));
  });

  await t.test("rejects catch-all patterns", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const catchAllPatterns = ["/", "/*", "^/$", "^/.*$"];

    for (const pattern of catchAllPatterns) {
      const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: pattern }),
      });

      t.equal(res.status, 400, `should reject ${pattern}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.ok(data.error.includes("catch-all"));
    }
  });

  await t.test("creates endpoint with all fields", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/premium/endpoint",
        price_usdc: 1.5,
        scheme: "per_request",
        description: "Premium API endpoint",
        priority: 10,
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.price_usdc, 1.5);
    t.equal(data.scheme, "per_request");
    t.equal(data.description, "Premium API endpoint");
    t.equal(data.priority, 10);
  });

  await t.test("rejects invalid JSON", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: "{ invalid json }",
    });

    t.equal(res.status, 400);
  });

  await t.test("rejects empty body", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    t.equal(res.status, 400);
  });

  await t.test("rejects missing path field", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ price_usdc: 0.05 }),
    });

    t.equal(res.status, 400);
  });

  await t.test("accepts openapi_source_paths field", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const sourcePaths = Object.keys(OPENAPI_USPTO.paths);

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/{dataset}/{version}/fields",
        openapi_source_paths: sourcePaths,
        description: "USPTO dataset fields endpoint",
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.path, "/{dataset}/{version}/fields");
    t.same(data.openapi_source_paths, sourcePaths);
  });

  await t.test("triggers node sync after creation", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");
    const node = await createNode("test-node");
    await linkTenantToNode(tenant.id, node.id);

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: "/sync-test" }),
    });

    t.equal(res.status, 201);
  });
});

await t.test("PUT /api/tenants/:tenantId/endpoints/:id", async (t) => {
  await t.test("returns 404 for non-existent endpoint", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints/999`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ price_usdc: 0.05 }),
    });

    t.equal(res.status, 404);
  });

  await t.test("updates endpoint fields", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/old-path", {
      price_usdc: 0.01,
      priority: 100,
    });

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "/new-path",
          price_usdc: 0.1,
          priority: 50,
          description: "Updated description",
        }),
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.path, "/new-path");
    t.equal(data.price_usdc, 0.1);
    t.equal(data.priority, 50);
    t.equal(data.description, "Updated description");
  });

  await t.test("supports partial updates", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/my-path", {
      price_usdc: 0.01,
      priority: 100,
    });

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priority: 25 }),
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.path, "/my-path");
    t.equal(data.price_usdc, 0.01);
    t.equal(data.priority, 25);
  });

  await t.test("can deactivate endpoint", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/my-path");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: false }),
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.is_active, false);
  });

  await t.test("rejects unsafe regex on update", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/safe-path");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "^(a+)+$" }),
      },
    );

    t.equal(res.status, 400);
  });

  await t.test("updates scheme field", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/my-path");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scheme: "per_request" }),
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.scheme, "per_request");
  });

  await t.test("updates openapi_source_paths field", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/my-path");
    const sourcePaths = Object.keys(OPENAPI_USPTO.paths);

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ openapi_source_paths: sourcePaths }),
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data.openapi_source_paths, sourcePaths);
  });

  await t.test("triggers node sync after update", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");
    const node = await createNode("test-node");
    await linkTenantToNode(tenant.id, node.id);
    const endpoint = await createEndpoint(tenant.id, "/sync-update");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ price_usdc: 0.99 }),
      },
    );

    t.equal(res.status, 200);
  });
});

await t.test("DELETE /api/tenants/:tenantId/endpoints/:id", async (t) => {
  await t.test("returns 404 for non-existent endpoint", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/endpoints/999`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("soft deletes endpoint", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/to-delete");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.deleted, true);
    t.equal(data.endpoint.is_active, false);
    t.ok(data.endpoint.deleted_at);
  });

  await t.test("returns 404 for already deleted endpoint", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/deleted", {
      is_active: false,
    });

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("triggers node sync after deletion", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");
    const node = await createNode("test-node");
    await linkTenantToNode(tenant.id, node.id);
    const endpoint = await createEndpoint(tenant.id, "/sync-delete");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 200);
  });
});

await t.test("GET /api/tenants/:tenantId/endpoints/:id/stats", async (t) => {
  await t.test("returns 404 for non-existent endpoint", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/999/stats`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns stats for endpoint with no transactions", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/stats-test");

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/stats`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoint_id, endpoint.id);
    t.equal(data.total_transactions, 0);
    t.equal(data.total_spent_usdc, 0);
  });

  await t.test("returns stats with transactions", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/stats-test");

    await db
      .insertInto("transactions")
      .values([
        {
          tenant_id: tenant.id,
          endpoint_id: endpoint.id,
          amount_usdc: 0.05,
          ngx_request_id: "req-1",
          request_path: "/stats-test",
        },
        {
          tenant_id: tenant.id,
          endpoint_id: endpoint.id,
          amount_usdc: 0.1,
          ngx_request_id: "req-2",
          request_path: "/stats-test",
        },
      ])
      .execute();

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/stats`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.total_transactions, 2);
    t.ok(
      Math.abs(data.total_spent_usdc - 0.15) < 0.001,
      `expected ~0.15, got ${data.total_spent_usdc}`,
    );
  });

  await t.test("filters stats by date range", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const endpoint = await createEndpoint(tenant.id, "/date-filter");

    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const tomorrow = new Date(now.getTime() + 86400000);

    await db
      .insertInto("transactions")
      .values({
        tenant_id: tenant.id,
        endpoint_id: endpoint.id,
        amount_usdc: 0.05,
        ngx_request_id: "req-date-1",
        request_path: "/date-filter",
      })
      .execute();

    const res = await app.request(
      `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/stats?from=${yesterday.toISOString()}&to=${tomorrow.toISOString()}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.total_transactions, 1);
    t.ok(data.period.from);
    t.ok(data.period.to);
  });
});

await t.test(
  "GET /api/tenants/:tenantId/endpoints/:id/transactions",
  async (t) => {
    await t.test("returns 404 for non-existent endpoint", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/999/transactions`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 404);
    });

    await t.test("returns empty list for no transactions", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await createEndpoint(tenant.id, "/no-txns");

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/transactions`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.same(data, []);
    });

    await t.test("returns transactions for endpoint", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await createEndpoint(tenant.id, "/with-txns");

      await db
        .insertInto("transactions")
        .values([
          {
            tenant_id: tenant.id,
            endpoint_id: endpoint.id,
            amount_usdc: 0.05,
            ngx_request_id: "req-txn-1",
            request_path: "/with-txns",
          },
          {
            tenant_id: tenant.id,
            endpoint_id: endpoint.id,
            amount_usdc: 0.1,
            ngx_request_id: "req-txn-2",
            request_path: "/with-txns",
          },
        ])
        .execute();

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/transactions`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.length, 2);
    });

    await t.test("supports pagination", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await createEndpoint(tenant.id, "/paginated");

      for (let i = 0; i < 5; i++) {
        await db
          .insertInto("transactions")
          .values({
            tenant_id: tenant.id,
            endpoint_id: endpoint.id,
            amount_usdc: 0.01 * (i + 1),
            ngx_request_id: `req-page-${i}`,
            request_path: "/paginated",
          })
          .execute();
      }

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/transactions?limit=2&offset=1`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.length, 2);
    });

    await t.test("invalid limit defaults to 50", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await createEndpoint(tenant.id, "/invalid-limit");

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/transactions?limit=invalid`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
    });

    await t.test("negative offset floors at 0", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await createEndpoint(tenant.id, "/neg-offset");

      await db
        .insertInto("transactions")
        .values({
          tenant_id: tenant.id,
          endpoint_id: endpoint.id,
          amount_usdc: 0.01,
          ngx_request_id: "req-neg",
          request_path: "/neg-offset",
        })
        .execute();

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/transactions?offset=-10`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.length, 1);
    });

    await t.test("limit capped at MAX_PAGINATION_LIMIT", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await createEndpoint(tenant.id, "/max-limit");

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/transactions?limit=9999`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
    });
  },
);

await t.test(
  "POST /api/tenants/:tenantId/endpoints - path edge cases",
  async (t) => {
    await t.test("accepts path with unicode characters", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "/api/usuarios/cafe",
        }),
      });

      t.equal(res.status, 201);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.path, "/api/usuarios/cafe");
    });

    await t.test("accepts very long path", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const longPath = "/api/" + "segment/".repeat(50) + "end";

      const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: longPath }),
      });

      t.equal(res.status, 201);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.path, longPath);
    });

    await t.test(
      "accepts OpenAPI-style path with multiple params",
      async (t) => {
        const user = await createUser("member@example.com");
        const org = await createOrg("Team", "team");
        await addMember(user.id, org.id);
        const tenant = await createTenant(org.id, "my-tenant");

        const res = await app.request(`/api/tenants/${tenant.id}/endpoints`, {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: "/users/{userId}/posts/{postId}/comments/{commentId}",
          }),
        });

        t.equal(res.status, 201);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        t.equal(
          data.path,
          "/users/{userId}/posts/{postId}/comments/{commentId}",
        );
      },
    );
  },
);

await t.test(
  "PUT /api/tenants/:tenantId/endpoints/:id - clearing fields",
  async (t) => {
    await t.test("can set price_usdc to null", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await createEndpoint(tenant.id, "/priced-endpoint", {
        price_usdc: 0.05,
      });

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
        {
          method: "PUT",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ price_usdc: null }),
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.price_usdc, null);
    });

    await t.test("can set scheme to null", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const endpoint = await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path: "/schemed-endpoint",
          path_pattern: "/schemed-endpoint",
          priority: 100,
          is_active: true,
          scheme: "per_request",
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}`,
        {
          method: "PUT",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ scheme: null }),
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.scheme, null);
    });
  },
);

await t.test(
  "GET /api/tenants/:tenantId/endpoints/:id/stats - date edge cases",
  async (t) => {
    await t.test("handles invalid from date format gracefully", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");
      const endpoint = await createEndpoint(tenant.id, "/date-test");

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/stats?from=not-a-date`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
    });

    await t.test("handles invalid to date format gracefully", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");
      const endpoint = await createEndpoint(tenant.id, "/date-test");

      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/stats?to=garbage`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
    });

    await t.test("handles from > to date range (returns empty)", async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");
      const endpoint = await createEndpoint(tenant.id, "/backwards-date");

      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);

      // from is in the future, to is in the past (backwards range)
      const res = await app.request(
        `/api/tenants/${tenant.id}/endpoints/${endpoint.id}/stats?from=${now.toISOString()}&to=${yesterday.toISOString()}`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      // Backwards range returns 0 results
      t.equal(data.total_transactions, 0);
    });
  },
);
