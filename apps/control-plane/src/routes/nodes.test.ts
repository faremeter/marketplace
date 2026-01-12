import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { nodesRoutes } from "./nodes.js";

const app = new Hono();
app.route("/api/admin/nodes", nodesRoutes);

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

async function createNode(
  name: string,
  opts: { internal_ip?: string; status?: string } = {},
) {
  return db
    .insertInto("nodes")
    .values({
      name,
      internal_ip: opts.internal_ip ?? "10.0.0.1",
      status: opts.status ?? "active",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createOrg(name: string, slug: string) {
  return db
    .insertInto("organizations")
    .values({ name, slug })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createTenant(
  orgId: number,
  name: string,
  opts: {
    is_active?: boolean;
    status?: string;
    wallet_id?: number;
    org_slug?: string | null;
  } = {},
) {
  return db
    .insertInto("tenants")
    .values({
      name,
      organization_id: orgId,
      backend_url: "http://backend.example.com",
      default_price_usdc: 0.01,
      default_scheme: "exact",
      is_active: opts.is_active ?? true,
      status: opts.status ?? "active",
      wallet_id: opts.wallet_id ?? null,
      org_slug: opts.org_slug ?? null,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createWallet(orgId: number, name: string, funded = true) {
  return db
    .insertInto("wallets")
    .values({
      name,
      organization_id: orgId,
      funding_status: funded ? "funded" : "pending",
      wallet_config: JSON.stringify({ solana: { address: "abc123" } }),
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

await t.test("GET /api/admin/nodes", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/admin/nodes");
    t.equal(res.status, 401);
  });

  await t.test("returns 403 for non-admin", async (t) => {
    const user = await createUser("user@example.com", false);
    const res = await app.request("/api/admin/nodes", {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 403);
  });

  await t.test("returns empty list for admin", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.same(data, []);
  });

  await t.test("returns list of nodes", async (t) => {
    const admin = await createUser("admin@example.com", true);
    await createNode("node-1");
    await createNode("node-2");

    const res = await app.request("/api/admin/nodes", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 2);
  });
});

await t.test("GET /api/admin/nodes/:id", async (t) => {
  await t.test("returns 404 for non-existent node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes/999", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("returns node details", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node", { internal_ip: "10.0.0.5" });

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "test-node");
    t.equal(data.internal_ip, "10.0.0.5");
  });
});

await t.test("POST /api/admin/nodes", async (t) => {
  await t.test("returns 403 for non-admin", async (t) => {
    const user = await createUser("user@example.com", false);
    const res = await app.request("/api/admin/nodes", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "new-node", internal_ip: "10.0.0.10" }),
    });
    t.equal(res.status, 403);
  });

  await t.test("creates node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "new-node",
        internal_ip: "10.0.0.10",
        public_ip: "1.2.3.4",
        status: "active",
      }),
    });
    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "new-node");
    t.equal(data.internal_ip, "10.0.0.10");
    t.equal(data.public_ip, "1.2.3.4");
  });

  await t.test("rejects missing required fields", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "incomplete" }),
    });
    t.equal(res.status, 400);
  });
});

await t.test("GET /api/admin/nodes/:id/tenants", async (t) => {
  await t.test("returns 404 for non-existent node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes/999/tenants", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("returns empty list when no tenants assigned", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");

    const res = await app.request(`/api/admin/nodes/${node.id}/tenants`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.same(data, []);
  });

  await t.test("returns tenants assigned to node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");
    await linkTenantToNode(tenant.id, node.id);

    const res = await app.request(`/api/admin/nodes/${node.id}/tenants`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 1);
  });

  await t.test("excludes inactive tenants", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const activeTenant = await createTenant(org.id, "active-tenant");
    const inactiveTenant = await createTenant(org.id, "inactive-tenant", {
      is_active: false,
    });
    await linkTenantToNode(activeTenant.id, node.id);
    await linkTenantToNode(inactiveTenant.id, node.id);

    const res = await app.request(`/api/admin/nodes/${node.id}/tenants`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 1);
  });
});

await t.test("GET /api/admin/nodes/:id/sync", async (t) => {
  await t.test("returns 404 for non-existent node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes/999/sync", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("returns sync config for node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");

    const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.node_id, node.id);
    t.equal(data.node_name, "test-node");
    t.ok("config" in data);
  });

  await t.test(
    "includes tenant with funded wallet and endpoints",
    async (t) => {
      const admin = await createUser("admin@example.com", true);
      const node = await createNode("test-node");
      const org = await createOrg("Team", "team");
      const wallet = await createWallet(org.id, "funded-wallet", true);
      const tenant = await createTenant(org.id, "my-tenant", {
        wallet_id: wallet.id,
        status: "active",
        is_active: true,
      });
      await linkTenantToNode(tenant.id, node.id);

      await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path: "/api/users",
          path_pattern: "^/api/users$",
          priority: 1,
          is_active: true,
        })
        .execute();

      const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
        headers: { Cookie: `auth_token=${admin.token}` },
      });
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 1);
      t.ok(data.config["my-tenant.api.corbits.dev"]);
      t.equal(data.config["my-tenant.api.corbits.dev"].endpoints.length, 1);
    },
  );

  await t.test("excludes tenant with unfunded wallet", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "unfunded-wallet", false);
    const tenant = await createTenant(org.id, "unfunded-tenant", {
      wallet_id: wallet.id,
      status: "active",
      is_active: true,
    });
    await linkTenantToNode(tenant.id, node.id);

    const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.tenant_count, 0);
  });

  await t.test("excludes tenant with non-active status", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);
    const tenant = await createTenant(org.id, "pending-tenant", {
      wallet_id: wallet.id,
      status: "pending",
      is_active: true,
    });
    await linkTenantToNode(tenant.id, node.id);

    const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.tenant_count, 0);
  });

  await t.test("excludes inactive endpoints from sync config", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);
    const tenant = await createTenant(org.id, "my-tenant", {
      wallet_id: wallet.id,
      status: "active",
      is_active: true,
    });
    await linkTenantToNode(tenant.id, node.id);

    await db
      .insertInto("endpoints")
      .values([
        {
          tenant_id: tenant.id,
          path: "/api/active",
          path_pattern: "^/api/active$",
          priority: 1,
          is_active: true,
        },
        {
          tenant_id: tenant.id,
          path: "/api/inactive",
          path_pattern: "^/api/inactive$",
          priority: 2,
          is_active: false,
        },
      ])
      .execute();

    const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.config["my-tenant.api.corbits.dev"].endpoints.length, 1);
    t.equal(
      data.config["my-tenant.api.corbits.dev"].endpoints[0].path_pattern,
      "^/api/active$",
    );
  });

  await t.test("sync config has complete tenant structure", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "configured-tenant",
        organization_id: org.id,
        backend_url: "http://backend.example.com",
        default_price_usdc: 0.05,
        default_scheme: "exact",
        is_active: true,
        status: "active",
        wallet_id: wallet.id,
        upstream_auth_header: "Authorization",
        upstream_auth_value: "Bearer secret123",
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await linkTenantToNode(tenant.id, node.id);

    await db
      .insertInto("endpoints")
      .values({
        tenant_id: tenant.id,
        path: "/api/test",
        path_pattern: "^/api/test$",
        priority: 10,
        price_usdc: 0.1,
        scheme: "prepay",
        is_active: true,
      })
      .execute();

    const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;

    const tenantConfig = data.config["configured-tenant.api.corbits.dev"];
    t.ok(tenantConfig, "tenant config exists");
    t.equal(tenantConfig.backend_url, "http://backend.example.com");
    t.equal(tenantConfig.default_price_usdc, 0.05);
    t.equal(tenantConfig.default_scheme, "exact");
    t.equal(tenantConfig.upstream_auth_header, "Authorization");
    t.equal(tenantConfig.upstream_auth_value, "Bearer secret123");
    t.ok(tenantConfig.wallet_config, "wallet_config present");

    t.equal(tenantConfig.endpoints.length, 1);
    const endpoint = tenantConfig.endpoints[0];
    t.ok(endpoint.id, "endpoint has id");
    t.equal(endpoint.path_pattern, "^/api/test$");
    t.equal(endpoint.price_usdc, 0.1);
    t.equal(endpoint.scheme, "prepay");
    t.equal(endpoint.priority, 10);
  });

  await t.test("endpoints ordered by priority ascending in sync", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);
    const tenant = await createTenant(org.id, "my-tenant", {
      wallet_id: wallet.id,
      status: "active",
      is_active: true,
    });
    await linkTenantToNode(tenant.id, node.id);

    await db
      .insertInto("endpoints")
      .values([
        {
          tenant_id: tenant.id,
          path: "/low-priority",
          path_pattern: "^/low$",
          priority: 100,
          is_active: true,
        },
        {
          tenant_id: tenant.id,
          path: "/high-priority",
          path_pattern: "^/high$",
          priority: 1,
          is_active: true,
        },
        {
          tenant_id: tenant.id,
          path: "/medium-priority",
          path_pattern: "^/medium$",
          priority: 50,
          is_active: true,
        },
      ])
      .execute();

    const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const endpoints = data.config["my-tenant.api.corbits.dev"].endpoints;
    t.equal(endpoints.length, 3);
    t.equal(endpoints[0].priority, 1);
    t.equal(endpoints[1].priority, 50);
    t.equal(endpoints[2].priority, 100);
  });

  await t.test("handles non-numeric node id", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes/invalid/sync", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test(
    "sync config uses correct domain for org_slug format tenant",
    async (t) => {
      const admin = await createUser("admin@example.com", true);
      const node = await createNode("test-node");
      const org = await createOrg("Acme Corp", "acme");
      const wallet = await createWallet(org.id, "wallet", true);
      const tenant = await createTenant(org.id, "my-api", {
        wallet_id: wallet.id,
        status: "active",
        is_active: true,
        org_slug: "acme",
      });
      await linkTenantToNode(tenant.id, node.id);

      const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
        headers: { Cookie: `auth_token=${admin.token}` },
      });
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 1);
      t.ok(data.config["my-api.acme.api.corbits.dev"]);
      t.notOk(data.config["my-api.api.corbits.dev"]);
    },
  );

  await t.test(
    "sync config includes name, proxy_name, domain, org_slug for legacy tenant",
    async (t) => {
      const admin = await createUser("admin@example.com", true);
      const node = await createNode("test-node");
      const org = await createOrg("Team", "team");
      const wallet = await createWallet(org.id, "wallet", true);
      const tenant = await createTenant(org.id, "legacy-api", {
        wallet_id: wallet.id,
        status: "active",
        is_active: true,
        org_slug: null,
      });
      await linkTenantToNode(tenant.id, node.id);

      const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
        headers: { Cookie: `auth_token=${admin.token}` },
      });
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      const tenantConfig = data.config["legacy-api.api.corbits.dev"];
      t.ok(tenantConfig, "tenant config exists");
      t.equal(tenantConfig.name, "legacy-api");
      t.equal(tenantConfig.proxy_name, "legacy-api");
      t.equal(tenantConfig.domain, "legacy-api.api.corbits.dev");
      t.equal(tenantConfig.org_slug, null);
    },
  );

  await t.test(
    "sync config includes name, proxy_name, domain, org_slug for org_slug tenant",
    async (t) => {
      const admin = await createUser("admin@example.com", true);
      const node = await createNode("test-node");
      const org = await createOrg("Acme Corp", "acme");
      const wallet = await createWallet(org.id, "wallet", true);
      const tenant = await createTenant(org.id, "org-api", {
        wallet_id: wallet.id,
        status: "active",
        is_active: true,
        org_slug: "acme",
      });
      await linkTenantToNode(tenant.id, node.id);

      const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
        headers: { Cookie: `auth_token=${admin.token}` },
      });
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      const tenantConfig = data.config["org-api.acme.api.corbits.dev"];
      t.ok(tenantConfig, "tenant config exists");
      t.equal(tenantConfig.name, "org-api");
      t.equal(tenantConfig.proxy_name, "org-api");
      t.equal(tenantConfig.domain, "org-api.acme.api.corbits.dev");
      t.equal(tenantConfig.org_slug, "acme");
    },
  );

  await t.test(
    "multiple tenants with different formats on same node",
    async (t) => {
      const admin = await createUser("admin@example.com", true);
      const node = await createNode("test-node");
      const org1 = await createOrg("Org One", "org-one");
      const org2 = await createOrg("Org Two", "org-two");
      const wallet1 = await createWallet(org1.id, "wallet1", true);
      const wallet2 = await createWallet(org2.id, "wallet2", true);

      const legacyTenant = await createTenant(org1.id, "legacy-svc", {
        wallet_id: wallet1.id,
        status: "active",
        is_active: true,
        org_slug: null,
      });
      const orgSlugTenant = await createTenant(org2.id, "org-svc", {
        wallet_id: wallet2.id,
        status: "active",
        is_active: true,
        org_slug: "org-two",
      });

      await linkTenantToNode(legacyTenant.id, node.id);
      await linkTenantToNode(orgSlugTenant.id, node.id);

      const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
        headers: { Cookie: `auth_token=${admin.token}` },
      });
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 2);

      // Legacy tenant uses simple domain
      t.ok(data.config["legacy-svc.api.corbits.dev"]);
      t.equal(data.config["legacy-svc.api.corbits.dev"].org_slug, null);

      // org_slug tenant uses org-qualified domain
      t.ok(data.config["org-svc.org-two.api.corbits.dev"]);
      t.equal(
        data.config["org-svc.org-two.api.corbits.dev"].org_slug,
        "org-two",
      );
    },
  );

  await t.test(
    "same tenant name in different orgs with org_slug format",
    async (t) => {
      const admin = await createUser("admin@example.com", true);
      const node = await createNode("test-node");
      const org1 = await createOrg("Org One", "org-one");
      const org2 = await createOrg("Org Two", "org-two");
      const wallet1 = await createWallet(org1.id, "wallet1", true);
      const wallet2 = await createWallet(org2.id, "wallet2", true);

      const tenant1 = await createTenant(org1.id, "api", {
        wallet_id: wallet1.id,
        status: "active",
        is_active: true,
        org_slug: "org-one",
      });
      const tenant2 = await createTenant(org2.id, "api", {
        wallet_id: wallet2.id,
        status: "active",
        is_active: true,
        org_slug: "org-two",
      });

      await linkTenantToNode(tenant1.id, node.id);
      await linkTenantToNode(tenant2.id, node.id);

      const res = await app.request(`/api/admin/nodes/${node.id}/sync`, {
        headers: { Cookie: `auth_token=${admin.token}` },
      });
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 2);

      // Both have same name but different domains
      t.ok(data.config["api.org-one.api.corbits.dev"]);
      t.ok(data.config["api.org-two.api.corbits.dev"]);
      t.equal(data.config["api.org-one.api.corbits.dev"].org_slug, "org-one");
      t.equal(data.config["api.org-two.api.corbits.dev"].org_slug, "org-two");
    },
  );
});

await t.test("PUT /api/admin/nodes/:id", async (t) => {
  await t.test("returns 404 for non-existent node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes/999", {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "updated" }),
    });
    t.equal(res.status, 404);
  });

  await t.test("updates node name", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("old-name");

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "new-name" }),
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "new-name");
  });

  await t.test("updates node IP", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node", { internal_ip: "10.0.0.1" });

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ internal_ip: "10.0.0.99" }),
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.internal_ip, "10.0.0.99");
  });

  await t.test("updates node status to inactive", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("test-node", { status: "active" });

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "inactive" }),
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.status, "inactive");
  });
});

await t.test("DELETE /api/admin/nodes/:id", async (t) => {
  await t.test("returns 404 for non-existent node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const res = await app.request("/api/admin/nodes/999", {
      method: "DELETE",
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("deletes node", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("to-delete");

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.deleted, true);
  });

  await t.test("deletes node with tenant associations", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const node = await createNode("node-with-tenant");
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");
    await linkTenantToNode(tenant.id, node.id);

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.deleted, true);
  });
});

await t.test(
  "POST /api/admin/nodes - wireguard field edge cases",
  async (t) => {
    await t.test("creates node without wireguard fields", async (t) => {
      const admin = await createUser("admin@example.com", true);

      const res = await app.request("/api/admin/nodes", {
        method: "POST",
        headers: {
          Cookie: `auth_token=${admin.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "no-wg-node",
          internal_ip: "10.0.0.50",
          status: "inactive",
        }),
      });
      t.equal(res.status, 201);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.name, "no-wg-node");
      t.equal(data.wireguard_public_key, null);
      t.equal(data.wireguard_address, null);
    });

    await t.test("creates node with wireguard fields", async (t) => {
      const admin = await createUser("admin@example.com", true);

      const res = await app.request("/api/admin/nodes", {
        method: "POST",
        headers: {
          Cookie: `auth_token=${admin.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "wg-node",
          internal_ip: "10.0.0.51",
          status: "active",
          wireguard_public_key: "abc123pubkey",
          wireguard_address: "10.11.0.50",
        }),
      });
      t.equal(res.status, 201);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.wireguard_public_key, "abc123pubkey");
      t.equal(data.wireguard_address, "10.11.0.50");
    });
  },
);

await t.test("PUT /api/admin/nodes/:id - status transitions", async (t) => {
  await t.test("can change status from active to inactive", async (t) => {
    const admin = await createUser("admin@example.com", true);

    const node = await db
      .insertInto("nodes")
      .values({
        name: "status-test-node",
        internal_ip: "10.0.0.99",
        status: "active",
      })
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    t.equal(node.status, "active");

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "inactive" }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.status, "inactive");
  });

  await t.test("can change status from inactive to active", async (t) => {
    const admin = await createUser("admin@example.com", true);

    const node = await db
      .insertInto("nodes")
      .values({
        name: "inactive-node",
        internal_ip: "10.0.0.100",
        status: "inactive",
      })
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/admin/nodes/${node.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "active" }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.status, "active");
  });
});
