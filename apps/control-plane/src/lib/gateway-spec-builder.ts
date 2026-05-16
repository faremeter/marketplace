import type { PricingRule } from "@faremeter/middleware-openapi";
import { type } from "arktype";
import { db } from "../db/instance.js";
import { logger } from "../logger.js";
import { endpointPathToOpenApiPath } from "./openapi-sync.js";

const WalletEntry = type({ "address?": "string" });

const GatewayWalletConfig = type({
  "solana?": { "mainnet-beta?": WalletEntry, "devnet?": WalletEntry },
  "evm?": {
    "base?": WalletEntry,
    "polygon?": WalletEntry,
    "monad?": WalletEntry,
  },
});

type GatewayWalletConfig = typeof GatewayWalletConfig.infer;

// Maps token_prices.network values to the nested wallet_config path.
// Must stay in sync with CreateTokenPriceSchema's allowed network values.
const NETWORK_PATH: Record<string, [keyof GatewayWalletConfig, string]> = {
  "solana-mainnet-beta": ["solana", "mainnet-beta"],
  "solana-devnet": ["solana", "devnet"],
  base: ["evm", "base"],
  polygon: ["evm", "polygon"],
  "eip155:137": ["evm", "polygon"],
  "eip155:143": ["evm", "monad"],
};

function resolveWalletAddress(
  walletConfig: GatewayWalletConfig,
  network: string,
): string | undefined {
  const path = NETWORK_PATH[network];
  if (!path) {
    throw new Error(
      `resolveWalletAddress: unrecognized network "${network}" — NETWORK_PATH and CreateTokenPriceSchema are out of sync`,
    );
  }
  const [chain, sub] = path;
  const chainObj = walletConfig[chain];
  if (!chainObj) return undefined;
  const entry = (chainObj as Record<string, { address?: string } | undefined>)[
    sub
  ];
  return entry?.address;
}

export type GatewaySpecResult = {
  spec: Record<string, unknown>;
  warnings: string[];
  operationKeyToEndpointId: Record<string, number>;
  operationKeyToScheme: Record<string, string>;
};

type TokenPriceRow = {
  token_symbol: string;
  mint_address: string;
  network: string;
  amount: string | number;
  decimals: number;
  endpoint_id: number | null;
};

type EndpointRow = {
  id: number;
  path: string | null;
  path_pattern: string;
  openapi_source_paths: string[] | null;
  price: number | null;
  scheme: string | null;
  description: string | null;
  http_method: string;
};

export type GatewaySpecInput = {
  tenantId: number;
  tenantName: string;
  defaultScheme?: string | null;
  openApiSpec?: unknown;
  walletConfig: unknown;
  endpoints: EndpointRow[];
  tokenPrices: TokenPriceRow[];
};

function resolveEndpointScheme(
  endpoint: Pick<EndpointRow, "scheme">,
  defaultScheme: string,
): string {
  return endpoint.scheme ?? defaultScheme;
}

function isPricedX402Scheme(scheme: string | null): scheme is "exact" | "flex" {
  return scheme === "exact" || scheme === "flex";
}

function isFreeEndpoint(endpoint: Pick<EndpointRow, "price">): boolean {
  return endpoint.price === 0;
}

function normalizeAtomicAmount(amount: string | number): string {
  return typeof amount === "number" ? String(amount) : amount;
}

function parseAtomicAmount(amount: string | number): bigint {
  const normalized = normalizeAtomicAmount(amount);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      `Atomic amount must be a non-negative integer: ${normalized}`,
    );
  }
  return BigInt(normalized);
}

function decimalStringToRational(raw: string): {
  numerator: bigint;
  denominator: bigint;
} {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(raw);
  if (!match) {
    throw new Error(`Multiplier must be a non-negative finite number: ${raw}`);
  }

  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  const exponent = match[3] ? Number(match[3]) : 0;
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  const decimalPlaces = fraction.length - exponent;

  if (decimalPlaces <= 0) {
    return {
      numerator: BigInt(digits) * 10n ** BigInt(-decimalPlaces),
      denominator: 1n,
    };
  }

  return {
    numerator: BigInt(digits),
    denominator: 10n ** BigInt(decimalPlaces),
  };
}

function scaleAtomicAmount(
  amount: string | number,
  multiplier: number,
): string {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new Error(
      `Multiplier must be a non-negative finite number: ${multiplier}`,
    );
  }

  const atomicAmount = parseAtomicAmount(amount);
  const { numerator, denominator } = decimalStringToRational(
    multiplier.toString(),
  );
  const product = atomicAmount * numerator;
  const quotient = product / denominator;
  const remainder = product % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return rounded.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOpenApiSpec(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (isRecord(raw)) return raw;
  if (typeof raw !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getOpenApiPaths(
  openApiSpec: Record<string, unknown> | null,
): Record<string, unknown> {
  return isRecord(openApiSpec?.paths) ? openApiSpec.paths : {};
}

function getOpenApiAssets(
  openApiSpec: Record<string, unknown> | null,
): Record<string, unknown> {
  return isRecord(openApiSpec?.["x-faremeter-assets"])
    ? openApiSpec["x-faremeter-assets"]
    : {};
}

function getOpenApiPathItem(
  openApiSpec: Record<string, unknown> | null,
  path: string,
): Record<string, unknown> | null {
  const item = getOpenApiPaths(openApiSpec)[path];
  return isRecord(item) ? item : null;
}

const OPEN_API_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

function getOpenApiPathMetadata(
  openApiSpec: Record<string, unknown> | null,
  path: string,
): Record<string, unknown> {
  const pathItem = getOpenApiPathItem(openApiSpec, path);
  if (!pathItem) return {};

  return Object.fromEntries(
    Object.entries(pathItem).filter(([key]) => !OPEN_API_METHODS.has(key)),
  );
}

function getOpenApiOperation(
  openApiSpec: Record<string, unknown> | null,
  path: string,
  methodLower: string,
): Record<string, unknown> | null {
  const operation = getOpenApiPathItem(openApiSpec, path)?.[methodLower];
  return isRecord(operation) ? operation : null;
}

function hasExplicitPricingRules(raw: unknown): boolean {
  return isRecord(raw) && Array.isArray(raw.rules);
}

function hasOpenApiPricingRulesForOperation(
  openApiSpec: Record<string, unknown> | null,
  path: string,
  methodLower: string,
): boolean {
  const pathItem = getOpenApiPathItem(openApiSpec, path);
  const operation = getOpenApiOperation(openApiSpec, path, methodLower);
  return (
    hasExplicitPricingRules(operation?.["x-faremeter-pricing"]) ||
    hasExplicitPricingRules(pathItem?.["x-faremeter-pricing"]) ||
    hasExplicitPricingRules(openApiSpec?.["x-faremeter-pricing"])
  );
}

function mergeRecordValues(
  left: unknown,
  right: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(isRecord(left) ? left : {}),
    ...right,
  };
}

function mergePricingExtension(
  openApiSpec: Record<string, unknown> | null,
  rates: Record<string, number>,
): Record<string, unknown> {
  return {
    ...(isRecord(openApiSpec?.["x-faremeter-pricing"])
      ? openApiSpec["x-faremeter-pricing"]
      : {}),
    rates: mergeRecordValues(
      isRecord(openApiSpec?.["x-faremeter-pricing"])
        ? openApiSpec["x-faremeter-pricing"].rates
        : undefined,
      rates,
    ),
  };
}

export function buildTenantGatewaySpecFromData(
  input: GatewaySpecInput,
): GatewaySpecResult | null {
  const walletConfigParsed = GatewayWalletConfig(input.walletConfig);
  if (walletConfigParsed instanceof type.errors) {
    logger.warn(
      `buildTenantGatewaySpec: tenant ${input.tenantId} has invalid wallet_config: ${walletConfigParsed.summary}`,
    );
    return null;
  }

  const walletConfig: GatewayWalletConfig = walletConfigParsed;
  const { endpoints, tokenPrices } = input;
  const defaultScheme = input.defaultScheme ?? "exact";
  const openApiSpec = parseOpenApiSpec(input.openApiSpec);
  const warnings: string[] = [];

  // Build x-faremeter-assets from tenant-level token prices (endpoint_id IS NULL)
  const tenantLevelPrices = tokenPrices.filter((tp) => tp.endpoint_id === null);

  const assets: Record<string, unknown> = { ...getOpenApiAssets(openApiSpec) };
  for (const tp of tenantLevelPrices) {
    const alias = `${tp.network}-${tp.token_symbol}`;
    if (assets[alias]) continue;

    const recipient = resolveWalletAddress(walletConfig, tp.network);

    if (!recipient) {
      warnings.push(
        `No wallet address configured for network "${tp.network}" (required for asset "${alias}")`,
      );
      continue;
    }

    assets[alias] = {
      chain: tp.network,
      token: tp.mint_address,
      decimals: tp.decimals,
      recipient,
    };
  }

  // Build a lookup map for endpoint-level token prices, keyed by endpoint_id
  const endpointPriceMap = new Map<number, TokenPriceRow[]>();
  for (const tp of tokenPrices) {
    if (tp.endpoint_id === null) continue;
    const existing = endpointPriceMap.get(tp.endpoint_id);
    if (existing) {
      existing.push(tp);
    } else {
      endpointPriceMap.set(tp.endpoint_id, [tp]);
    }
  }

  const paths: Record<string, unknown> = {};
  const operationKeyToEndpointId: Record<string, number> = {};
  const operationKeyToScheme: Record<string, string> = {};

  for (const endpoint of endpoints) {
    const effectiveEndpoint = {
      ...endpoint,
      scheme: resolveEndpointScheme(endpoint, defaultScheme),
    };
    const scheme = effectiveEndpoint.scheme;

    // Free endpoints are excluded — handled by the catch-all
    if (!isPricedX402Scheme(scheme) || isFreeEndpoint(endpoint)) continue;

    const sourcePaths = endpoint.openapi_source_paths;
    const resolvedPaths: string[] = [];

    if (sourcePaths && sourcePaths.length > 0) {
      resolvedPaths.push(...sourcePaths);
    } else {
      const converted = endpointPathToOpenApiPath(
        endpoint.path,
        endpoint.path_pattern,
      );
      if (!converted) {
        warnings.push(
          `Cannot convert path pattern "${endpoint.path_pattern}" to OpenAPI path for endpoint ${endpoint.id} — skipping`,
        );
        continue;
      }
      resolvedPaths.push(converted);
    }

    // Determine pricing rules for this endpoint
    const epPrices = endpointPriceMap.get(endpoint.id) ?? [];
    const pricingResult = buildPricingRules(
      effectiveEndpoint,
      epPrices,
      tenantLevelPrices,
      assets,
      walletConfig,
    );
    warnings.push(...pricingResult.warnings);
    Object.assign(assets, pricingResult.additionalAssets);

    // ANY expands to standard content-bearing methods. HEAD is served by
    // nginx natively from the GET handler, and OPTIONS (CORS preflight)
    // should not require payment. Tenants can still price HEAD or OPTIONS
    // individually by setting http_method explicitly on the endpoint.
    const methods =
      endpoint.http_method === "ANY"
        ? (["GET", "POST", "PUT", "DELETE", "PATCH"] as const)
        : ([endpoint.http_method] as const);

    for (const method of methods) {
      const methodLower = method.toLowerCase();

      for (const openApiPath of resolvedPaths) {
        const operationKey = `${method} ${openApiPath}`;
        const sourceOperation = getOpenApiOperation(
          openApiSpec,
          openApiPath,
          methodLower,
        );
        const usesOpenApiPricing = hasOpenApiPricingRulesForOperation(
          openApiSpec,
          openApiPath,
          methodLower,
        );
        const pricingExtension =
          !usesOpenApiPricing && pricingResult.rules.length > 0
            ? { "x-faremeter-pricing": { rules: pricingResult.rules } }
            : {};

        // Endpoints are ordered by priority ASC (lower number = higher priority).
        // First endpoint to claim a method+path wins; duplicates are skipped.
        if (operationKeyToEndpointId[operationKey] !== undefined) {
          warnings.push(
            `Duplicate operation "${operationKey}" from endpoint ${endpoint.id} — already claimed by endpoint ${operationKeyToEndpointId[operationKey]}, skipping`,
          );
          continue;
        }

        const existing = mergeRecordValues(
          getOpenApiPathMetadata(openApiSpec, openApiPath),
          paths[openApiPath] as Record<string, unknown>,
        );
        existing[methodLower] = {
          ...(sourceOperation ?? {}),
          summary:
            endpoint.description ??
            sourceOperation?.summary ??
            `Endpoint: ${openApiPath}`,
          responses: sourceOperation?.responses ?? {
            "200": { description: "Successful response" },
          },
          ...pricingExtension,
        };
        paths[openApiPath] = existing;

        operationKeyToEndpointId[operationKey] = endpoint.id;
        operationKeyToScheme[operationKey] = scheme;
      }
    }
  }

  // Rules use absolute atomic amounts as capture values, so rates are 1:1 —
  // the evaluator multiplies coefficient * rate, and with rate=1 the result
  // equals the capture value directly.
  const rates: Record<string, number> = {};
  for (const alias of Object.keys(assets)) {
    rates[alias] = 1;
  }

  const spec: Record<string, unknown> = {
    openapi: "3.0.3",
    info: {
      title: input.tenantName,
      version: "1.0.0",
    },
    "x-faremeter-assets": assets,
    "x-faremeter-pricing": mergePricingExtension(openApiSpec, rates),
    paths,
  };

  return { spec, warnings, operationKeyToEndpointId, operationKeyToScheme };
}

export async function buildTenantGatewaySpec(
  tenantId: number,
): Promise<GatewaySpecResult | null> {
  const tenantRow = await db
    .selectFrom("tenants")
    .innerJoin("wallets", "wallets.id", "tenants.wallet_id")
    .select([
      "tenants.id",
      "tenants.name",
      "tenants.default_scheme",
      "tenants.openapi_spec",
      "wallets.wallet_config",
    ])
    .where("tenants.id", "=", tenantId)
    .executeTakeFirst();

  if (!tenantRow) {
    logger.debug(`buildTenantGatewaySpec: tenant ${tenantId} not found`);
    return null;
  }

  const [endpoints, tokenPrices] = await Promise.all([
    db
      .selectFrom("endpoints")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("is_active", "=", true)
      .orderBy("priority", "asc")
      .execute(),
    db
      .selectFrom("token_prices")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .execute(),
  ]);

  return buildTenantGatewaySpecFromData({
    tenantId,
    tenantName: tenantRow.name,
    defaultScheme: tenantRow.default_scheme,
    openApiSpec: tenantRow.openapi_spec,
    walletConfig: tenantRow.wallet_config,
    endpoints,
    tokenPrices: tokenPrices.map((tp) => ({
      ...tp,
      // SQLite returns integer columns as numbers; coerce to string to match
      // the production Postgres schema where amount is bigint (text).
      amount: normalizeAtomicAmount(tp.amount),
    })),
  });
}

type PricingRulesResult = {
  rules: PricingRule[];
  warnings: string[];
  additionalAssets: Record<string, unknown>;
};

type FixedPricePolicy = {
  kind: "fixed-price";
  scheme: "exact" | "flex";
  amount: string;
};

function buildPricingRuleFromFixedPricePolicy(
  policy: FixedPricePolicy,
): PricingRule {
  if (policy.scheme === "flex") {
    return {
      match: "true",
      authorize: policy.amount,
      capture: policy.amount,
    };
  }

  return { match: "true", capture: policy.amount };
}

function buildPricingRules(
  endpoint: EndpointRow,
  endpointPrices: TokenPriceRow[],
  tenantPrices: TokenPriceRow[],
  existingAssets: Record<string, unknown>,
  walletConfig: GatewayWalletConfig,
): PricingRulesResult {
  const result: PricingRulesResult = {
    rules: [],
    warnings: [],
    additionalAssets: {},
  };
  const scheme = endpoint.scheme;

  if (!isPricedX402Scheme(scheme)) {
    return result;
  }

  if (endpointPrices.length > 0) {
    // Endpoint-specific token prices take precedence
    for (const tp of endpointPrices) {
      const alias = `${tp.network}-${tp.token_symbol}`;
      if (!existingAssets[alias]) {
        // The caller merges additionalAssets into existingAssets after each
        // call, so assets validated by earlier endpoints are already present
        // and this branch is only reached for genuinely new network+token
        // combinations that need wallet address validation.
        const recipient = resolveWalletAddress(walletConfig, tp.network);
        if (!recipient) {
          result.warnings.push(
            `Endpoint ${endpoint.id}: token price references network "${tp.network}" but no wallet address is configured — rule for asset "${alias}" skipped`,
          );
          continue;
        }
        result.additionalAssets[alias] = {
          chain: tp.network,
          token: tp.mint_address,
          decimals: tp.decimals,
          recipient,
        };
      }
      result.rules.push(
        buildPricingRuleFromFixedPricePolicy({
          kind: "fixed-price",
          scheme,
          amount: normalizeAtomicAmount(tp.amount),
        }),
      );
    }
  } else if (tenantPrices.length > 0) {
    // Fall back to tenant-level token prices combined with endpoint.price
    if (endpoint.price === null) {
      result.warnings.push(
        `Endpoint ${endpoint.id}: no price multiplier configured — defaulting to 1x against tenant-level prices`,
      );
    }
    const endpointMultiplier = endpoint.price ?? 1;

    for (const tp of tenantPrices) {
      const alias = `${tp.network}-${tp.token_symbol}`;
      if (!existingAssets[alias]) {
        // Already warned when building assets
        continue;
      }
      // Scale the tenant-level token price amount by the endpoint multiplier
      const amount = normalizeAtomicAmount(tp.amount);
      const scaledAmount = scaleAtomicAmount(amount, endpointMultiplier);
      if (scaledAmount === "0" && endpointMultiplier !== 0) {
        result.warnings.push(
          `Endpoint ${endpoint.id}: scaled amount for asset "${alias}" rounds to 0 (amount=${amount}, multiplier=${endpointMultiplier})`,
        );
      }
      result.rules.push(
        buildPricingRuleFromFixedPricePolicy({
          kind: "fixed-price",
          scheme,
          amount: scaledAmount,
        }),
      );
    }
  }

  return result;
}
