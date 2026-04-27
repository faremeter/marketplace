import fs from "node:fs";
import os from "node:os";
import { wrap } from "@faremeter/fetch";
import { createPaymentHandler } from "@faremeter/payment-solana/exact";
import { createLocalWallet } from "@faremeter/wallet-solana";
import { assertLocalPaymentFunding } from "./local-payment-preflight.js";

const CONTROL_PLANE_BASE_URL =
  process.env.LOCAL_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:11337";
const DISCOVERY_BASE_URL =
  process.env.LOCAL_DISCOVERY_BASE_URL ?? "http://127.0.0.1:11339";
const UI_URL = process.env.LOCAL_UI_URL ?? "http://127.0.0.1:11338";
const PROXY_URL_A =
  process.env.LOCAL_PROXY_URL_A ??
  "http://demo-api.local.proxy.localhost:18080/v1/chat/completions";
const PROXY_HEALTH_URL_A =
  process.env.LOCAL_PROXY_HEALTH_URL_A ??
  "http://demo-api.local.proxy.localhost:18080/health";
const PROXY_URL_B =
  process.env.LOCAL_PROXY_URL_B ??
  "http://demo-api.local.proxy.localhost:18081/v1/chat/completions";
const PROXY_HEALTH_URL_B =
  process.env.LOCAL_PROXY_HEALTH_URL_B ??
  "http://demo-api.local.proxy.localhost:18081/health";
const ADMIN_EMAIL =
  process.env.LOCAL_ADMIN_EMAIL ?? "admin@local.faremeter.test";
const ADMIN_PASSWORD = process.env.LOCAL_ADMIN_PASSWORD ?? "localdev123";
const CLIENT_KEYPAIR = process.env.LOCAL_CLIENT_SOLANA_KEYPAIR;
const CLIENT_KEYPAIR_PATH =
  process.env.LOCAL_CLIENT_SOLANA_KEYPAIR_PATH ?? "~/.config/solana/id.json";
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const SOLANA_USDC_MINT =
  process.env.LOCAL_SOLANA_USDC_MINT ??
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SMOKE_ENDPOINT_PATH = `/v1/smoke/created-${Date.now()}`;

function expandHome(path: string): string {
  return path.startsWith("~/") ? `${os.homedir()}${path.slice(1)}` : path;
}

function readClientSecretKey(): Uint8Array {
  if (CLIENT_KEYPAIR?.trim()) {
    return Uint8Array.from(JSON.parse(CLIENT_KEYPAIR));
  }
  return Uint8Array.from(
    JSON.parse(fs.readFileSync(expandHome(CLIENT_KEYPAIR_PATH), "utf8")),
  );
}

type LoginResponse = {
  user: {
    organizations: {
      id: number;
      slug: string;
    }[];
  };
};

type OrganizationTenant = {
  id: number;
  name: string;
  status: string;
  nodes: { id: number }[];
};

type TransactionRecord = {
  id: number;
  endpoint_id?: number | null;
  request_path?: string | null;
};

type EndpointRecord = {
  id: number;
  path: string;
  path_pattern: string;
};

type EarningsAnalytics = {
  total_earned: number;
  current_month_earned: number;
  previous_month_earned: number;
  percent_change: number | null;
  total_transactions: number;
};

type AdminTransactionsResponse = {
  transactions: TransactionRecord[];
  total: number;
};

function controlPlaneHealthUrl(): string {
  return `${CONTROL_PLANE_BASE_URL}/health`;
}

function discoveryHealthUrl(): string {
  return `${DISCOVERY_BASE_URL}/health`;
}

async function waitFor(url: string, label: string): Promise<void> {
  const timeoutAt = Date.now() + 90_000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${label}`, { cause: lastError });
}

async function apiJson<T>(
  path: string,
  authCookie: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Cookie", authCookie);

  const response = await fetch(`${CONTROL_PLANE_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${init.method ?? "GET"} ${path} failed: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as T;
}

async function login(): Promise<{
  authCookie: string;
  organizationId: number;
}> {
  const response = await fetch(`${CONTROL_PLANE_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} ${text}`);
  }

  const rawCookie = response.headers.get("set-cookie");
  if (!rawCookie) {
    throw new Error("Login succeeded but auth cookie was not returned");
  }

  const authCookie = rawCookie.split(";")[0];
  if (!authCookie) {
    throw new Error("Could not parse auth cookie from login response");
  }

  const body = (await response.json()) as LoginResponse;
  const organization = body.user.organizations.find(
    (org) => org.slug === "local",
  );
  if (!organization) {
    throw new Error("Local development organization was not found after login");
  }

  return {
    authCookie,
    organizationId: organization.id,
  };
}

async function findDemoTenant(
  organizationId: number,
  authCookie: string,
): Promise<OrganizationTenant> {
  const tenants = await apiJson<OrganizationTenant[]>(
    `/api/organizations/${organizationId}/tenants`,
    authCookie,
  );

  const tenant = tenants.find((item) => item.name === "demo-api");
  if (!tenant) {
    throw new Error("Demo tenant was not found in the local organization");
  }

  if (tenant.status !== "active") {
    throw new Error(`Demo tenant is not active yet (status=${tenant.status})`);
  }

  if (tenant.nodes.length < 2) {
    throw new Error(
      `Demo tenant expected 2 nodes, found ${tenant.nodes.length}`,
    );
  }

  return tenant;
}

async function getTransactionCount(
  tenantId: number,
  authCookie: string,
): Promise<number> {
  const transactions = await apiJson<TransactionRecord[]>(
    `/api/tenants/${tenantId}/transactions`,
    authCookie,
  );
  return transactions.length;
}

async function createSmokeEndpoint(
  tenantId: number,
  authCookie: string,
): Promise<EndpointRecord> {
  const endpoint = await apiJson<EndpointRecord>(
    `/api/tenants/${tenantId}/endpoints`,
    authCookie,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: SMOKE_ENDPOINT_PATH,
        price: 1,
        scheme: "exact",
        description: "Local smoke endpoint created through the control plane",
        priority: 10,
        http_method: "POST",
        tags: ["smoke"],
      }),
    },
  );

  if (endpoint.path !== SMOKE_ENDPOINT_PATH) {
    throw new Error(`Unexpected smoke endpoint path: ${endpoint.path}`);
  }

  return endpoint;
}

async function waitForTransactionCount(
  tenantId: number,
  authCookie: string,
  minimumCount: number,
): Promise<number> {
  const timeoutAt = Date.now() + 60_000;

  while (Date.now() < timeoutAt) {
    const count = await getTransactionCount(tenantId, authCookie);
    if (count >= minimumCount) {
      return count;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for transactions to reach ${minimumCount} for tenant ${tenantId}`,
  );
}

async function waitForEndpointTransactions(
  tenantId: number,
  endpointId: number,
  authCookie: string,
  minimumCount: number,
): Promise<TransactionRecord[]> {
  const timeoutAt = Date.now() + 60_000;

  while (Date.now() < timeoutAt) {
    const transactions = await apiJson<TransactionRecord[]>(
      `/api/tenants/${tenantId}/endpoints/${endpointId}/transactions`,
      authCookie,
    );
    if (transactions.length >= minimumCount) {
      return transactions;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for endpoint ${endpointId} transactions to reach ${minimumCount}`,
  );
}

async function waitForEndpointAnalytics(
  tenantId: number,
  endpointId: number,
  authCookie: string,
  minimumCount: number,
): Promise<EarningsAnalytics> {
  const timeoutAt = Date.now() + 60_000;

  while (Date.now() < timeoutAt) {
    const analytics = await apiJson<EarningsAnalytics>(
      `/api/admin/tenants/${tenantId}/endpoints/${endpointId}/analytics`,
      authCookie,
    );
    if (analytics.total_transactions >= minimumCount) {
      return analytics;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for admin endpoint analytics on endpoint ${endpointId}`,
  );
}

function buildProxyRequest(): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "local-demo",
      messages: [{ role: "user", content: "hello" }],
    }),
  };
}

async function assertUnpaid(url: string): Promise<void> {
  const response = await fetch(url, buildProxyRequest());
  if (response.status !== 402) {
    throw new Error(
      `Expected unpaid proxy call to return 402 for ${url}, got ${response.status}`,
    );
  }
}

async function waitForUnpaid(url: string): Promise<void> {
  const timeoutAt = Date.now() + 60_000;
  let lastStatus: number | undefined;

  while (Date.now() < timeoutAt) {
    const response = await fetch(url, buildProxyRequest()).catch(
      () => undefined,
    );
    if (response?.status === 402) {
      return;
    }
    lastStatus = response?.status;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for ${url} to require payment; last status=${lastStatus ?? "request failed"}`,
  );
}

function proxyUrlFor(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function main() {
  const funding = await assertLocalPaymentFunding();

  await waitFor(controlPlaneHealthUrl(), "control-plane");
  await waitFor(discoveryHealthUrl(), "discovery");
  await waitFor(UI_URL, "control-plane-ui");
  await waitFor(PROXY_HEALTH_URL_A, "api-node-a");
  await waitFor(PROXY_HEALTH_URL_B, "api-node-b");

  const { authCookie, organizationId } = await login();
  const tenant = await findDemoTenant(organizationId, authCookie);
  const initialTransactionCount = await getTransactionCount(
    tenant.id,
    authCookie,
  );
  const createdEndpoint = await createSmokeEndpoint(tenant.id, authCookie);
  const createdProxyUrlA = proxyUrlFor(PROXY_URL_A, createdEndpoint.path);
  const createdProxyUrlB = proxyUrlFor(PROXY_URL_B, createdEndpoint.path);

  await assertUnpaid(PROXY_URL_A);
  await assertUnpaid(PROXY_URL_B);
  await waitForUnpaid(createdProxyUrlA);
  await waitForUnpaid(createdProxyUrlB);

  const wallet = await createLocalWallet("devnet", readClientSecretKey());
  const x402Fetch = wrap(fetch, {
    handlers: [
      createPaymentHandler(
        wallet,
        SOLANA_USDC_MINT as Parameters<typeof createPaymentHandler>[1],
        SOLANA_RPC_URL,
      ),
    ],
    retryCount: 0,
  });

  const paidResponseA = await x402Fetch(PROXY_URL_A, buildProxyRequest());
  if (!paidResponseA.ok) {
    throw new Error(
      `Expected paid proxy call to node A to succeed, got ${paidResponseA.status}`,
    );
  }

  const paidBodyA = (await paidResponseA.json()) as Record<string, unknown>;

  const paidResponseB = await x402Fetch(PROXY_URL_B, buildProxyRequest());
  if (!paidResponseB.ok) {
    throw new Error(
      `Expected paid proxy call to node B to succeed, got ${paidResponseB.status}`,
    );
  }

  const paidBodyB = (await paidResponseB.json()) as Record<string, unknown>;
  const createdResponseA = await x402Fetch(
    createdProxyUrlA,
    buildProxyRequest(),
  );
  if (!createdResponseA.ok) {
    throw new Error(
      `Expected paid created endpoint call to node A to succeed, got ${createdResponseA.status}`,
    );
  }

  const createdBodyA = (await createdResponseA.json()) as Record<
    string,
    unknown
  >;

  const createdResponseB = await x402Fetch(
    createdProxyUrlB,
    buildProxyRequest(),
  );
  if (!createdResponseB.ok) {
    throw new Error(
      `Expected paid created endpoint call to node B to succeed, got ${createdResponseB.status}`,
    );
  }

  const createdBodyB = (await createdResponseB.json()) as Record<
    string,
    unknown
  >;
  const finalTransactionCount = await waitForTransactionCount(
    tenant.id,
    authCookie,
    initialTransactionCount + 4,
  );
  const createdEndpointTransactions = await waitForEndpointTransactions(
    tenant.id,
    createdEndpoint.id,
    authCookie,
    2,
  );
  const endpointAnalytics = await waitForEndpointAnalytics(
    tenant.id,
    createdEndpoint.id,
    authCookie,
    2,
  );
  const tenantAnalytics = await apiJson<EarningsAnalytics>(
    `/api/admin/tenants/${tenant.id}/analytics`,
    authCookie,
  );
  if (tenantAnalytics.total_transactions < finalTransactionCount) {
    throw new Error(
      `Expected admin tenant analytics to include at least ${finalTransactionCount} transactions, got ${tenantAnalytics.total_transactions}`,
    );
  }

  const adminTransactions = await apiJson<AdminTransactionsResponse>(
    "/api/admin/transactions?limit=25",
    authCookie,
  );
  const observedCreatedTransactions = adminTransactions.transactions.filter(
    (transaction) => transaction.endpoint_id === createdEndpoint.id,
  );
  if (observedCreatedTransactions.length < 2) {
    throw new Error(
      `Expected admin transactions to include 2 created endpoint transactions, found ${observedCreatedTransactions.length}`,
    );
  }

  process.stdout.write(
    JSON.stringify(
      {
        status: "ok",
        organizationId,
        tenantId: tenant.id,
        createdEndpointId: createdEndpoint.id,
        initialTransactionCount,
        finalTransactionCount,
        createdEndpointTransactionCount: createdEndpointTransactions.length,
        endpointAnalytics,
        tenantAnalytics,
        funding: {
          facilitator: funding.facilitator.address,
          client: funding.client.address,
        },
        paidNodeA: paidBodyA,
        paidNodeB: paidBodyB,
        createdNodeA: createdBodyA,
        createdNodeB: createdBodyB,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
}

await main();
