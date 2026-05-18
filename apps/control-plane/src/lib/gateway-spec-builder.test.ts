import "../tests/setup/env.js";
import t from "tap";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import {
  buildTenantGatewaySpec,
  buildTenantGatewaySpecFromData,
} from "./gateway-spec-builder.js";

await setupTestSchema();

async function createOrg(name: string, slug: string) {
  return db
    .insertInto("organizations")
    .values({ name, slug })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createWallet(
  orgId: number,
  config: Record<string, unknown>,
  funded = true,
) {
  return db
    .insertInto("wallets")
    .values({
      name: "test-wallet",
      organization_id: orgId,
      funding_status: funded ? "funded" : "pending",
      wallet_config: JSON.stringify(config),
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createTenant(
  orgId: number,
  name: string,
  walletId: number | null,
) {
  return db
    .insertInto("tenants")
    .values({
      name,
      organization_id: orgId,
      backend_url: "http://backend.example.test",
      default_price: 0.01,
      default_scheme: "exact",
      wallet_id: walletId,
      status: "active",
      is_active: true,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createEndpoint(
  tenantId: number,
  path: string,
  opts: {
    price?: number | null;
    scheme?: string | null;
    priority?: number;
    openapi_source_paths?: string[];
    description?: string;
    http_method?: string;
  } = {},
) {
  return db
    .insertInto("endpoints")
    .values({
      tenant_id: tenantId,
      path,
      path_pattern: path,
      price: opts.price ?? null,
      scheme: opts.scheme ?? "exact",
      priority: opts.priority ?? 100,
      is_active: true,
      openapi_source_paths: opts.openapi_source_paths ?? undefined,
      description: opts.description ?? null,
      http_method: opts.http_method ?? "ANY",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

async function createTokenPrice(
  tenantId: number,
  endpointId: number | null,
  opts: {
    symbol?: string;
    mint?: string;
    network?: string;
    amount?: number | string;
    decimals?: number;
  } = {},
) {
  return db
    .insertInto("token_prices")
    .values({
      tenant_id: tenantId,
      endpoint_id: endpointId,
      token_symbol: opts.symbol ?? "USDC",
      mint_address: opts.mint ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      network: opts.network ?? "solana-mainnet-beta",
      amount: opts.amount ?? 1000,
      decimals: opts.decimals ?? 6,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
}

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("returns null for nonexistent tenant", async (t) => {
  const result = await buildTenantGatewaySpec(999);
  t.equal(result, null);
});

await t.test("returns null when tenant has no wallet", async (t) => {
  const org = await createOrg("Team", "team");
  const tenant = await createTenant(org.id, "no-wallet", null);
  const result = await buildTenantGatewaySpec(tenant.id);
  t.equal(result, null);
});

await t.test("returns null for invalid wallet_config", async (t) => {
  const org = await createOrg("Team", "team");
  // Insert wallet with a config that violates the arktype schema
  const wallet = await db
    .insertInto("wallets")
    .values({
      name: "bad-wallet",
      organization_id: org.id,
      funding_status: "funded",
      wallet_config: JSON.stringify("not-an-object"),
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  const tenant = await createTenant(org.id, "bad-config", wallet.id);
  const result = await buildTenantGatewaySpec(tenant.id);
  t.equal(result, null);
});

await t.test("builds spec with correct structure", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "SoLwALLeTaDdReSs123" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "my-api", wallet.id);

  await createEndpoint(tenant.id, "/users/{id}", {
    price: 5000,
    scheme: "exact",
    description: "Get user by ID",
  });

  await createTokenPrice(tenant.id, null, {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    network: "solana-mainnet-beta",
    amount: 1000,
    decimals: 6,
  });

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  const spec = result.spec;
  t.equal(spec.openapi, "3.0.3");
  t.same((spec.info as Record<string, unknown>).title, "my-api");

  const assets = spec["x-faremeter-assets"] as Record<string, unknown>;
  t.ok(assets["solana-mainnet-beta-USDC"]);
  const asset = assets["solana-mainnet-beta-USDC"] as Record<string, unknown>;
  t.equal(asset.chain, "solana-mainnet-beta");
  t.equal(asset.token, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  t.equal(asset.decimals, 6);
  t.equal(asset.recipient, "SoLwALLeTaDdReSs123");

  const paths = spec.paths as Record<string, unknown>;
  t.ok(paths["/users/{id}"]);

  const pathEntry = paths["/users/{id}"] as Record<string, unknown>;
  const getOp = pathEntry.get as Record<string, unknown>;
  const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
  t.ok(pricing);
  t.same(pricing.rates, { "solana-mainnet-beta-USDC": 1 });
  const rules = pricing.rules as Record<string, unknown>[];
  t.equal(rules.length, 1);
  const rule0 = rules[0];
  t.ok(rule0);
  if (!rule0) return;
  // price=5000 * tenant-level amount=1000 = 5000000
  t.equal(rule0.capture, "5000000");
});

await t.test(
  "endpoint with null scheme inherits tenant default exact pricing",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "SoLwALLeTaDdReSs123" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "default-priced-api", wallet.id);

    await createEndpoint(tenant.id, "/v1/chat/completions", {
      scheme: null,
    });
    await createTokenPrice(tenant.id, null, {
      amount: 90000,
    });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    const route = paths["/v1/chat/completions"];
    t.ok(route);

    const post = route?.post as Record<string, unknown>;
    const pricing = post["x-faremeter-pricing"] as Record<string, unknown>;
    const rules = pricing.rules as Record<string, unknown>[];

    t.matchOnly(rules, [{ match: "true", capture: "90000" }]);
  },
);

await t.test("skips free endpoints", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "addr1" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "free-test", wallet.id);

  await createEndpoint(tenant.id, "/free-endpoint", { scheme: "free" });
  await createEndpoint(tenant.id, "/paid-endpoint", { scheme: "exact" });
  await createTokenPrice(tenant.id, null);

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  const paths = result.spec.paths as Record<string, unknown>;
  t.notOk(paths["/free-endpoint"]);
  t.ok(paths["/paid-endpoint"]);
});

await t.test("skips zero-price flex endpoints", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "addr1" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "zero-flex-test", wallet.id);

  await createEndpoint(tenant.id, "/free-flex-endpoint", {
    scheme: "flex",
    price: 0,
  });
  await createEndpoint(tenant.id, "/paid-flex-endpoint", {
    scheme: "flex",
    price: 2,
  });
  await createTokenPrice(tenant.id, null);

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  const paths = result.spec.paths as Record<string, unknown>;
  t.notOk(paths["/free-flex-endpoint"]);
  t.ok(paths["/paid-flex-endpoint"]);
  t.notOk(result.operationKeyToScheme["GET /free-flex-endpoint"]);
  t.equal(result.operationKeyToScheme["GET /paid-flex-endpoint"], "flex");
});

await t.test("uses openapi_source_paths when present", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "addr1" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "source-paths", wallet.id);

  await createEndpoint(tenant.id, "/api/data", {
    scheme: "exact",
    openapi_source_paths: ["/v1/data", "/v2/data"],
  });
  await createTokenPrice(tenant.id, null);

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  const paths = result.spec.paths as Record<string, unknown>;
  t.ok(paths["/v1/data"]);
  t.ok(paths["/v2/data"]);
  t.notOk(paths["/api/data"]);
});

await t.test(
  "preserves imported OpenAPI flex rates, authorize, and response capture rules",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { devnet: { address: "merchant-wallet" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "dynamic-flex", wallet.id);

    const importedSpec = {
      openapi: "3.0.3",
      info: { title: "Dynamic Flex API", version: "1.0.0" },
      "x-faremeter-assets": {
        "solana-devnet-USDC": {
          chain: "solana-devnet",
          token: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
          decimals: 6,
          recipient: "merchant-token-account",
        },
      },
      "x-faremeter-pricing": {
        rates: { "solana-devnet-USDC": 1000 },
      },
      paths: {
        "/v1/chat/completions": {
          post: {
            summary: "Chat completions",
            responses: { "200": { description: "OK" } },
            "x-faremeter-pricing": {
              rules: [
                {
                  match: '$[?@.request.body.model == "gpt-4o"]',
                  authorize: "coalesce($.request.body.max_tokens, 1024) * 40",
                  capture:
                    "$.response.body.usage.prompt_tokens * 10 + $.response.body.usage.completion_tokens * 30",
                },
                {
                  match: "$",
                  authorize: "100000",
                  capture: "$.response.body.usage.total_tokens * 10",
                },
              ],
            },
          },
        },
      },
    };

    await db
      .updateTable("tenants")
      .set({ openapi_spec: JSON.stringify(importedSpec) })
      .where("id", "=", tenant.id)
      .execute();
    await createTokenPrice(tenant.id, null, {
      mint: "tenant-default-mint",
      network: "solana-devnet",
      amount: 1000,
    });

    const endpoint = await createEndpoint(tenant.id, "/v1/chat/completions", {
      scheme: "flex",
      http_method: "POST",
      openapi_source_paths: ["/v1/chat/completions"],
    });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const assets = result.spec["x-faremeter-assets"] as Record<string, unknown>;
    t.same(
      assets["solana-devnet-USDC"],
      {
        chain: "solana-devnet",
        token: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        decimals: 6,
        recipient: "merchant-token-account",
      },
      "must preserve OpenAPI asset over same-alias tenant defaults",
    );

    const pricing = result.spec["x-faremeter-pricing"] as Record<
      string,
      unknown
    >;
    t.same(
      pricing.rates,
      { "solana-devnet-USDC": 1000 },
      "must preserve imported dynamic pricing rates",
    );

    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    const operation = paths["/v1/chat/completions"]?.post as Record<
      string,
      unknown
    >;
    t.ok(operation, "must preserve linked POST operation");
    t.equal(operation.summary, "Chat completions");

    const operationPricing = operation["x-faremeter-pricing"] as Record<
      string,
      unknown
    >;
    const rules = operationPricing.rules as Record<string, unknown>[];
    t.equal(rules.length, 2);
    t.equal(
      rules[0]?.authorize,
      "coalesce($.request.body.max_tokens, 1024) * 40",
    );
    t.equal(
      rules[0]?.capture,
      "$.response.body.usage.prompt_tokens * 10 + $.response.body.usage.completion_tokens * 30",
    );
    t.equal(rules[1]?.authorize, "100000");
    t.equal(
      result.operationKeyToEndpointId["POST /v1/chat/completions"],
      endpoint.id,
    );
    t.equal(result.operationKeyToScheme["POST /v1/chat/completions"], "flex");
  },
);

await t.test(
  "does not publish imported methods that are not mapped to endpoints",
  (t) => {
    const result = buildTenantGatewaySpecFromData({
      tenantId: 1,
      tenantName: "method-leak",
      walletConfig: {
        solana: { devnet: { address: "tenant-default-wallet" } },
      },
      openApiSpec: {
        openapi: "3.0.3",
        info: { title: "Imported", version: "1.0.0" },
        "x-faremeter-assets": {
          "solana-devnet-USDC": {
            chain: "solana-devnet",
            token: "imported-mint",
            decimals: 6,
            recipient: "imported-recipient",
          },
        },
        "x-faremeter-pricing": {
          rates: { "solana-devnet-USDC": 1 },
        },
        paths: {
          "/shared": {
            post: {
              responses: { "200": { description: "OK" } },
              "x-faremeter-pricing": {
                rules: [{ match: "$", capture: "50" }],
              },
            },
          },
        },
      },
      endpoints: [
        {
          id: 1,
          path: "/shared",
          path_pattern: "/shared",
          openapi_source_paths: ["/shared"],
          price: 1,
          scheme: "exact",
          description: null,
          http_method: "GET",
        },
      ],
      tokenPrices: [
        {
          token_symbol: "USDC",
          mint_address: "tenant-default-mint",
          network: "solana-devnet",
          amount: "1000",
          decimals: 6,
          endpoint_id: null,
        },
      ],
    });
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    t.ok(paths["/shared"]?.get, "mapped GET operation should be present");
    t.notOk(
      paths["/shared"]?.post,
      "unmapped imported POST operation must not be published",
    );
    t.same(result.operationKeyToEndpointId, { "GET /shared": 1 });
    t.same(result.operationKeyToScheme, { "GET /shared": "exact" });
    t.end();
  },
);

await t.test(
  "OpenAPI path-level empty pricing rules opt out of fixed fallback",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "openapi-free-optout", wallet.id);

    await db
      .updateTable("tenants")
      .set({
        openapi_spec: JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Opt out", version: "1.0.0" },
          paths: {
            "/free-from-spec": {
              "x-faremeter-pricing": { rules: [] },
              get: {
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      })
      .where("id", "=", tenant.id)
      .execute();

    await createEndpoint(tenant.id, "/free-from-spec", {
      scheme: "flex",
      price: 2,
      http_method: "GET",
      openapi_source_paths: ["/free-from-spec"],
    });
    await createTokenPrice(tenant.id, null);

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    const path = paths["/free-from-spec"];
    t.ok(path);
    const operation = path?.get as Record<string, unknown>;
    t.notOk(
      operation["x-faremeter-pricing"],
      "must not add fixed fallback when OpenAPI explicitly opts out",
    );
    const pathPricing = path?.["x-faremeter-pricing"] as Record<
      string,
      unknown
    >;
    t.same(pathPricing.rules, []);
  },
);

await t.test(
  "warns and skips endpoint with unconvertible path pattern",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "bad-path", wallet.id);

    // Regex pattern that can't be converted to OpenAPI
    await createEndpoint(tenant.id, "^/complex/(a|b)/.*$", {
      scheme: "exact",
    });
    await createTokenPrice(tenant.id, null);

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, unknown>;
    t.same(Object.keys(paths), []);
    t.ok(result.warnings.length > 0);
    const firstWarning = result.warnings[0];
    t.ok(firstWarning);
    if (!firstWarning) return;
    t.ok(firstWarning.includes("Cannot convert"));
  },
);

await t.test("ANY endpoint expands to all standard methods", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "addr1" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "key-format", wallet.id);

  const endpoint = await createEndpoint(tenant.id, "/items/{itemId}", {
    scheme: "exact",
  });
  await createTokenPrice(tenant.id, null);

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  // ANY must emit all standard methods
  for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
    t.equal(
      result.operationKeyToEndpointId[`${method} /items/{itemId}`],
      endpoint.id,
      `${method} should map to endpoint`,
    );
    t.equal(
      result.operationKeyToScheme[`${method} /items/{itemId}`],
      "exact",
      `${method} should map to exact scheme`,
    );
  }

  // ANY must NOT include HEAD or OPTIONS
  t.equal(
    result.operationKeyToEndpointId["HEAD /items/{itemId}"],
    undefined,
    "ANY must not expand to HEAD",
  );
  t.equal(
    result.operationKeyToEndpointId["OPTIONS /items/{itemId}"],
    undefined,
    "ANY must not expand to OPTIONS",
  );

  // OpenAPI paths should have all methods
  const paths = result.spec.paths as Record<string, Record<string, unknown>>;
  const pathEntry = paths["/items/{itemId}"];
  t.ok(pathEntry);
  if (!pathEntry) return;
  for (const m of ["get", "post", "put", "delete", "patch"]) {
    t.ok(pathEntry[m], `${m} operation should exist`);
  }
  t.equal(pathEntry.head, undefined, "ANY must not emit head operation");
  t.equal(pathEntry.options, undefined, "ANY must not emit options operation");
});

await t.test("endpoint-level token prices override tenant-level", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "addr1" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "ep-prices", wallet.id);

  const endpoint = await createEndpoint(tenant.id, "/special", {
    scheme: "exact",
    price: 5000,
  });

  // Tenant-level price
  await createTokenPrice(tenant.id, null, { amount: 1000 });

  // Endpoint-level price — should override
  await createTokenPrice(tenant.id, endpoint.id, { amount: 9999 });

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  const paths = result.spec.paths as Record<string, unknown>;
  const pathEntry = paths["/special"] as Record<string, unknown>;
  const getOp = pathEntry.get as Record<string, unknown>;
  const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
  const rules = pricing.rules as Record<string, unknown>[];

  t.equal(rules.length, 1);
  const rule0 = rules[0];
  t.ok(rule0);
  if (!rule0) return;
  t.equal(rule0.capture, "9999");
});

await t.test(
  "tenant-level prices scaled by endpoint price multiplier",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "scaled", wallet.id);

    await createEndpoint(tenant.id, "/double", {
      scheme: "exact",
      price: 2,
    });

    await createTokenPrice(tenant.id, null, { amount: 1000 });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/double"] as Record<string, unknown>;
    const getOp = pathEntry.get as Record<string, unknown>;
    const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
    const rules = pricing.rules as Record<string, unknown>[];

    t.equal(rules.length, 1);
    const rule0 = rules[0];
    t.ok(rule0);
    if (!rule0) return;
    t.equal(rule0.capture, "2000");

    t.notOk(
      result.warnings.some((w) => w.includes("no price multiplier configured")),
      "must not warn when endpoint price is explicitly set",
    );
  },
);

await t.test(
  "tenant-level price scaling preserves large atomic integer precision",
  async (t) => {
    const result = buildTenantGatewaySpecFromData({
      tenantId: 1,
      tenantName: "large-atomic-scaled",
      defaultScheme: "exact",
      walletConfig: {
        solana: { "mainnet-beta": { address: "addr1" } },
      },
      endpoints: [
        {
          id: 1,
          path: "/large",
          path_pattern: "/large",
          openapi_source_paths: null,
          price: 2,
          scheme: "exact",
          description: null,
          http_method: "GET",
        },
      ],
      tokenPrices: [
        {
          token_symbol: "USDC",
          mint_address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          network: "solana-mainnet-beta",
          amount: "9007199254740993",
          decimals: 6,
          endpoint_id: null,
        },
      ],
    });
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/large"] as Record<string, unknown>;
    const getOp = pathEntry.get as Record<string, unknown>;
    const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
    const rules = pricing.rules as Record<string, unknown>[];

    t.equal(rules[0]?.capture, "18014398509481986");
  },
);

await t.test(
  "tenant-level price scaling rounds fractional multipliers like Math.round",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "fractional-scaled", wallet.id);

    await createEndpoint(tenant.id, "/fractional", {
      scheme: "exact",
      price: 1.235,
    });

    await createTokenPrice(tenant.id, null, { amount: 1000 });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/fractional"] as Record<string, unknown>;
    const getOp = pathEntry.get as Record<string, unknown>;
    const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
    const rules = pricing.rules as Record<string, unknown>[];

    t.equal(rules[0]?.capture, "1235");
  },
);

await t.test(
  "tenant-level price scaling warns when fractional multiplier rounds to zero",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "rounds-zero", wallet.id);

    await createEndpoint(tenant.id, "/rounds-zero", {
      scheme: "exact",
      price: 0.49,
    });

    await createTokenPrice(tenant.id, null, { amount: 1 });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/rounds-zero"] as Record<string, unknown>;
    const getOp = pathEntry.get as Record<string, unknown>;
    const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
    const rules = pricing.rules as Record<string, unknown>[];

    t.equal(rules[0]?.capture, "0");
    t.ok(
      result.warnings.some((w) => w.includes("rounds to 0")),
      "must keep the existing warning for nonzero multipliers that round down",
    );
  },
);

await t.test("null endpoint price defaults multiplier to 1", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "addr1" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "null-price", wallet.id);

  await createEndpoint(tenant.id, "/default-multi", {
    scheme: "exact",
    price: null,
  });

  await createTokenPrice(tenant.id, null, { amount: 500 });

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  const paths = result.spec.paths as Record<string, unknown>;
  const pathEntry = paths["/default-multi"] as Record<string, unknown>;
  const getOp = pathEntry.get as Record<string, unknown>;
  const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
  const rules = pricing.rules as Record<string, unknown>[];

  t.equal(rules.length, 1);
  const rule0 = rules[0];
  t.ok(rule0);
  if (!rule0) return;
  t.equal(rule0.capture, "500");

  t.ok(
    result.warnings.some((w) => w.includes("no price multiplier configured")),
    "must warn when endpoint price is null",
  );
});

await t.test(
  "missing wallet address for network warns and skips asset",
  async (t) => {
    const org = await createOrg("Team", "team");
    // Wallet only has solana address, no base
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "missing-net", wallet.id);

    await createEndpoint(tenant.id, "/test", { scheme: "exact" });

    // Token price on a network with no wallet address
    await createTokenPrice(tenant.id, null, {
      network: "base",
      symbol: "USDC",
      mint: "0xbase-usdc",
    });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    // Asset should be absent
    const assets = result.spec["x-faremeter-assets"] as Record<string, unknown>;
    t.notOk(assets["base-USDC"]);

    // Warning should be present
    t.ok(result.warnings.some((w) => w.includes("base")));

    // No pricing rules because the only asset was skipped
    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/test"] as Record<string, unknown>;
    const getOp = pathEntry.get as Record<string, unknown>;
    t.notOk(getOp["x-faremeter-pricing"]);
  },
);

await t.test(
  "flex scheme produces pricing rules and scheme mapping",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "flex-test", wallet.id);

    const endpoint = await createEndpoint(tenant.id, "/flex-endpoint", {
      scheme: "flex",
      price: 2,
    });
    await createTokenPrice(tenant.id, null, { amount: 1000 });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/flex-endpoint"] as Record<string, unknown>;
    const getOp = pathEntry.get as Record<string, unknown>;
    const pricing = getOp["x-faremeter-pricing"] as Record<string, unknown>;
    const rules = pricing.rules as Record<string, unknown>[];
    t.matchOnly(rules, [{ match: "true", authorize: "2000", capture: "2000" }]);
    t.equal(result.operationKeyToEndpointId["GET /flex-endpoint"], endpoint.id);
    t.equal(result.operationKeyToScheme["GET /flex-endpoint"], "flex");
  },
);

await t.test(
  "endpoint-level price on unconfigured network produces no rules without fallback",
  async (t) => {
    const org = await createOrg("Team", "team");
    // Wallet only has solana, not base
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "no-fallback", wallet.id);

    const endpoint = await createEndpoint(tenant.id, "/partial", {
      scheme: "exact",
    });

    // Tenant-level price on solana (has wallet address)
    await createTokenPrice(tenant.id, null, {
      network: "solana-mainnet-beta",
      symbol: "USDC",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });

    // Endpoint-level price on base (no wallet address)
    await createTokenPrice(tenant.id, endpoint.id, {
      network: "base",
      symbol: "USDC",
      mint: "0xbase-usdc",
    });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    // Warning about missing base wallet
    t.ok(result.warnings.some((w) => w.includes("base")));

    // No pricing rules — endpoint-level branch entered but all skipped,
    // does NOT fall back to tenant-level prices
    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/partial"] as Record<string, unknown>;
    const getOp = pathEntry.get as Record<string, unknown>;
    t.notOk(getOp["x-faremeter-pricing"]);
  },
);

await t.test("POST endpoint emits post operation and POST key", async (t) => {
  const org = await createOrg("Team", "team");
  const walletConfig = {
    solana: { "mainnet-beta": { address: "addr1" } },
  };
  const wallet = await createWallet(org.id, walletConfig);
  const tenant = await createTenant(org.id, "post-test", wallet.id);

  const endpoint = await createEndpoint(tenant.id, "/submit", {
    scheme: "exact",
    http_method: "POST",
  });
  await createTokenPrice(tenant.id, null);

  const result = await buildTenantGatewaySpec(tenant.id);
  t.not(result, null);
  if (!result) return;

  const paths = result.spec.paths as Record<string, unknown>;
  const pathEntry = paths["/submit"] as Record<string, unknown>;
  t.ok(pathEntry);
  if (!pathEntry) return;

  // Should emit post, not get
  t.ok(pathEntry.post);
  t.notOk(pathEntry.get);

  // Operation key uses POST
  t.equal(result.operationKeyToEndpointId["POST /submit"], endpoint.id);
  t.equal(result.operationKeyToEndpointId["GET /submit"], undefined);
});

await t.test(
  "two endpoints on same path with different methods produce independent operations",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "multi-method", wallet.id);

    const getEndpoint = await createEndpoint(tenant.id, "/resource", {
      scheme: "exact",
      http_method: "GET",
    });
    const putEndpoint = await createEndpoint(tenant.id, "/resource", {
      scheme: "exact",
      http_method: "PUT",
    });
    await createTokenPrice(tenant.id, null);

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    const paths = result.spec.paths as Record<string, unknown>;
    const pathEntry = paths["/resource"] as Record<string, unknown>;
    t.ok(pathEntry);
    if (!pathEntry) return;

    // Both methods present
    t.ok(pathEntry.get);
    t.ok(pathEntry.put);

    // Independent operation keys
    t.equal(result.operationKeyToEndpointId["GET /resource"], getEndpoint.id);
    t.equal(result.operationKeyToEndpointId["PUT /resource"], putEndpoint.id);
  },
);

await t.test(
  "duplicate path+method: higher-priority endpoint wins and warning is emitted",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "dup-method", wallet.id);

    const first = await createEndpoint(tenant.id, "/data", {
      scheme: "exact",
      http_method: "GET",
      priority: 10,
    });
    await createEndpoint(tenant.id, "/data", {
      scheme: "exact",
      http_method: "GET",
      priority: 20,
    });
    await createTokenPrice(tenant.id, null);

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    // First endpoint (priority 10) wins
    t.equal(result.operationKeyToEndpointId["GET /data"], first.id);

    // Warning emitted for the duplicate
    const dupWarning = result.warnings.find((w) =>
      w.includes('Duplicate operation "GET /data"'),
    );
    t.ok(dupWarning, "should warn about duplicate operation");
  },
);

await t.test(
  "duplicate path collision only affects the colliding path, not other paths on the same endpoint",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = {
      solana: { "mainnet-beta": { address: "addr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "partial-dup", wallet.id);

    const first = await createEndpoint(tenant.id, "/shared", {
      scheme: "exact",
      http_method: "GET",
      priority: 10,
    });
    const second = await createEndpoint(tenant.id, "/unique", {
      scheme: "exact",
      http_method: "GET",
      priority: 20,
      openapi_source_paths: ["/shared", "/unique"],
    });
    await createTokenPrice(tenant.id, null);

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    // /shared claimed by first endpoint
    t.equal(result.operationKeyToEndpointId["GET /shared"], first.id);

    // /unique still emitted for second endpoint
    t.equal(result.operationKeyToEndpointId["GET /unique"], second.id);

    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    t.ok(paths["/shared"]?.get, "/shared should have GET");
    t.ok(paths["/unique"]?.get, "/unique should have GET");

    // Warning for the collision on /shared
    const dupWarning = result.warnings.find((w) =>
      w.includes('Duplicate operation "GET /shared"'),
    );
    t.ok(dupWarning, "should warn about /shared collision");
  },
);

await t.test(
  "endpoint-level price on network without tenant-level price populates asset from wallet",
  async (t) => {
    const org = await createOrg("Team", "team");
    // Wallet has both solana and base addresses
    const walletConfig = {
      solana: { "mainnet-beta": { address: "solAddr1" } },
      evm: { base: { address: "baseAddr1" } },
    };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "ep-only-net", wallet.id);

    const endpoint = await createEndpoint(tenant.id, "/pay", {
      scheme: "exact",
    });

    // Tenant-level price on solana only
    await createTokenPrice(tenant.id, null, {
      network: "solana-mainnet-beta",
      symbol: "USDC",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });

    // Endpoint-level price on base (wallet has address, but no tenant-level price)
    await createTokenPrice(tenant.id, endpoint.id, {
      network: "base",
      symbol: "USDC",
      mint: "0xbase-usdc",
      amount: 500,
      decimals: 6,
    });

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    // No warnings — base has a wallet address
    const baseWarning = result.warnings.find(
      (w) => w.includes("base") && w.includes("no wallet"),
    );
    t.notOk(baseWarning, "should not warn about base network");

    // The base asset should have been populated
    const assets = result.spec["x-faremeter-assets"] as Record<
      string,
      Record<string, unknown>
    >;
    t.ok(assets["base-USDC"], "base-USDC asset should exist");
    t.equal(assets["base-USDC"]?.recipient, "baseAddr1");

    // Pricing rules should exist on the endpoint
    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    const getOp = paths["/pay"]?.get as Record<string, unknown> | undefined;
    t.ok(getOp, "GET /pay should exist");
    if (!getOp) return;

    const pricing = getOp["x-faremeter-pricing"] as
      | { rules: unknown[] }
      | undefined;
    t.ok(pricing, "should have pricing extension");
    if (!pricing) return;
    t.ok(pricing.rules.length > 0, "should have at least one pricing rule");
  },
);

await t.test(
  "HEAD endpoint produces a head operation and HEAD operation key",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = { solana: { "mainnet-beta": { address: "addr1" } } };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "head-test", wallet.id);

    const endpoint = await createEndpoint(tenant.id, "/status", {
      scheme: "exact",
      http_method: "HEAD",
    });
    await createTokenPrice(tenant.id, null);

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    t.equal(
      result.operationKeyToEndpointId["HEAD /status"],
      endpoint.id,
      "HEAD /status should map to endpoint",
    );

    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    t.ok(paths["/status"]?.head, "head operation should exist");
    t.equal(paths["/status"]?.get, undefined, "get must not exist for HEAD");
  },
);

await t.test(
  "OPTIONS endpoint produces an options operation and OPTIONS operation key",
  async (t) => {
    const org = await createOrg("Team", "team");
    const walletConfig = { solana: { "mainnet-beta": { address: "addr1" } } };
    const wallet = await createWallet(org.id, walletConfig);
    const tenant = await createTenant(org.id, "options-test", wallet.id);

    const endpoint = await createEndpoint(tenant.id, "/cors", {
      scheme: "exact",
      http_method: "OPTIONS",
    });
    await createTokenPrice(tenant.id, null);

    const result = await buildTenantGatewaySpec(tenant.id);
    t.not(result, null);
    if (!result) return;

    t.equal(
      result.operationKeyToEndpointId["OPTIONS /cors"],
      endpoint.id,
      "OPTIONS /cors should map to endpoint",
    );

    const paths = result.spec.paths as Record<string, Record<string, unknown>>;
    t.ok(paths["/cors"]?.options, "options operation should exist");
    t.equal(paths["/cors"]?.get, undefined, "get must not exist for OPTIONS");
  },
);
