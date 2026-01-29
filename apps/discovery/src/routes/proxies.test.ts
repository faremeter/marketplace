import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { proxiesRoutes } from "./proxies.js";

const app = new Hono();
app.route("/api/v1/proxies", proxiesRoutes);

await setupTestSchema();

t.beforeEach(async () => {
  await clearTestData();
});

async function createTenant(overrides: {
  name?: string;
  org_slug?: string;
  is_active?: boolean;
  status?: string;
  openapi_spec?: string;
  backend_url?: string;
  default_price_usdc?: number;
  default_scheme?: string;
  tags?: string[];
}) {
  const tenant = await db
    .insertInto("tenants")
    .values({
      name: overrides.name ?? "Test Tenant",
      backend_url: overrides.backend_url ?? "https://api.example.com",
      default_price_usdc: overrides.default_price_usdc ?? 0.01,
      default_scheme: overrides.default_scheme ?? "per_request",
      is_active: overrides.is_active ?? true,
      status: overrides.status ?? "active",
      org_slug: overrides.org_slug ?? null,
      openapi_spec: overrides.openapi_spec ?? null,
      tags: overrides.tags ?? [],
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return tenant;
}

async function createEndpoint(
  tenantId: number,
  overrides?: {
    path_pattern?: string;
    is_active?: boolean;
    deleted_at?: string;
  },
) {
  const endpoint = await db
    .insertInto("endpoints")
    .values({
      tenant_id: tenantId,
      path_pattern: overrides?.path_pattern ?? "/api/test",
      is_active: overrides?.is_active ?? true,
      deleted_at: overrides?.deleted_at ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return endpoint;
}

await t.test("GET /api/v1/proxies", async (t) => {
  await t.test("returns empty list when no proxies", async (t) => {
    const res = await app.request("/api/v1/proxies");
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: unknown[];
      pagination: { hasMore: boolean };
    };
    t.equal(data.data.length, 0);
    t.equal(data.pagination.hasMore, false);
  });

  await t.test("returns paginated list of active proxies", async (t) => {
    await createTenant({ name: "API 1" });
    await createTenant({ name: "API 2" });
    await createTenant({ name: "API 3", is_active: false });
    await createTenant({ name: "API 4", status: "pending" });

    const res = await app.request("/api/v1/proxies");
    t.equal(res.status, 200);
    const data = (await res.json()) as { data: { name: string }[] };
    t.equal(data.data.length, 2);
  });

  await t.test("default limit is 20", async (t) => {
    for (let i = 0; i < 25; i++) {
      await createTenant({ name: `API ${i}` });
    }

    const res = await app.request("/api/v1/proxies");
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: unknown[];
      pagination: { hasMore: boolean };
    };
    t.equal(data.data.length, 20);
    t.equal(data.pagination.hasMore, true);
  });

  await t.test("respects custom limit", async (t) => {
    for (let i = 0; i < 10; i++) {
      await createTenant({ name: `API ${i}` });
    }

    const res = await app.request("/api/v1/proxies?limit=5");
    t.equal(res.status, 200);
    const data = (await res.json()) as { data: unknown[] };
    t.equal(data.data.length, 5);
  });

  await t.test("max limit is 100", async (t) => {
    for (let i = 0; i < 105; i++) {
      await createTenant({ name: `API ${i}` });
    }

    const res = await app.request("/api/v1/proxies?limit=200");
    t.equal(res.status, 200);
    const data = (await res.json()) as { data: unknown[] };
    t.equal(data.data.length, 100);
  });

  await t.test("cursor pagination works correctly", async (t) => {
    for (let i = 0; i < 5; i++) {
      await createTenant({ name: `API ${i}` });
    }

    const res1 = await app.request("/api/v1/proxies?limit=2");
    t.equal(res1.status, 200);
    const data1 = (await res1.json()) as {
      data: { id: number }[];
      pagination: { nextCursor: string; hasMore: boolean };
    };
    t.equal(data1.data.length, 2);
    t.equal(data1.pagination.hasMore, true);
    t.ok(data1.pagination.nextCursor);

    const res2 = await app.request(
      `/api/v1/proxies?limit=2&cursor=${data1.pagination.nextCursor}`,
    );
    t.equal(res2.status, 200);
    const data2 = (await res2.json()) as {
      data: { id: number }[];
      pagination: { hasMore: boolean };
    };
    t.equal(data2.data.length, 2);
    const secondPageFirst = data2.data[0];
    const firstPageLast = data1.data[1];
    t.ok(
      secondPageFirst && firstPageLast && secondPageFirst.id > firstPageLast.id,
    );
  });

  await t.test("returns hasMore: false on last page", async (t) => {
    for (let i = 0; i < 3; i++) {
      await createTenant({ name: `API ${i}` });
    }

    const res = await app.request("/api/v1/proxies?limit=5");
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      pagination: { hasMore: boolean; nextCursor: string | null };
    };
    t.equal(data.pagination.hasMore, false);
    t.equal(data.pagination.nextCursor, null);
  });

  await t.test("returns correct fields", async (t) => {
    await createTenant({
      name: "Test API",
      org_slug: "test-org",
      backend_url: "https://backend.example.com",
      default_price_usdc: 0.05,
      default_scheme: "per_byte",
    });

    const res = await app.request("/api/v1/proxies");
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: {
        id: number;
        name: string;
        org_slug: string;
        backend_url: string;
        default_price_usdc: number;
        default_scheme: string;
      }[];
    };
    t.equal(data.data.length, 1);
    const proxy = data.data[0];
    if (!proxy) throw new Error("Expected proxy");
    t.ok(proxy.id);
    t.equal(proxy.name, "Test API");
    t.equal(proxy.org_slug, "test-org");
    t.equal(proxy.backend_url, "https://backend.example.com");
    t.equal(proxy.default_price_usdc, 0.05);
    t.equal(proxy.default_scheme, "per_byte");
  });

  await t.test("returns tags in proxy list", async (t) => {
    await createTenant({
      name: "Tagged API",
      tags: ["production", "finance"],
    });

    const res = await app.request("/api/v1/proxies");
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: { name: string; tags: string[] }[];
    };
    t.equal(data.data.length, 1);
    t.same(data.data[0].tags, ["production", "finance"]);
  });

  await t.test("handles negative cursor gracefully", async (t) => {
    await createTenant({ name: "API 1" });
    await createTenant({ name: "API 2" });

    const res = await app.request("/api/v1/proxies?cursor=-5");
    t.equal(res.status, 200);
    const data = (await res.json()) as { data: unknown[] };
    t.equal(data.data.length, 2);
  });

  await t.test("handles invalid cursor gracefully", async (t) => {
    await createTenant({ name: "API 1" });

    const res = await app.request("/api/v1/proxies?cursor=notanumber");
    t.equal(res.status, 200);
    const data = (await res.json()) as { data: unknown[] };
    t.equal(data.data.length, 1);
  });

  await t.test("cursor=0 returns all results", async (t) => {
    await createTenant({ name: "API 1" });
    await createTenant({ name: "API 2" });

    const res = await app.request("/api/v1/proxies?cursor=0");
    t.equal(res.status, 200);
    const data = (await res.json()) as { data: unknown[] };
    t.equal(data.data.length, 2);
  });

  await t.test("cursor beyond last ID returns empty list", async (t) => {
    await createTenant({ name: "API 1" });
    await createTenant({ name: "API 2" });
    await createTenant({ name: "API 3" });

    const res = await app.request("/api/v1/proxies?cursor=999999");
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: unknown[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    };
    t.equal(data.data.length, 0);
    t.equal(data.pagination.hasMore, false);
    t.equal(data.pagination.nextCursor, null);
  });
});

await t.test("GET /api/v1/proxies/:id", async (t) => {
  await t.test("returns proxy details with endpoint count", async (t) => {
    const tenant = await createTenant({ name: "Detailed API" });
    await createEndpoint(tenant.id);
    await createEndpoint(tenant.id);
    await createEndpoint(tenant.id, { is_active: false });
    await createEndpoint(tenant.id, { deleted_at: new Date().toISOString() });

    const res = await app.request(`/api/v1/proxies/${tenant.id}`);
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: { name: string; endpoint_count: number };
    };
    t.equal(data.data.name, "Detailed API");
    t.equal(data.data.endpoint_count, 2);
  });

  await t.test("returns tags in proxy detail", async (t) => {
    const tenant = await createTenant({
      name: "Tagged Detail API",
      tags: ["staging", "ml"],
    });

    const res = await app.request(`/api/v1/proxies/${tenant.id}`);
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: { name: string; tags: string[] };
    };
    t.equal(data.data.name, "Tagged Detail API");
    t.same(data.data.tags, ["staging", "ml"]);
  });

  await t.test("returns 404 for non-existent proxy", async (t) => {
    const res = await app.request("/api/v1/proxies/99999");
    t.equal(res.status, 404);
    const data = (await res.json()) as { error: string };
    t.equal(data.error, "Proxy not found");
  });

  await t.test("returns 404 for inactive proxy", async (t) => {
    const tenant = await createTenant({ name: "Inactive", is_active: false });

    const res = await app.request(`/api/v1/proxies/${tenant.id}`);
    t.equal(res.status, 404);
  });

  await t.test("returns 404 for non-active status proxy", async (t) => {
    const tenant = await createTenant({ name: "Pending", status: "pending" });

    const res = await app.request(`/api/v1/proxies/${tenant.id}`);
    t.equal(res.status, 404);
  });

  await t.test("returns 400 for invalid ID", async (t) => {
    const res = await app.request("/api/v1/proxies/invalid");
    t.equal(res.status, 400);
    const data = (await res.json()) as { error: string };
    t.equal(data.error, "Invalid proxy ID");
  });

  await t.test(
    "returns endpoint_count of 0 for tenant with no endpoints",
    async (t) => {
      const tenant = await createTenant({ name: "Empty API" });

      const res = await app.request(`/api/v1/proxies/${tenant.id}`);
      t.equal(res.status, 200);
      const data = (await res.json()) as {
        data: { endpoint_count: number };
      };
      t.equal(data.data.endpoint_count, 0);
    },
  );
});

await t.test("GET /api/v1/proxies/:id/openapi", async (t) => {
  await t.test("returns openapi_spec when present", async (t) => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0" },
    };
    const tenant = await createTenant({
      name: "API with Spec",
      openapi_spec: JSON.stringify(spec),
    });

    const res = await app.request(`/api/v1/proxies/${tenant.id}/openapi`);
    t.equal(res.status, 200);
    const data = (await res.json()) as {
      data: { id: number; name: string; spec: typeof spec };
    };
    t.equal(data.data.id, tenant.id);
    t.equal(data.data.name, "API with Spec");
    t.same(data.data.spec, spec);
  });

  await t.test("returns 404 when no spec", async (t) => {
    const tenant = await createTenant({ name: "API without Spec" });

    const res = await app.request(`/api/v1/proxies/${tenant.id}/openapi`);
    t.equal(res.status, 404);
    const data = (await res.json()) as { error: string };
    t.equal(data.error, "No OpenAPI spec available");
  });

  await t.test("returns 404 for non-existent proxy", async (t) => {
    const res = await app.request("/api/v1/proxies/99999/openapi");
    t.equal(res.status, 404);
    const data = (await res.json()) as { error: string };
    t.equal(data.error, "Proxy not found");
  });

  await t.test("returns 400 for invalid ID", async (t) => {
    const res = await app.request("/api/v1/proxies/abc/openapi");
    t.equal(res.status, 400);
  });
});
