import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { sql } from "kysely";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { transactionsRoutes } from "./transactions.js";

const app = new Hono();
app.route("/api/tenants/:tenantId/transactions", transactionsRoutes);

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

async function createTransaction(
  tenantId: number,
  opts: { amount_usdc?: number; request_path?: string } = {},
) {
  return db
    .insertInto("transactions")
    .values({
      tenant_id: tenantId,
      amount_usdc: opts.amount_usdc ?? 0.01,
      ngx_request_id: `req-${Date.now()}-${Math.random()}`,
      request_path: opts.request_path ?? "/test",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("GET /api/tenants/:tenantId/transactions", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/tenants/1/transactions");
    t.equal(res.status, 401);
  });

  await t.test("returns 404 for non-existent tenant", async (t) => {
    const user = await createUser("user@example.com");
    const res = await app.request("/api/tenants/999/transactions", {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("returns 403 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(`/api/tenants/${tenant.id}/transactions`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 403);
  });

  await t.test(
    "returns empty list for member with no transactions",
    async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request(`/api/tenants/${tenant.id}/transactions`, {
        headers: { Cookie: `auth_token=${user.token}` },
      });
      t.equal(res.status, 200);
      const data = (await res.json()) as unknown[];
      t.same(data, []);
    },
  );

  await t.test("returns transactions for tenant", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id, { amount_usdc: 0.05 });
    await createTransaction(tenant.id, { amount_usdc: 0.1 });

    const res = await app.request(`/api/tenants/${tenant.id}/transactions`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 2);
  });

  await t.test("supports pagination", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    for (let i = 0; i < 5; i++) {
      await createTransaction(tenant.id);
    }

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?limit=2&offset=1`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 2);
  });

  await t.test("handles invalid pagination gracefully", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?limit=invalid&offset=-5`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
  });

  await t.test("returns transactions ordered by created_at desc", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    // Use raw SQL to insert with explicit timestamps for testing ordering
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 60000).toISOString();

    await sql`
      INSERT INTO transactions (tenant_id, amount_usdc, ngx_request_id, request_path, created_at)
      VALUES (${tenant.id}, 0.01, 'req-old', '/test', ${earlier})
    `.execute(db);

    await sql`
      INSERT INTO transactions (tenant_id, amount_usdc, ngx_request_id, request_path, created_at)
      VALUES (${tenant.id}, 0.99, 'req-new', '/test', ${now})
    `.execute(db);

    const res = await app.request(`/api/tenants/${tenant.id}/transactions`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    t.equal(data[0].amount_usdc, 0.99);
    t.equal(data[1].amount_usdc, 0.01);
  });

  await t.test("returns empty when date range excludes all", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const pastDate = new Date(Date.now() - 86400000 * 10).toISOString();
    const pastDate2 = new Date(Date.now() - 86400000 * 9).toISOString();

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?from=${pastDate}&to=${pastDate2}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 0);
  });

  await t.test("filters by date range", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const yesterday = new Date(Date.now() - 86400000);
    const tomorrow = new Date(Date.now() + 86400000);

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?from=${yesterday.toISOString()}&to=${tomorrow.toISOString()}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 1);
  });

  await t.test("admin can access any tenant", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const res = await app.request(`/api/tenants/${tenant.id}/transactions`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 1);
  });
});

await t.test("handles non-numeric tenantId gracefully", async (t) => {
  const user = await createUser("member@example.com");

  const res = await app.request("/api/tenants/invalid/transactions", {
    headers: { Cookie: `auth_token=${user.token}` },
  });
  // parseInt("invalid") returns NaN (falsy), middleware returns 400
  t.equal(res.status, 400);
});

await t.test("date filtering edge cases", async (t) => {
  await t.test("handles only 'from' parameter without 'to'", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?from=${yesterday}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 1);
  });

  await t.test("handles only 'to' parameter without 'from'", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const tomorrow = new Date(Date.now() + 86400000).toISOString();

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?to=${tomorrow}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 1);
  });

  await t.test(
    "returns empty for backwards date range (from > to)",
    async (t) => {
      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id);
      const tenant = await createTenant(org.id, "my-tenant");

      await createTransaction(tenant.id);

      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString();

      // from > to (backwards range)
      const res = await app.request(
        `/api/tenants/${tenant.id}/transactions?from=${tomorrow}&to=${yesterday}`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );
      t.equal(res.status, 200);
      const data = (await res.json()) as unknown[];
      t.equal(data.length, 0);
    },
  );

  await t.test("handles invalid date format in from gracefully", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?from=not-a-date`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
  });

  await t.test("handles invalid date format in to gracefully", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?to=invalid`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
  });
});

await t.test("pagination edge cases", async (t) => {
  await t.test("returns empty when offset beyond total", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?offset=100`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    t.equal(data.length, 0);
  });

  await t.test("handles zero limit", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?limit=0`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    const data = (await res.json()) as unknown[];
    // Zero limit should use default or return empty
    t.ok(Array.isArray(data));
  });

  await t.test("handles negative offset gracefully", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    await createTransaction(tenant.id);

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions?offset=-1`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    // Should handle gracefully (treat as 0)
    const data = (await res.json()) as unknown[];
    t.ok(Array.isArray(data));
  });
});

await t.test("GET /api/tenants/:tenantId/transactions/:id", async (t) => {
  await t.test("returns 404 for non-existent transaction", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions/999`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 404);
  });

  await t.test("returns 404 for transaction in different tenant", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant1 = await createTenant(org.id, "tenant-1");
    const tenant2 = await createTenant(org.id, "tenant-2");

    const txn = await createTransaction(tenant2.id);

    const res = await app.request(
      `/api/tenants/${tenant1.id}/transactions/${txn.id}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 404);
  });

  await t.test("returns transaction details", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id);
    const tenant = await createTenant(org.id, "my-tenant");

    const txn = await createTransaction(tenant.id, {
      amount_usdc: 0.25,
      request_path: "/api/users",
    });

    const res = await app.request(
      `/api/tenants/${tenant.id}/transactions/${txn.id}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.amount_usdc, 0.25);
    t.equal(data.request_path, "/api/users");
  });
});
