import "../tests/setup/env.js";
import t from "tap";
import { buildTenantGatewaySpecFromData } from "./gateway-spec-builder.js";

function minimalEndpoint(id: number) {
  return {
    id,
    path: "/test",
    path_pattern: "/test",
    openapi_source_paths: null,
    price: null,
    scheme: "exact" as const,
    description: null,
    http_method: "GET",
  };
}

function minimalTokenPrice(network: string, endpointId: number | null = null) {
  return {
    token_symbol: "USDC",
    mint_address: "0xmint",
    network,
    amount: "1000",
    decimals: 6,
    endpoint_id: endpointId,
  };
}

await t.test(
  "resolves solana-mainnet-beta from nested wallet_config",
  async (t) => {
    const walletConfig = {
      solana: { "mainnet-beta": { address: "SolAddress123" } },
    };
    const result = buildTenantGatewaySpecFromData({
      tenantId: 1,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(1)],
      tokenPrices: [minimalTokenPrice("solana-mainnet-beta")],
    });
    t.not(result, null);
    if (!result) return;
    const assets = result.spec["x-faremeter-assets"] as Record<
      string,
      { recipient: string }
    >;
    t.equal(
      assets["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp-USDC"]?.recipient,
      "SolAddress123",
    );
    t.equal(
      result.warnings.filter((w) => w.includes("No wallet address")).length,
      0,
    );
  },
);

await t.test(
  "resolves solana-devnet from mainnet-beta wallet_config fallback",
  async (t) => {
    const walletConfig = {
      solana: { "mainnet-beta": { address: "SolAddress123" } },
    };
    const result = buildTenantGatewaySpecFromData({
      tenantId: 9,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(9)],
      tokenPrices: [minimalTokenPrice("solana-devnet")],
    });
    t.not(result, null);
    if (!result) return;
    const assets = result.spec["x-faremeter-assets"] as Record<
      string,
      { recipient: string }
    >;
    t.equal(
      assets["solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1-USDC"]?.recipient,
      "SolAddress123",
    );
    t.equal(
      result.warnings.filter((w) => w.includes("No wallet address")).length,
      0,
    );
  },
);

await t.test(
  "prefers explicit solana-devnet wallet_config over fallback",
  async (t) => {
    const walletConfig = {
      solana: {
        "mainnet-beta": { address: "MainnetAddress123" },
        devnet: { address: "DevnetAddress123" },
      },
    };
    const result = buildTenantGatewaySpecFromData({
      tenantId: 10,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(10)],
      tokenPrices: [minimalTokenPrice("solana-devnet")],
    });
    t.not(result, null);
    if (!result) return;
    const assets = result.spec["x-faremeter-assets"] as Record<
      string,
      { recipient: string }
    >;
    t.equal(
      assets["solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1-USDC"]?.recipient,
      "DevnetAddress123",
    );
  },
);

await t.test("resolves base from nested evm.base wallet_config", async (t) => {
  const walletConfig = {
    evm: { base: { address: "BaseAddress123" } },
  };
  const result = buildTenantGatewaySpecFromData({
    tenantId: 2,
    tenantName: "test",
    walletConfig,
    endpoints: [minimalEndpoint(2)],
    tokenPrices: [minimalTokenPrice("base")],
  });
  t.not(result, null);
  if (!result) return;
  const assets = result.spec["x-faremeter-assets"] as Record<
    string,
    { recipient: string }
  >;
  t.equal(assets["base-USDC"]?.recipient, "BaseAddress123");
  t.equal(
    result.warnings.filter((w) => w.includes("No wallet address")).length,
    0,
  );
});

await t.test(
  "resolves polygon from nested evm.polygon wallet_config",
  async (t) => {
    const walletConfig = {
      evm: { polygon: { address: "PolyAddress123" } },
    };
    const result = buildTenantGatewaySpecFromData({
      tenantId: 3,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(3)],
      tokenPrices: [minimalTokenPrice("polygon")],
    });
    t.not(result, null);
    if (!result) return;
    const assets = result.spec["x-faremeter-assets"] as Record<
      string,
      { recipient: string }
    >;
    t.equal(assets["polygon-USDC"]?.recipient, "PolyAddress123");
    t.equal(
      result.warnings.filter((w) => w.includes("No wallet address")).length,
      0,
    );
  },
);

await t.test(
  "resolves eip155:137 (polygon alias) from nested evm.polygon wallet_config",
  async (t) => {
    const walletConfig = {
      evm: { polygon: { address: "PolyAddress456" } },
    };
    const result = buildTenantGatewaySpecFromData({
      tenantId: 4,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(4)],
      tokenPrices: [minimalTokenPrice("eip155:137")],
    });
    t.not(result, null);
    if (!result) return;
    const assets = result.spec["x-faremeter-assets"] as Record<
      string,
      { recipient: string }
    >;
    t.equal(assets["eip155:137-USDC"]?.recipient, "PolyAddress456");
    t.equal(
      result.warnings.filter((w) => w.includes("No wallet address")).length,
      0,
    );
  },
);

await t.test(
  "resolves eip155:143 (monad) from nested evm.monad wallet_config",
  async (t) => {
    const walletConfig = {
      evm: { monad: { address: "MonadAddress789" } },
    };
    const result = buildTenantGatewaySpecFromData({
      tenantId: 5,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(5)],
      tokenPrices: [minimalTokenPrice("eip155:143")],
    });
    t.not(result, null);
    if (!result) return;
    const assets = result.spec["x-faremeter-assets"] as Record<
      string,
      { recipient: string }
    >;
    t.equal(assets["eip155:143-USDC"]?.recipient, "MonadAddress789");
    t.equal(
      result.warnings.filter((w) => w.includes("No wallet address")).length,
      0,
    );
  },
);

await t.test(
  "warns and skips asset when network key is missing in wallet_config",
  async (t) => {
    const walletConfig = {
      solana: { "mainnet-beta": { address: "SolAddress123" } },
    };
    const result = buildTenantGatewaySpecFromData({
      tenantId: 6,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(6)],
      tokenPrices: [minimalTokenPrice("base")],
    });
    t.not(result, null);
    if (!result) return;
    const assets = result.spec["x-faremeter-assets"] as Record<string, unknown>;
    t.notOk(
      assets["base-USDC"],
      "base asset must not appear when evm key absent",
    );
    t.ok(
      result.warnings.some((w) => w.includes("base")),
      "warning must mention base",
    );
  },
);

await t.test("throws on unrecognized network", async (t) => {
  const walletConfig = {
    solana: { "mainnet-beta": { address: "SolAddress123" } },
  };
  t.throws(() => {
    buildTenantGatewaySpecFromData({
      tenantId: 7,
      tenantName: "test",
      walletConfig,
      endpoints: [minimalEndpoint(7)],
      tokenPrices: [minimalTokenPrice("unknown-network")],
    });
  }, /unrecognized network/);
});
