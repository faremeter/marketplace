import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { internalRoutes } from "./internal.js";

const app = new Hono();
app.route("/internal", internalRoutes);

await setupTestSchema();

async function createOrg(name: string, slug: string) {
  return db
    .insertInto("organizations")
    .values({ name, slug })
    .returning(["id"])
    .executeTakeFirstOrThrow();
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
    .returning(["id", "name"])
    .executeTakeFirstOrThrow();
}

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("POST /internal/transactions", async (t) => {
  await t.test("rejects invalid JSON", async (t) => {
    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid }",
    });
    t.equal(res.status, 400);
  });

  await t.test("rejects missing required fields", async (t) => {
    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    t.equal(res.status, 400);
  });

  await t.test("returns 404 for unknown tenant", async (t) => {
    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: "nonexistent-tenant",
        ngx_request_id: "req-123",
        amount_usdc: 0,
        request_path: "/test",
      }),
    });
    t.equal(res.status, 404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Tenant not found");
  });

  await t.test("rejects paid transaction without tx_hash", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-456",
        amount_usdc: 0.05,
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("tx_hash"));
  });

  await t.test("rejects paid transaction without network", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-789",
        amount_usdc: 0.05,
        tx_hash: "abc123",
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("network"));
  });

  await t.test("accepts free transaction (amount_usdc=0)", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-free-001",
        amount_usdc: 0,
        request_path: "/api/free",
      }),
    });
    // 400 = validation failed, anything else = validation passed (500 = queue unavailable in tests)
    t.not(res.status, 400, "validation should pass for free transaction");
  });

  await t.test(
    "accepts paid transaction with tx_hash and network",
    async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-paid-001",
          amount_usdc: 0.05,
          tx_hash: "abc123def456",
          network: "solana",
          request_path: "/api/paid",
        }),
      });
      t.not(res.status, 400, "validation should pass with tx_hash and network");
    },
  );

  await t.test("accepts transaction with optional endpoint_id", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-endpoint-001",
        amount_usdc: 0,
        request_path: "/api/test",
        endpoint_id: 123,
      }),
    });
    t.not(res.status, 400, "validation should pass with endpoint_id");
  });

  await t.test("rejects empty tx_hash with amount > 0", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-empty-hash",
        amount_usdc: 0.05,
        tx_hash: "",
        network: "solana",
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
  });

  await t.test("rejects negative amount_usdc", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-negative",
        amount_usdc: -0.05,
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
  });

  await t.test("rejects empty string ngx_request_id", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "",
        amount_usdc: 0,
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
  });

  await t.test("rejects empty string tenant_name", async (t) => {
    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: "",
        ngx_request_id: "req-empty-tenant",
        amount_usdc: 0,
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
  });

  await t.test("rejects empty string request_path", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-empty-path",
        amount_usdc: 0,
        request_path: "",
      }),
    });
    t.equal(res.status, 400);
  });

  await t.test("accepts null endpoint_id explicitly", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-null-endpoint",
        amount_usdc: 0,
        request_path: "/api/test",
        endpoint_id: null,
      }),
    });
    t.not(res.status, 400, "validation should pass with null endpoint_id");
  });

  await t.test(
    "accessible without authentication (internal network only)",
    async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      // No auth cookie - should still work
      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-no-auth",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 200);
    },
  );

  await t.test("accepts endpoint_id of 0", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-zero-endpoint",
        amount_usdc: 0,
        request_path: "/api/test",
        endpoint_id: 0,
      }),
    });
    // 0 is a valid integer, validation should pass
    t.not(res.status, 400);
  });

  await t.test(
    "accepts negative endpoint_id (schema allows any number)",
    async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-neg-endpoint",
          amount_usdc: 0,
          request_path: "/api/test",
          endpoint_id: -1,
        }),
      });
      // Schema accepts any number for endpoint_id, validation passes
      t.not(res.status, 400);
    },
  );

  await t.test("accepts very small amount_usdc", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-small-amount",
        amount_usdc: 0.000001,
        tx_hash: "tiny-hash",
        network: "solana",
        request_path: "/api/test",
      }),
    });
    // Validation should pass for small decimals
    t.not(res.status, 400);
  });

  await t.test("accepts large amount_usdc", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-large-amount",
        amount_usdc: 999999.99,
        tx_hash: "large-hash",
        network: "solana",
        request_path: "/api/test",
      }),
    });
    t.not(res.status, 400);
  });

  await t.test("accepts ngx_request_id with special characters", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-abc_123-def.456",
        amount_usdc: 0,
        request_path: "/api/test",
      }),
    });
    t.not(res.status, 400);
  });

  await t.test("tenant name lookup is case-sensitive", async (t) => {
    const org = await createOrg("Team", "team");
    await createTenant(org.id, "my-tenant");

    // Try with different case
    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: "MY-TENANT",
        ngx_request_id: "req-case-test",
        amount_usdc: 0,
        request_path: "/api/test",
      }),
    });
    // Tenant not found due to case mismatch
    t.equal(res.status, 404);
  });
});
