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

async function createTenant(
  orgId: number,
  name: string,
  org_slug: string | null = null,
) {
  return db
    .insertInto("tenants")
    .values({
      name,
      organization_id: orgId,
      backend_url: "http://backend.example.com",
      default_price_usdc: 0.01,
      default_scheme: "exact",
      org_slug,
    })
    .returning(["id", "name"])
    .executeTakeFirstOrThrow();
}

async function createEndpoint(tenantId: number, path: string) {
  return db
    .insertInto("endpoints")
    .values({
      tenant_id: tenantId,
      path,
      path_pattern: path,
      price_usdc: 0.01,
      scheme: "exact",
    })
    .returning(["id"])
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

  await t.test("accepts transaction with valid endpoint_id", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");
    const endpoint = await createEndpoint(tenant.id, "/api/test");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-endpoint-001",
        amount_usdc: 0,
        request_path: "/api/test",
        endpoint_id: endpoint.id,
      }),
    });
    t.not(res.status, 400, "validation should pass with valid endpoint_id");
  });

  await t.test(
    "rejects endpoint_id that does not belong to tenant",
    async (t) => {
      const org = await createOrg("Team", "team");
      const tenant1 = await createTenant(org.id, "tenant-one");
      const tenant2 = await createTenant(org.id, "tenant-two");
      const endpoint = await createEndpoint(tenant2.id, "/api/other");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant1.name,
          ngx_request_id: "req-wrong-endpoint",
          amount_usdc: 0,
          request_path: "/api/test",
          endpoint_id: endpoint.id,
        }),
      });
      t.equal(res.status, 400, "should reject endpoint from different tenant");
    },
  );

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

  await t.test("rejects non-existent endpoint_id", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-nonexistent-endpoint",
        amount_usdc: 0,
        request_path: "/api/test",
        endpoint_id: 999999,
      }),
    });
    t.equal(res.status, 400, "should reject non-existent endpoint_id");
  });

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

  await t.test(
    "finds org_slug format tenant with org_slug parameter",
    async (t) => {
      const org = await createOrg("Acme Corp", "acme");
      await createTenant(org.id, "my-api", "acme");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "my-api",
          org_slug: "acme",
          ngx_request_id: "req-org-slug-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 200);
    },
  );

  await t.test(
    "returns 404 when org_slug provided but tenant is legacy format",
    async (t) => {
      const org = await createOrg("Team", "team");
      await createTenant(org.id, "legacy-api");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "legacy-api",
          org_slug: "team",
          ngx_request_id: "req-mismatch-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 404);
    },
  );

  await t.test(
    "returns 404 when org_slug missing but tenant is org_slug format",
    async (t) => {
      const org = await createOrg("Team", "team");
      await createTenant(org.id, "org-only-api", "team");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "org-only-api",
          ngx_request_id: "req-no-slug-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 404);
    },
  );

  await t.test(
    "same tenant name in different orgs with org_slug format",
    async (t) => {
      const org1 = await createOrg("Org One", "org-one");
      const org2 = await createOrg("Org Two", "org-two");
      await createTenant(org1.id, "shared-name", "org-one");
      await createTenant(org2.id, "shared-name", "org-two");

      const res1 = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "shared-name",
          org_slug: "org-one",
          ngx_request_id: "req-org1-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res1.status, 200);

      const res2 = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "shared-name",
          org_slug: "org-two",
          ngx_request_id: "req-org2-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res2.status, 200);
    },
  );

  await t.test(
    "returns 404 when org_slug doesn't match any organization",
    async (t) => {
      const org = await createOrg("Real Org", "real-org");
      await createTenant(org.id, "my-api", "real-org");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "my-api",
          org_slug: "nonexistent-org",
          ngx_request_id: "req-bad-org-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 404);
    },
  );

  await t.test("org_slug lookup is case-sensitive", async (t) => {
    const org = await createOrg("Acme", "acme");
    await createTenant(org.id, "my-api", "acme");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: "my-api",
        org_slug: "ACME",
        ngx_request_id: "req-case-slug-001",
        amount_usdc: 0,
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 404);
  });

  await t.test(
    "handles tenant with org but legacy format (no org_slug in request)",
    async (t) => {
      const org = await createOrg("Team", "team");
      await createTenant(org.id, "legacy-with-org");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "legacy-with-org",
          ngx_request_id: "req-legacy-org-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 200);
    },
  );

  await t.test(
    "isolates legacy and org_slug tenants with same name",
    async (t) => {
      const org1 = await createOrg("Org One", "org-one");
      const org2 = await createOrg("Org Two", "org-two");

      // Legacy tenant (no org association for lookup purposes)
      await createTenant(org1.id, "api");
      // org_slug tenant with same name
      await createTenant(org2.id, "api", "org-two");

      // Legacy lookup should find legacy tenant
      const resLegacy = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "api",
          ngx_request_id: "req-isolate-legacy-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(resLegacy.status, 200);

      // org_slug lookup should find org_slug tenant
      const resOrgSlug = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: "api",
          org_slug: "org-two",
          ngx_request_id: "req-isolate-org-001",
          amount_usdc: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(resOrgSlug.status, 200);
    },
  );
});
