import "../tests/setup/env.js";
import t from "tap";
import { type } from "arktype";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { nodesRoutes } from "./nodes.js";

const NodeResponse = type({
  "name?": "string",
  "internal_ip?": "string",
  "public_ip?": "string | null",
  "status?": "string",
  "deleted?": "boolean",
  "wireguard_public_key?": "string | null",
  "wireguard_address?": "string | null",
  "+": "delete",
});

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
      default_price: 0.01,
      default_scheme: "exact",
      is_active: opts.is_active ?? true,
      status: opts.status ?? "active",
      wallet_id: opts.wallet_id ?? null,
      org_slug: opts.org_slug ?? null,
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
    const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
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
      const data = NodeResponse.assert(await res.json());
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
      const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
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
    const data = NodeResponse.assert(await res.json());
    t.equal(data.status, "active");
  });
});
