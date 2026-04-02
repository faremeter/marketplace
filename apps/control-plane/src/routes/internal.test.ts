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

async function createTenant(
  orgId: number,
  name: string,
  org_slug: string | null = null,
  opts: {
    is_active?: boolean;
    status?: string;
    wallet_id?: number;
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
      org_slug,
      is_active: opts.is_active ?? true,
      status: opts.status ?? "active",
      wallet_id: opts.wallet_id ?? null,
    })
    .returning(["id", "name"])
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

async function createEndpoint(tenantId: number, path: string) {
  return db
    .insertInto("endpoints")
    .values({
      tenant_id: tenantId,
      path,
      path_pattern: path,
      price: 0.01,
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
        amount: 0,
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
        amount: 0.05,
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
        amount: 0.05,
        tx_hash: "abc123",
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("network"));
  });

  await t.test("accepts free transaction (amount=0)", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-free-001",
        amount: 0,
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
          amount: 0.05,
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
        amount: 0,
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
          amount: 0,
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
        amount: 0.05,
        tx_hash: "",
        network: "solana",
        request_path: "/api/test",
      }),
    });
    t.equal(res.status, 400);
  });

  await t.test("rejects negative amount", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-negative",
        amount: -0.05,
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
        amount: 0,
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
        amount: 0,
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
        amount: 0,
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
        amount: 0,
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
          amount: 0,
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
        amount: 0,
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
        amount: 0,
        request_path: "/api/test",
        endpoint_id: 999999,
      }),
    });
    t.equal(res.status, 400, "should reject non-existent endpoint_id");
  });

  await t.test("accepts very small amount", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-small-amount",
        amount: 0.000001,
        tx_hash: "tiny-hash",
        network: "solana",
        request_path: "/api/test",
      }),
    });
    // Validation should pass for small decimals
    t.not(res.status, 400);
  });

  await t.test("accepts large amount", async (t) => {
    const org = await createOrg("Team", "team");
    const tenant = await createTenant(org.id, "my-tenant");

    const res = await app.request("/internal/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_name: tenant.name,
        ngx_request_id: "req-large-amount",
        amount: 999999.99,
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
        amount: 0,
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
        amount: 0,
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
          amount: 0,
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
          amount: 0,
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
          amount: 0,
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
          amount: 0,
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
          amount: 0,
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
          amount: 0,
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
        amount: 0,
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
          amount: 0,
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
          amount: 0,
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
          amount: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(resOrgSlug.status, 200);
    },
  );

  // Tests for new metadata fields: client_ip, request_method, metadata

  await t.test("client_ip field validation", async (t) => {
    await t.test("accepts valid IPv4 address", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-ipv4-001",
          amount: 0,
          request_path: "/api/test",
          client_ip: "192.168.1.100",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts valid IPv6 address", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-ipv6-001",
          amount: 0,
          request_path: "/api/test",
          client_ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts shortened IPv6 address", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-ipv6-short-001",
          amount: 0,
          request_path: "/api/test",
          client_ip: "::1",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts null client_ip", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-ip-null-001",
          amount: 0,
          request_path: "/api/test",
          client_ip: null,
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts omitted client_ip", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-ip-omit-001",
          amount: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("rejects client_ip exceeding max length", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-ip-long-001",
          amount: 0,
          request_path: "/api/test",
          client_ip: "a".repeat(50),
        }),
      });
      t.equal(res.status, 400);
    });
  });

  await t.test("request_method field validation", async (t) => {
    await t.test("accepts GET method", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-method-get-001",
          amount: 0,
          request_path: "/api/test",
          request_method: "GET",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts POST method", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-method-post-001",
          amount: 0,
          request_path: "/api/test",
          request_method: "POST",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts DELETE method", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-method-delete-001",
          amount: 0,
          request_path: "/api/test",
          request_method: "DELETE",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts null request_method", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-method-null-001",
          amount: 0,
          request_path: "/api/test",
          request_method: null,
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts omitted request_method", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-method-omit-001",
          amount: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("rejects request_method exceeding max length", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-method-long-001",
          amount: 0,
          request_path: "/api/test",
          request_method: "VERYLONGMETHOD",
        }),
      });
      t.equal(res.status, 400);
    });
  });

  await t.test("metadata field validation", async (t) => {
    await t.test("accepts simple metadata object", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-meta-simple-001",
          amount: 0,
          request_path: "/api/test",
          metadata: {
            host: "api.example.com",
            user_agent: "Mozilla/5.0",
          },
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts null metadata", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-meta-null-001",
          amount: 0,
          request_path: "/api/test",
          metadata: null,
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts omitted metadata", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-meta-omit-001",
          amount: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts empty metadata object", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-meta-empty-001",
          amount: 0,
          request_path: "/api/test",
          metadata: {},
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test("accepts free transaction metadata structure", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-meta-free-001",
          amount: 0,
          request_path: "/api/test",
          client_ip: "192.168.1.1",
          request_method: "GET",
          metadata: {
            host: "myapi.api.example.test",
            query_string: "param=value&other=123",
            user_agent: "curl/7.68.0",
            x_forwarded_for: "10.0.0.1, 172.16.0.1",
          },
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test(
      "accepts paid transaction metadata with EVM payload",
      async (t) => {
        const org = await createOrg("Team", "team");
        const tenant = await createTenant(org.id, "my-tenant");

        const res = await app.request("/internal/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_name: tenant.name,
            ngx_request_id: "req-meta-evm-001",
            amount: 0.01,
            tx_hash: "0xabc123",
            network: "base",
            request_path: "/api/paid",
            client_ip: "203.0.113.50",
            request_method: "POST",
            metadata: {
              host: "myapi.api.example.test",
              query_string: null,
              user_agent: "MyApp/1.0",
              x_forwarded_for: null,
              payment: {
                pay_to: "0x1234567890abcdef1234567890abcdef12345678",
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                scheme: "exact",
                payload: {
                  signature: "0xabcdef1234567890",
                  authorization: {
                    from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    to: "0x1234567890abcdef1234567890abcdef12345678",
                    value: "10000",
                    validAfter: "0",
                    validBefore: "1999999999",
                    nonce: "0x1234",
                  },
                },
              },
            },
          }),
        });
        t.equal(res.status, 200);
      },
    );

    await t.test(
      "accepts paid transaction metadata with Solana payload",
      async (t) => {
        const org = await createOrg("Team", "team");
        const tenant = await createTenant(org.id, "my-tenant");

        const res = await app.request("/internal/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_name: tenant.name,
            ngx_request_id: "req-meta-solana-001",
            amount: 0.01,
            tx_hash:
              "5KxzZ9Nh7PjVkAqYqoxMjF8FcQjS9JfqNqXrKwYNJzQqBx1qKjYvNqXrKwYNJzQq",
            network: "solana-mainnet-beta",
            request_path: "/api/paid",
            client_ip: "198.51.100.25",
            request_method: "GET",
            metadata: {
              host: "myapi.api.example.test",
              query_string: "key=value",
              user_agent: "SolanaWallet/2.0",
              x_forwarded_for: null,
              payment: {
                pay_to: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
                asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                scheme: "exact",
                payload: {
                  transaction:
                    "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABase64EncodedTransaction==",
                },
              },
            },
          }),
        });
        t.equal(res.status, 200);
      },
    );

    await t.test("rejects metadata as string", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-meta-string-001",
          amount: 0,
          request_path: "/api/test",
          metadata: "not an object",
        }),
      });
      t.equal(res.status, 400);
    });

    await t.test("rejects metadata as number", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-meta-number-001",
          amount: 0,
          request_path: "/api/test",
          metadata: 12345,
        }),
      });
      t.equal(res.status, 400);
    });
  });

  await t.test("combined metadata fields", async (t) => {
    await t.test(
      "accepts all metadata fields together for free transaction",
      async (t) => {
        const org = await createOrg("Team", "team");
        const tenant = await createTenant(org.id, "my-tenant", "team");

        const res = await app.request("/internal/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_name: tenant.name,
            org_slug: "team",
            ngx_request_id: "req-combined-free-001",
            amount: 0,
            request_path: "/api/free-endpoint",
            client_ip: "10.0.0.1",
            request_method: "GET",
            metadata: {
              host: "myapi.api.example.test",
              query_string: null,
              user_agent: "TestClient/1.0",
              x_forwarded_for: null,
            },
          }),
        });
        t.equal(res.status, 200);
      },
    );

    await t.test(
      "accepts all metadata fields together for paid transaction",
      async (t) => {
        const org = await createOrg("Team", "team");
        const tenant = await createTenant(org.id, "my-tenant", "team");

        const res = await app.request("/internal/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_name: tenant.name,
            org_slug: "team",
            ngx_request_id: "req-combined-paid-001",
            amount: 0.05,
            tx_hash: "0xfullhash123456789",
            network: "base",
            request_path: "/api/paid-endpoint",
            client_ip: "2001:db8::1",
            request_method: "POST",
            metadata: {
              host: "myapi.api.example.test",
              query_string: "action=test",
              user_agent: "PaymentSDK/2.0",
              x_forwarded_for: "192.168.1.1",
              payment: {
                pay_to: "0x1234567890abcdef1234567890abcdef12345678",
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                scheme: "exact",
                payload: {
                  signature: "0xsig",
                  authorization: {
                    from: "0xpayer",
                    to: "0xpayee",
                    value: "50000",
                    validAfter: "0",
                    validBefore: "9999999999",
                    nonce: "0xabc",
                  },
                },
              },
            },
          }),
        });
        t.equal(res.status, 200);
      },
    );

    await t.test("backward compatibility - no new fields", async (t) => {
      const org = await createOrg("Team", "team");
      const tenant = await createTenant(org.id, "my-tenant");

      const res = await app.request("/internal/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenant.name,
          ngx_request_id: "req-backward-compat-001",
          amount: 0,
          request_path: "/api/test",
        }),
      });
      t.equal(res.status, 200);
    });

    await t.test(
      "backward compatibility - paid transaction without new fields",
      async (t) => {
        const org = await createOrg("Team", "team");
        const tenant = await createTenant(org.id, "my-tenant");

        const res = await app.request("/internal/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_name: tenant.name,
            ngx_request_id: "req-backward-paid-001",
            amount: 0.1,
            tx_hash: "oldhash123",
            network: "solana",
            request_path: "/api/paid",
          }),
        });
        t.equal(res.status, 200);
      },
    );
  });
});

await t.test("GET /internal/nodes/:id/sync", async (t) => {
  await t.test("returns 404 for non-existent node", async (t) => {
    const res = await app.request("/internal/nodes/999/sync");
    t.equal(res.status, 404);
  });

  await t.test("returns sync config for node", async (t) => {
    const node = await createNode("test-node");

    const res = await app.request(`/internal/nodes/${node.id}/sync`);
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
      const node = await createNode("test-node");
      const org = await createOrg("Team", "team");
      const wallet = await createWallet(org.id, "funded-wallet", true);
      const tenant = await createTenant(org.id, "my-tenant", null, {
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

      const res = await app.request(`/internal/nodes/${node.id}/sync`);
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 1);
      t.ok(data.config["my-tenant.api.example.test"]);
      t.equal(data.config["my-tenant.api.example.test"].endpoints.length, 1);
    },
  );

  await t.test("excludes tenant with unfunded wallet", async (t) => {
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "unfunded-wallet", false);
    const tenant = await createTenant(org.id, "unfunded-tenant", null, {
      wallet_id: wallet.id,
      status: "active",
      is_active: true,
    });
    await linkTenantToNode(tenant.id, node.id);

    const res = await app.request(`/internal/nodes/${node.id}/sync`);
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.tenant_count, 0);
  });

  await t.test("excludes tenant with non-active status", async (t) => {
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);
    const tenant = await createTenant(org.id, "pending-tenant", null, {
      wallet_id: wallet.id,
      status: "pending",
      is_active: true,
    });
    await linkTenantToNode(tenant.id, node.id);

    const res = await app.request(`/internal/nodes/${node.id}/sync`);
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.tenant_count, 0);
  });

  await t.test("excludes inactive endpoints from sync config", async (t) => {
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);
    const tenant = await createTenant(org.id, "my-tenant", null, {
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

    const res = await app.request(`/internal/nodes/${node.id}/sync`);
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.config["my-tenant.api.example.test"].endpoints.length, 1);
    t.equal(
      data.config["my-tenant.api.example.test"].endpoints[0].path_pattern,
      "^/api/active$",
    );
  });

  await t.test("sync config has complete tenant structure", async (t) => {
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "configured-tenant",
        organization_id: org.id,
        backend_url: "http://backend.example.com",
        default_price: 0.05,
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
        price: 0.1,
        scheme: "prepay",
        is_active: true,
      })
      .execute();

    const res = await app.request(`/internal/nodes/${node.id}/sync`);
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;

    const tenantConfig = data.config["configured-tenant.api.example.test"];
    t.ok(tenantConfig, "tenant config exists");
    t.equal(tenantConfig.backend_url, "http://backend.example.com");
    t.equal(tenantConfig.default_price, 0.05);
    t.equal(tenantConfig.default_scheme, "exact");
    t.equal(tenantConfig.upstream_auth_header, "Authorization");
    t.equal(tenantConfig.upstream_auth_value, "Bearer secret123");
    t.ok(tenantConfig.wallet_config, "wallet_config present");

    t.equal(tenantConfig.endpoints.length, 1);
    const endpoint = tenantConfig.endpoints[0];
    t.ok(endpoint.id, "endpoint has id");
    t.equal(endpoint.path_pattern, "^/api/test$");
    t.equal(endpoint.price, 0.1);
    t.equal(endpoint.scheme, "prepay");
    t.equal(endpoint.priority, 10);
  });

  await t.test("endpoints ordered by priority ascending in sync", async (t) => {
    const node = await createNode("test-node");
    const org = await createOrg("Team", "team");
    const wallet = await createWallet(org.id, "wallet", true);
    const tenant = await createTenant(org.id, "my-tenant", null, {
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

    const res = await app.request(`/internal/nodes/${node.id}/sync`);
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const endpoints = data.config["my-tenant.api.example.test"].endpoints;
    t.equal(endpoints.length, 3);
    t.equal(endpoints[0].priority, 1);
    t.equal(endpoints[1].priority, 50);
    t.equal(endpoints[2].priority, 100);
  });

  await t.test("handles non-numeric node id", async (t) => {
    const res = await app.request("/internal/nodes/invalid/sync");
    t.equal(res.status, 404);
  });

  await t.test(
    "sync config uses correct domain for org_slug format tenant",
    async (t) => {
      const node = await createNode("test-node");
      const org = await createOrg("Acme Corp", "acme");
      const wallet = await createWallet(org.id, "wallet", true);
      const tenant = await createTenant(org.id, "my-api", "acme", {
        wallet_id: wallet.id,
        status: "active",
        is_active: true,
      });
      await linkTenantToNode(tenant.id, node.id);

      const res = await app.request(`/internal/nodes/${node.id}/sync`);
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 1);
      t.ok(data.config["my-api.acme.api.example.test"]);
      t.notOk(data.config["my-api.api.example.test"]);
    },
  );

  await t.test(
    "sync config includes name, proxy_name, domain, org_slug for legacy tenant",
    async (t) => {
      const node = await createNode("test-node");
      const org = await createOrg("Team", "team");
      const wallet = await createWallet(org.id, "wallet", true);
      const tenant = await createTenant(org.id, "legacy-api", null, {
        wallet_id: wallet.id,
        status: "active",
        is_active: true,
      });
      await linkTenantToNode(tenant.id, node.id);

      const res = await app.request(`/internal/nodes/${node.id}/sync`);
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      const tenantConfig = data.config["legacy-api.api.example.test"];
      t.ok(tenantConfig, "tenant config exists");
      t.equal(tenantConfig.name, "legacy-api");
      t.equal(tenantConfig.proxy_name, "legacy-api");
      t.equal(tenantConfig.domain, "legacy-api.api.example.test");
      t.equal(tenantConfig.org_slug, null);
    },
  );

  await t.test(
    "sync config includes name, proxy_name, domain, org_slug for org_slug tenant",
    async (t) => {
      const node = await createNode("test-node");
      const org = await createOrg("Acme Corp", "acme");
      const wallet = await createWallet(org.id, "wallet", true);
      const tenant = await createTenant(org.id, "org-api", "acme", {
        wallet_id: wallet.id,
        status: "active",
        is_active: true,
      });
      await linkTenantToNode(tenant.id, node.id);

      const res = await app.request(`/internal/nodes/${node.id}/sync`);
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      const tenantConfig = data.config["org-api.acme.api.example.test"];
      t.ok(tenantConfig, "tenant config exists");
      t.equal(tenantConfig.name, "org-api");
      t.equal(tenantConfig.proxy_name, "org-api");
      t.equal(tenantConfig.domain, "org-api.acme.api.example.test");
      t.equal(tenantConfig.org_slug, "acme");
    },
  );

  await t.test(
    "multiple tenants with different formats on same node",
    async (t) => {
      const node = await createNode("test-node");
      const org1 = await createOrg("Org One", "org-one");
      const org2 = await createOrg("Org Two", "org-two");
      const wallet1 = await createWallet(org1.id, "wallet1", true);
      const wallet2 = await createWallet(org2.id, "wallet2", true);

      const legacyTenant = await createTenant(org1.id, "legacy-svc", null, {
        wallet_id: wallet1.id,
        status: "active",
        is_active: true,
      });
      const orgSlugTenant = await createTenant(org2.id, "org-svc", "org-two", {
        wallet_id: wallet2.id,
        status: "active",
        is_active: true,
      });

      await linkTenantToNode(legacyTenant.id, node.id);
      await linkTenantToNode(orgSlugTenant.id, node.id);

      const res = await app.request(`/internal/nodes/${node.id}/sync`);
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 2);

      // Legacy tenant uses simple domain
      t.ok(data.config["legacy-svc.api.example.test"]);
      t.equal(data.config["legacy-svc.api.example.test"].org_slug, null);

      // org_slug tenant uses org-qualified domain
      t.ok(data.config["org-svc.org-two.api.example.test"]);
      t.equal(
        data.config["org-svc.org-two.api.example.test"].org_slug,
        "org-two",
      );
    },
  );

  await t.test(
    "same tenant name in different orgs with org_slug format",
    async (t) => {
      const node = await createNode("test-node");
      const org1 = await createOrg("Org One", "org-one");
      const org2 = await createOrg("Org Two", "org-two");
      const wallet1 = await createWallet(org1.id, "wallet1", true);
      const wallet2 = await createWallet(org2.id, "wallet2", true);

      const tenant1 = await createTenant(org1.id, "api", "org-one", {
        wallet_id: wallet1.id,
        status: "active",
        is_active: true,
      });
      const tenant2 = await createTenant(org2.id, "api", "org-two", {
        wallet_id: wallet2.id,
        status: "active",
        is_active: true,
      });

      await linkTenantToNode(tenant1.id, node.id);
      await linkTenantToNode(tenant2.id, node.id);

      const res = await app.request(`/internal/nodes/${node.id}/sync`);
      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.tenant_count, 2);

      // Both have same name but different domains
      t.ok(data.config["api.org-one.api.example.test"]);
      t.ok(data.config["api.org-two.api.example.test"]);
      t.equal(data.config["api.org-one.api.example.test"].org_slug, "org-one");
      t.equal(data.config["api.org-two.api.example.test"].org_slug, "org-two");
    },
  );

  await t.test(
    "accessible without authentication (internal network only)",
    async (t) => {
      const node = await createNode("test-node");

      // No auth cookie - should still work
      const res = await app.request(`/internal/nodes/${node.id}/sync`);
      t.equal(res.status, 200);
    },
  );
});
