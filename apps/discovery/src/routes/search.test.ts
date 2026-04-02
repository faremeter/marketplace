import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { searchRoutes, buildTsquery } from "./search.js";

const app = new Hono();
app.route("/api/v1/search", searchRoutes);

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
  tags?: string[];
}) {
  const tenant = await db
    .insertInto("tenants")
    .values({
      name: overrides.name ?? "Test Tenant",
      backend_url: "https://api.example.com",
      default_price: 0.01,
      default_scheme: "exact",
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
  overrides: {
    path_pattern?: string;
    description?: string;
    is_active?: boolean;
    deleted_at?: string | null;
    tags?: string[];
  },
) {
  const endpoint = await db
    .insertInto("endpoints")
    .values({
      tenant_id: tenantId,
      path_pattern: overrides.path_pattern ?? "/api/test",
      description: overrides.description ?? null,
      is_active: overrides.is_active ?? true,
      deleted_at: overrides.deleted_at ?? null,
      tags: overrides.tags ?? [],
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return endpoint;
}

await t.test("GET /api/v1/search", async (t) => {
  await t.test("returns empty arrays for empty query", async (t) => {
    const res = await app.request("/api/v1/search");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, { proxies: [], endpoints: [] });
  });

  await t.test("returns empty arrays for whitespace query", async (t) => {
    const res = await app.request("/api/v1/search?q=   ");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, { proxies: [], endpoints: [] });
  });

  await t.test("searches tenants by name", async (t) => {
    await createTenant({ name: "Weather API" });
    await createTenant({ name: "Stock Data" });

    const res = await app.request("/api/v1/search?q=weather");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "Weather API");
  });

  await t.test("includes url in proxy results", async (t) => {
    await createTenant({ name: "weather" });
    await createTenant({ name: "legiscan", org_slug: "acme" });

    const res = await app.request("/api/v1/search?q=weather");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies[0].url, "https://weather.api.example.test");

    const res2 = await app.request("/api/v1/search?q=legiscan");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data2 = (await res2.json()) as any;
    t.equal(data2.proxies[0].url, "https://legiscan.acme.api.example.test");
  });

  await t.test("searches tenants by org_slug", async (t) => {
    await createTenant({ name: "API 1", org_slug: "acme-corp" });
    await createTenant({ name: "API 2", org_slug: "other-org" });

    const res = await app.request("/api/v1/search?q=acme");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].org_slug, "acme-corp");
  });

  await t.test("searches tenants by openapi_spec content", async (t) => {
    await createTenant({
      name: "API with Spec",
      openapi_spec: JSON.stringify({ info: { title: "Unique Specification" } }),
    });
    await createTenant({ name: "API without Spec" });

    const res = await app.request("/api/v1/search?q=unique");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "API with Spec");
  });

  await t.test("searches endpoints by path_pattern", async (t) => {
    const tenant = await createTenant({ name: "Test API" });
    await createEndpoint(tenant.id, { path_pattern: "/users/{id}" });
    await createEndpoint(tenant.id, { path_pattern: "/products" });

    const res = await app.request("/api/v1/search?q=users");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoints.length, 1);
    t.equal(data.endpoints[0].path_pattern, "/users/{id}");
  });

  await t.test("searches endpoints by description", async (t) => {
    const tenant = await createTenant({ name: "Test API" });
    await createEndpoint(tenant.id, {
      path_pattern: "/api/v1",
      description: "Get user profile information",
    });
    await createEndpoint(tenant.id, {
      path_pattern: "/api/v2",
      description: "Create new product",
    });

    const res = await app.request("/api/v1/search?q=profile");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoints.length, 1);
    t.equal(data.endpoints[0].description, "Get user profile information");
  });

  await t.test("only returns active tenants (is_active=true)", async (t) => {
    await createTenant({ name: "Active API", is_active: true });
    await createTenant({ name: "Inactive API", is_active: false });

    const res = await app.request("/api/v1/search?q=api");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "Active API");
  });

  await t.test("only returns tenants with status=active", async (t) => {
    await createTenant({ name: "Active Status API", status: "active" });
    await createTenant({ name: "Pending Status API", status: "pending" });

    const res = await app.request("/api/v1/search?q=status");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "Active Status API");
  });

  await t.test("only returns active endpoints (is_active=true)", async (t) => {
    const tenant = await createTenant({ name: "Test" });
    await createEndpoint(tenant.id, {
      path_pattern: "/active/endpoint",
      is_active: true,
    });
    await createEndpoint(tenant.id, {
      path_pattern: "/inactive/endpoint",
      is_active: false,
    });

    const res = await app.request("/api/v1/search?q=endpoint");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoints.length, 1);
    t.equal(data.endpoints[0].path_pattern, "/active/endpoint");
  });

  await t.test("only returns non-deleted endpoints", async (t) => {
    const tenant = await createTenant({ name: "Test" });
    await createEndpoint(tenant.id, {
      path_pattern: "/existing/path",
      deleted_at: null,
    });
    await createEndpoint(tenant.id, {
      path_pattern: "/deleted/path",
      deleted_at: new Date().toISOString(),
    });

    const res = await app.request("/api/v1/search?q=path");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoints.length, 1);
    t.equal(data.endpoints[0].path_pattern, "/existing/path");
  });

  await t.test("limits tenant results to 20", async (t) => {
    for (let i = 0; i < 25; i++) {
      await createTenant({ name: `Limit Test API ${i}` });
    }

    const res = await app.request("/api/v1/search?q=limit");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 20);
  });

  await t.test("limits endpoint results to 50", async (t) => {
    const tenant = await createTenant({ name: "Test" });
    for (let i = 0; i < 55; i++) {
      await createEndpoint(tenant.id, { path_pattern: `/limit/endpoint/${i}` });
    }

    const res = await app.request("/api/v1/search?q=limit");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoints.length, 50);
  });

  await t.test("search is case-insensitive", async (t) => {
    await createTenant({ name: "Weather API" });

    const res = await app.request("/api/v1/search?q=WEATHER");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "Weather API");
  });

  await t.test("escapes SQL LIKE wildcards in search query", async (t) => {
    await createTenant({ name: "100% Complete API" });
    await createTenant({ name: "user_id API" });
    await createTenant({ name: "Normal API" });

    const res1 = await app.request("/api/v1/search?q=%25");
    t.equal(res1.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data1 = (await res1.json()) as any;
    t.equal(data1.proxies.length, 1);
    t.equal(data1.proxies[0].name, "100% Complete API");

    const res2 = await app.request("/api/v1/search?q=user_id");
    t.equal(res2.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data2 = (await res2.json()) as any;
    t.equal(data2.proxies.length, 1);
    t.equal(data2.proxies[0].name, "user_id API");
  });

  await t.test(
    "returns both matching tenants and endpoints in same query",
    async (t) => {
      await createTenant({ name: "Payment Gateway" });
      const otherTenant = await createTenant({ name: "Other API" });
      await createEndpoint(otherTenant.id, {
        path_pattern: "/payment/process",
        description: "Process payment",
      });

      const res = await app.request("/api/v1/search?q=payment");
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.proxies.length, 1);
      t.equal(data.proxies[0].name, "Payment Gateway");
      t.equal(data.endpoints.length, 1);
      t.equal(data.endpoints[0].path_pattern, "/payment/process");
    },
  );

  await t.test(
    "does not match tenant with null openapi_spec on spec search",
    async (t) => {
      await createTenant({ name: "API with null spec" });
      await createTenant({
        name: "API with spec",
        openapi_spec: JSON.stringify({ paths: { "/searchable": {} } }),
      });

      const res = await app.request("/api/v1/search?q=searchable");
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.proxies.length, 1);
      t.equal(data.proxies[0].name, "API with spec");
    },
  );

  await t.test("does not return endpoints from inactive tenants", async (t) => {
    const activeTenant = await createTenant({ name: "Active Tenant" });
    const inactiveTenant = await createTenant({
      name: "Inactive Tenant",
      is_active: false,
    });
    await createEndpoint(activeTenant.id, { path_pattern: "/shared/route" });
    await createEndpoint(inactiveTenant.id, { path_pattern: "/shared/route" });

    const res = await app.request("/api/v1/search?q=shared");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoints.length, 1);
    t.equal(data.endpoints[0].proxy_id, activeTenant.id);
  });

  await t.test(
    "does not return endpoints from tenants with non-active status",
    async (t) => {
      const activeTenant = await createTenant({
        name: "Active",
        status: "active",
      });
      const pendingTenant = await createTenant({
        name: "Pending",
        status: "pending",
      });
      await createEndpoint(activeTenant.id, { path_pattern: "/common/path" });
      await createEndpoint(pendingTenant.id, { path_pattern: "/common/path" });

      const res = await app.request("/api/v1/search?q=common");
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.endpoints.length, 1);
      t.equal(data.endpoints[0].proxy_id, activeTenant.id);
    },
  );

  await t.test("searches tenants by tag", async (t) => {
    await createTenant({ name: "Tagged API", tags: ["production", "finance"] });
    await createTenant({ name: "Other API", tags: ["staging"] });

    const res = await app.request("/api/v1/search?q=finance");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "Tagged API");
  });

  await t.test("searches endpoints by tag", async (t) => {
    const tenant = await createTenant({ name: "Test API" });
    await createEndpoint(tenant.id, {
      path_pattern: "/api/v1",
      tags: ["deprecated", "legacy"],
    });
    await createEndpoint(tenant.id, {
      path_pattern: "/api/v2",
      tags: ["stable"],
    });

    const res = await app.request("/api/v1/search?q=legacy");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.endpoints.length, 1);
    t.equal(data.endpoints[0].path_pattern, "/api/v1");
  });

  await t.test("returns tags in search results", async (t) => {
    await createTenant({
      name: "Unrelated Name",
      tags: ["xyzzy-unique-tag", "ml"],
    });
    const tenant = await createTenant({ name: "Other Tenant" });
    await createEndpoint(tenant.id, {
      path_pattern: "/some/path",
      tags: ["xyzzy-unique-tag", "experimental"],
    });

    const res = await app.request("/api/v1/search?q=xyzzy-unique-tag");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.same(data.proxies[0].tags, ["xyzzy-unique-tag", "ml"]);
    t.equal(data.endpoints.length, 1);
    t.same(data.endpoints[0].tags, ["xyzzy-unique-tag", "experimental"]);
  });

  await t.test("tag search is case-insensitive", async (t) => {
    await createTenant({ name: "Case API", tags: ["Production"] });
    const tenant = await createTenant({ name: "Other" });
    await createEndpoint(tenant.id, {
      path_pattern: "/case/path",
      tags: ["Staging"],
    });

    const res = await app.request("/api/v1/search?q=PRODUCTION");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "Case API");

    const res2 = await app.request("/api/v1/search?q=staging");
    t.equal(res2.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data2 = (await res2.json()) as any;
    t.equal(data2.endpoints.length, 1);
    t.equal(data2.endpoints[0].path_pattern, "/case/path");
  });

  await t.test("escapes backslash character in search query", async (t) => {
    await createTenant({ name: "Tenant with \\ backslash" });
    await createTenant({ name: "Normal Tenant" });

    const res = await app.request("/api/v1/search?q=\\");
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.proxies.length, 1);
    t.equal(data.proxies[0].name, "Tenant with \\ backslash");
  });
});

await t.test("buildTsquery", async (t) => {
  await t.test("single word gets prefix operator", async (t) => {
    t.equal(buildTsquery("weather"), "weather:*");
  });

  await t.test("multiple words joined with AND", async (t) => {
    t.equal(buildTsquery("weather api"), "weather:* & api:*");
  });

  await t.test("trims whitespace", async (t) => {
    t.equal(buildTsquery("  spaced  "), "spaced:*");
  });

  await t.test("treats special characters as word boundaries", async (t) => {
    t.equal(buildTsquery("special!@#$chars"), "special:* & chars:*");
  });

  await t.test("returns empty string for empty input", async (t) => {
    t.equal(buildTsquery(""), "");
  });

  await t.test("returns empty string for whitespace-only input", async (t) => {
    t.equal(buildTsquery("   "), "");
  });

  await t.test("replaces hyphens with spaces and splits", async (t) => {
    t.equal(buildTsquery("acme-corp"), "acme:* & corp:*");
  });

  await t.test("preserves underscores", async (t) => {
    t.equal(buildTsquery("user_id"), "user_id:*");
  });

  await t.test("handles mixed content", async (t) => {
    t.equal(buildTsquery("acme-corp api v2"), "acme:* & corp:* & api:* & v2:*");
  });

  await t.test("returns empty for special-characters-only input", async (t) => {
    t.equal(buildTsquery("!@#$%^&*()"), "");
  });

  await t.test("handles numeric-only input", async (t) => {
    t.equal(buildTsquery("123"), "123:*");
  });

  await t.test("handles single character input", async (t) => {
    t.equal(buildTsquery("a"), "a:*");
  });

  await t.test("preserves unicode letters", async (t) => {
    t.equal(buildTsquery("caf\u00e9"), "caf\u00e9:*");
    t.equal(buildTsquery("M\u00fcnchen"), "M\u00fcnchen:*");
  });

  await t.test("handles multiple consecutive hyphens", async (t) => {
    t.equal(buildTsquery("a--b"), "a:* & b:*");
  });

  await t.test("handles multiple consecutive spaces", async (t) => {
    t.equal(buildTsquery("hello     world"), "hello:* & world:*");
  });

  await t.test("splits slashes into separate words", async (t) => {
    t.equal(buildTsquery("/users/profile"), "users:* & profile:*");
  });

  await t.test("splits dots into separate words", async (t) => {
    t.equal(buildTsquery("v1.2"), "v1:* & 2:*");
  });

  await t.test("handles path pattern with mixed separators", async (t) => {
    t.equal(
      buildTsquery("/api/v2/users/{id}"),
      "api:* & v2:* & users:* & id:*",
    );
  });
});

await t.test("GET /api/v1/search with special-char-only query", async (t) => {
  await t.test(
    "returns empty results for query with only special characters",
    async (t) => {
      await createTenant({ name: "Some API" });

      const res = await app.request("/api/v1/search?q=!@%23$");
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.proxies.length, 0);
      t.equal(data.endpoints.length, 0);
    },
  );
});
